import os
from datetime import datetime, timedelta, timezone

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["ENVIRONMENT"] = "test"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import get_db
from app.main import app
from app.models.base import Base


@pytest.fixture()
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    @event.listens_for(engine, "connect")
    def foreign_keys(connection, record):
        connection.execute("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    def override_db():
        with factory() as session:
            yield session
    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        test_client.session_factory = factory
        yield test_client
    app.dependency_overrides.clear()
    engine.dispose()


def account(client, name):
    result = client.post("/register", json={"email": f"{name}@example.com", "password": "test-password-123"})
    assert result.status_code == 201, result.text
    return {"Authorization": "Bearer " + result.json()["access_token"]}


def create_project(client, team, owner, name="Launch"):
    response = client.post(f"/teams/{team['id']}/projects", headers=owner, json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture()
def setup(client):
    admin = account(client, "admin")
    member = account(client, "member")
    outsider = account(client, "outsider")
    team = client.post("/teams", headers=admin, json={"name": "Product team", "key": "ZEN"}).json()
    create_project(client, team, admin)
    joined = client.post("/teams/join", headers=member, json={"code": team["invite_code"]})
    assert joined.status_code == 200
    assert joined.json()["invite_code"] is None
    return admin, member, outsider, team


def test_members_share_tasks_but_other_teams_are_isolated(client, setup):
    admin, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    member_id = client.get("/me", headers=member).json()["id"]
    issue = client.post(root + "/issues", headers=admin, json={"title": "Shared work", "status": "scheduled", "assignee_id": member_id}).json()
    assert client.get(root + "/workspace", headers=member).json()["issues"][0]["title"] == "Shared work"
    for status in ["ongoing", "review", "completed"]:
        assert client.patch(root + f"/issues/{issue['id']}/status", headers=member, json={"status": status}).json()["status"] == status
    assert client.post(root + f"/issues/{issue['id']}/comments", headers=member, json={"body": "Ready for review"}).status_code == 201
    state = client.get(root + "/workspace", headers=admin).json()
    assert state["comments"][0]["body"] == "Ready for review"
    assert state["issues"][0]["status"] == "completed"
    assert client.get(root + "/workspace", headers=outsider).status_code == 404
    assert client.patch(root + f"/issues/{issue['id']}/status", headers=outsider, json={"status": "ongoing"}).status_code == 404
    assert client.delete(root + f"/issues/{issue['id']}", headers=outsider).status_code == 404
    assert client.get(root + "/workspace").status_code == 401
    other_team = client.post("/teams", headers=outsider, json={"name": "Other team", "key": "OTHER"}).json()
    assert client.put(f"/teams/{other_team['id']}/issues/{issue['id']}", headers=outsider, json={"title": "Stolen"}).status_code == 404
    assert client.post(f"/teams/{other_team['id']}/issues/{issue['id']}/comments", headers=outsider, json={"body": "No access"}).status_code == 404
    # Personal tasks stay private and separate from team tasks.
    assert client.get("/tasks", headers=member).json() == []


def test_sprint_lifecycle_rollover_and_delivery_history(client, setup):
    admin, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    payload = {"name": "Sprint 1", "goal": "Ship the board", "start_date": "2026-10-09", "end_date": "2026-10-23"}
    assert client.post(root + "/sprints", headers=member, json=payload).status_code == 403
    assert client.post(root + "/sprints", headers=admin, json={**payload, "end_date": "2026-10-01"}).status_code == 422
    sprint = client.post(root + "/sprints", headers=admin, json=payload).json()
    second = client.post(root + "/sprints", headers=admin, json={**payload, "name": "Sprint 2"}).json()
    assert client.patch(root + f"/sprints/{sprint['id']}", headers=member, json={"status": "active"}).status_code == 403
    assert client.patch(root + f"/sprints/{sprint['id']}", headers=admin, json={"status": "active"}).status_code == 200
    assert client.patch(root + f"/sprints/{second['id']}", headers=admin, json={"status": "active"}).status_code == 409
    done = client.post(root + "/issues", headers=member, json={"title": "Delivered", "sprint_id": sprint["id"], "status": "completed", "points": 5}).json()
    pending = client.post(root + "/issues", headers=admin, json={"title": "Still in progress", "sprint_id": sprint["id"], "status": "ongoing"}).json()
    closed = client.patch(root + f"/sprints/{sprint['id']}", headers=admin, json={"status": "completed", "retrospective": "Smaller stories next time"})
    assert closed.status_code == 200
    state = client.get(root + "/workspace", headers=member).json()
    tasks = {i["id"]: i for i in state["issues"]}
    assert tasks[pending["id"]]["status"] == "backlog"
    assert tasks[pending["id"]]["sprint_id"] is None
    assert tasks[done["id"]]["sprint_id"] == sprint["id"]
    assert client.patch(root + f"/issues/{done['id']}/status", headers=admin, json={"status": "ongoing"}).status_code == 409
    assert client.delete(root + f"/issues/{done['id']}", headers=admin).status_code == 409
    assert client.put(root + f"/issues/{done['id']}", headers=admin, json={"title": "Changed", "status": "completed"}).status_code == 409
    assert client.patch(root + f"/sprints/{sprint['id']}", headers=admin, json={"status": "active"}).status_code == 409
    assert client.patch(root + f"/sprints/{second['id']}", headers=admin, json={"status": "active"}).status_code == 200


def test_foreign_relations_and_invalid_inputs_rejected(client, setup):
    admin, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    outsider_id = client.get("/me", headers=outsider).json()["id"]
    for invalid in [{"assignee_id": outsider_id}, {"sprint_id": 9999}, {"points": -2}, {"status": "bad"}, {"priority": "wrong"}, {"title": "   "}, {"team_id": 999}]:
        response = client.post(root + "/issues", headers=member, json={"title": "Task", **invalid})
        assert response.status_code == 422, response.text
    foreign_team = client.post("/teams", headers=outsider, json={"name": "Private", "key": "PRV"}).json()
    create_project(client, foreign_team, outsider, "Private project")
    sprint = client.post(f"/teams/{foreign_team['id']}/sprints", headers=outsider, json={"name": "Private sprint", "start_date": "2026-10-09", "end_date": "2026-10-20"}).json()
    assert client.post(root + "/issues", headers=member, json={"title": "Task", "sprint_id": sprint["id"], "status": "scheduled"}).status_code == 422


def test_csv_import_is_atomic_and_handles_quoted_fields(client, setup):
    admin, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    bad = client.post(root + "/import", headers=member, json={"csv": "title,points\nValid,3\nInvalid,-1"})
    assert bad.status_code == 422
    assert client.get(root + "/workspace", headers=admin).json()["issues"] == []
    result = client.post(root + "/import", headers=member, json={"csv": '\ufefftitle,status,points\n"Design, build",scheduled,5\nShip,completed,3'})
    assert result.status_code == 201, result.text
    assert result.json()["imported"] == 2
    state = client.get(root + "/workspace", headers=admin).json()
    assert state["issues"][0]["title"] == "Design, build"
    assert client.post(root + "/import", headers=outsider, json={"csv": "title\nIntrusion"}).status_code == 404
    assert client.post(root + "/import", headers=admin, json={"csv": "title\n" + "Task\n" * 201}).status_code == 422
    assert len(client.get(root + "/workspace", headers=admin).json()["issues"]) == 2


def test_invite_rotation_and_idempotent_join(client, setup):
    admin, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    assert client.post(root + "/rotate-invite", headers=member).status_code == 403
    assert client.post("/teams/join", headers=member, json={"code": team["invite_code"]}).status_code == 200
    assert len(client.get(root + "/workspace", headers=admin).json()["members"]) == 2
    new_code = client.post(root + "/rotate-invite", headers=admin).json()["invite_code"]
    assert new_code != team["invite_code"]
    assert client.post("/teams/join", headers=outsider, json={"code": team["invite_code"]}).status_code == 404
    assert client.post("/teams/join", headers=outsider, json={"code": new_code}).status_code == 200


def test_plain_language_csv_and_title_only_tasks(client, setup):
    admin, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    response = client.post(root + "/import", headers=member, json={"csv": "Task,Status,Due date,Notes\nPrepare slides,To do,2026-10-20,Add photos\nBook room,Doing,,\nSend agenda,Done,,\nNext event,Later,,"})
    assert response.status_code == 201, response.text
    assert response.json()["imported"] == 4
    issues = client.get(root + "/workspace", headers=admin).json()["issues"]
    assert [i["status"] for i in issues] == ["scheduled", "ongoing", "completed", "backlog"]
    assert issues[0]["description"] == "Add photos"
    assert issues[0]["due_date"] == "2026-10-20"
    assert client.post(root + "/import", headers=member, json={"csv": "Task\nJust a title"}).status_code == 201
    issue = client.get(root + "/workspace", headers=admin).json()["issues"][-1]
    assert issue["status"] == "scheduled"
    assert issue["sprint_id"] is None
    assert client.post(root + "/import", headers=member, json={"csv": "Task,title\nDuplicate,Duplicate"}).status_code == 422


def test_task_edit_delete_and_personal_regression(client, setup):
    admin, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    issue = client.post(root + "/issues", headers=member, json={"title": "First version"}).json()
    result = client.put(root + f"/issues/{issue['id']}", headers=admin, json={"title": "Updated", "status": "scheduled", "points": 8, "acceptance_criteria": "All checks pass"})
    assert result.status_code == 200
    assert result.json()["points"] == 8
    client.post(root + f"/issues/{issue['id']}/comments", headers=member, json={"body": "Discuss"})
    assert client.delete(root + f"/issues/{issue['id']}", headers=member).status_code == 204
    assert client.get(root + "/workspace", headers=admin).json()["comments"] == []
    folder = client.post("/categories", headers=admin, json={"name": "My work"}).json()
    task_list = client.post("/subbranches", headers=admin, json={"name": "This week", "category_id": folder["id"]}).json()
    personal = client.post("/tasks", headers=admin, json={"title": "Personal task", "category_id": folder["id"], "subbranch_id": task_list["id"]})
    assert personal.status_code == 201, personal.text
    assert client.get("/tasks", headers=member).json() == []
    assert client.get("/dashboard/stats", headers=admin).status_code == 200
    assert client.patch(f"/tasks/{personal.json()['id']}/complete", headers=admin, json={"completed": True}).json()["completed"] is True


def test_new_personal_workspace_starts_empty_and_people_create_their_own_structure(client):
    owner = account(client, "blank_start")
    other = account(client, "another_blank_start")
    assert client.get("/categories", headers=owner).json() == []
    assert client.get("/tasks", headers=owner).json() == []
    assert client.get("/teams", headers=owner).json() == []
    assert client.get("/dashboard/stats", headers=owner).status_code == 200
    response = client.post("/categories", headers=owner, json={"name": "Home projects"})
    assert response.status_code == 201, response.text
    folder = response.json()
    assert client.get(f"/subbranches/{folder['id']}", headers=owner).json() == []
    response = client.post("/subbranches", headers=owner, json={"name": "Garden", "category_id": folder["id"], "notes": "Weekend ideas"})
    assert response.status_code == 201, response.text
    task_list = response.json()
    response = client.post("/tasks", headers=owner, json={"title": "Buy seeds", "category_id": folder["id"], "subbranch_id": task_list["id"]})
    assert response.status_code == 201, response.text
    assert [f["name"] for f in client.get("/categories", headers=owner).json()] == ["Home projects"]
    assert client.get(f"/subbranches/{folder['id']}", headers=owner).json()[0]["notes"] == "Weekend ideas"
    assert [t["title"] for t in client.get("/tasks", headers=owner).json()] == ["Buy seeds"]
    assert client.get("/categories", headers=other).json() == []
    assert client.get(f"/subbranches/{folder['id']}", headers=other).status_code == 404
    assert client.get("/tasks", headers=other).json() == []
    # Signing in again must not silently recreate the old sample folders and lists.
    login = client.post("/login", json={"email": "blank_start@example.com", "password": "test-password-123"})
    assert login.status_code == 200
    again = {"Authorization": "Bearer " + login.json()["access_token"]}
    assert [f["name"] for f in client.get("/categories", headers=again).json()] == ["Home projects"]


def test_space_projects_are_shared_and_owned_by_the_creator(client, setup):
    admin, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    owner_id = client.get("/me", headers=admin).json()["id"]
    state = client.get(root + "/workspace", headers=member).json()
    assert team["owner_id"] == owner_id
    assert state["team"]["owner_id"] == owner_id
    assert [(p["name"], p["team_id"]) for p in state["projects"]] == [("Launch", team["id"])]
    assert client.post(root + "/projects", headers=member, json={"name": "Unauthorized"}).status_code == 403
    project = client.post(root + "/projects", headers=admin, json={"name": "Website", "description": "Launch our site"})
    assert project.status_code == 201, project.text
    project = project.json()
    issue = client.post(root + "/issues", headers=member, json={"title": "Write copy", "project_id": project["id"]})
    assert issue.status_code == 201, issue.text
    assert issue.json()["project_id"] == project["id"]
    shared = client.get(root + "/workspace", headers=member).json()
    assert {p["name"] for p in shared["projects"]} == {"Launch", "Website"}
    assert shared["issues"][0]["id"] == issue.json()["id"]
    assert {t["id"] for t in client.get("/teams", headers=member).json()} == {team["id"]}
    assert client.get("/teams", headers=outsider).json() == []
    # Old API clients use the first existing project; omitted project during edit preserves its location.
    default_task = client.post(root + "/issues", headers=admin, json={"title": "Default project"}).json()
    assert default_task["project_id"] == state["projects"][0]["id"]
    updated = client.put(root + f"/issues/{issue.json()['id']}", headers=member, json={"title": "Write the homepage"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["project_id"] == project["id"]
    assert client.put(root + f"/issues/{issue.json()['id']}", headers=member, json={"title": "Move task", "project_id": default_task["project_id"]}).status_code == 422


def test_new_space_stays_empty_until_the_owner_creates_a_project(client):
    owner = account(client, "empty_space_owner")
    member = account(client, "empty_space_member")
    response = client.post("/teams", headers=owner, json={"name": "Our space", "key": "OUR"})
    assert response.status_code == 201, response.text
    team = response.json()
    root = f"/teams/{team['id']}"
    assert client.post("/teams/join", headers=member, json={"code": team["invite_code"]}).status_code == 200
    for user in [owner, member]:
        state = client.get(root + "/workspace", headers=user).json()
        assert state["projects"] == []
        assert state["issues"] == []
        assert state["sprints"] == []
    requests = [
        ("/issues", {"title": "Wait for a project"}, member),
        ("/sprints", {"name": "First plan", "start_date": "2026-10-10", "end_date": "2026-10-17"}, owner),
        ("/import", {"csv": "Task\nImported task"}, member),
    ]
    for route, payload, user in requests:
        response = client.post(root + route, headers=user, json=payload)
        assert response.status_code == 422, response.text
        assert response.json()["detail"] == "Create a project in this space before adding tasks or work plans"
    assert client.post(root + "/projects", headers=member, json={"name": "Not allowed"}).status_code == 403
    assert client.post(root + "/issues", headers=owner, json={"title": "Unknown project", "project_id": 99999}).status_code == 422
    assert client.get(root + "/workspace", headers=owner).json()["projects"] == []
    project = create_project(client, team, owner, "Our first project")
    for route, payload, user in requests:
        response = client.post(root + route, headers=user, json=payload)
        assert response.status_code == 201, response.text
    state = client.get(root + "/workspace", headers=member).json()
    assert [(item["id"], item["name"]) for item in state["projects"]] == [(project["id"], "Our first project")]
    assert {issue["project_id"] for issue in state["issues"]} == {project["id"]}
    assert {plan["project_id"] for plan in state["sprints"]} == {project["id"]}
    assert len(state["issues"]) == 2
    assert len(state["sprints"]) == 1


def test_each_project_runs_its_own_plan_and_cannot_mix_tasks(client, setup):
    admin, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    first_project = client.get(root + "/workspace", headers=admin).json()["projects"][0]
    second_project = client.post(root + "/projects", headers=admin, json={"name": "Mobile app"}).json()
    payload = {"name": "Launch", "start_date": "2026-10-09", "end_date": "2026-10-23"}
    plans = [client.post(root + "/sprints", headers=admin, json={**payload, "project_id": project["id"]}).json() for project in [first_project, second_project]]
    for plan in plans:
        response = client.patch(root + f"/sprints/{plan['id']}", headers=admin, json={"status": "active"})
        assert response.status_code == 200, response.text
    extra_plan = client.post(root + "/sprints", headers=admin, json={**payload, "project_id": second_project["id"]}).json()
    assert client.patch(root + f"/sprints/{extra_plan['id']}", headers=admin, json={"status": "active"}).status_code == 409
    first_task = client.post(root + "/issues", headers=member, json={"title": "General work", "project_id": first_project["id"], "sprint_id": plans[0]["id"], "status": "ongoing"}).json()
    second_task = client.post(root + "/issues", headers=member, json={"title": "Mobile work", "project_id": second_project["id"], "sprint_id": plans[1]["id"], "status": "ongoing"}).json()
    assert client.post(root + "/issues", headers=member, json={"title": "Mixed project", "project_id": first_project["id"], "sprint_id": plans[1]["id"], "status": "scheduled"}).status_code == 422
    assert client.put(root + f"/issues/{second_task['id']}", headers=member, json={"title": "Wrong plan", "sprint_id": plans[0]["id"], "status": "scheduled"}).status_code == 422
    # Completing one project's plan must not affect another project's active work.
    assert client.patch(root + f"/sprints/{plans[0]['id']}", headers=admin, json={"status": "completed"}).status_code == 200
    state = client.get(root + "/workspace", headers=member).json()
    issues = {i["id"]: i for i in state["issues"]}
    assert issues[first_task["id"]]["status"] == "backlog"
    assert issues[first_task["id"]]["project_id"] == first_project["id"]
    assert issues[second_task["id"]]["status"] == "ongoing"
    assert issues[second_task["id"]]["sprint_id"] == plans[1]["id"]
    assert next(s for s in state["sprints"] if s["id"] == plans[1]["id"])["status"] == "active"


def test_project_scoped_csv_import_and_foreign_project_rejection(client, setup):
    admin, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    project = client.post(root + "/projects", headers=admin, json={"name": "Events"}).json()
    foreign = client.post("/teams", headers=outsider, json={"name": "Private space", "key": "PVT"}).json()
    foreign_project = create_project(client, foreign, outsider, "Private project")
    plan = {"name": "Plan", "start_date": "2026-10-09", "end_date": "2026-10-23"}
    for project_id in [foreign_project["id"], 99999]:
        for route, payload in [("/issues", {"title": "Intrusion"}), ("/sprints", plan), ("/import", {"csv": "Task\nIntrusion"})]:
            response = client.post(root + route, headers=admin, json={**payload, "project_id": project_id})
            assert response.status_code == 422, response.text
    assert client.post(root + "/import", headers=member, json={"project_id": project["id"], "csv": "Task,Status\nBook room,Doing\nSend invite,To do"}).status_code == 201
    issues = client.get(root + "/workspace", headers=member).json()["issues"]
    assert len(issues) == 2
    assert {i["project_id"] for i in issues} == {project["id"]}


def test_all_space_endpoints_require_current_membership(client, setup):
    admin, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    member_id = client.get("/me", headers=member).json()["id"]
    issue = client.post(root + "/issues", headers=admin, json={"title": "Private work"}).json()
    plan_payload = {"name": "Plan", "start_date": "2026-10-09", "end_date": "2026-10-23"}
    plan = client.post(root + "/sprints", headers=admin, json=plan_payload).json()
    requests = [
        ("PUT", "", {"name": "Intrusion", "description": "Not allowed"}),
        ("GET", "/workspace", None),
        ("POST", "/projects", {"name": "Intrusion"}),
        ("POST", "/rotate-invite", None),
        ("DELETE", f"/members/{member_id}", None),
        ("POST", "/sprints", plan_payload),
        ("PATCH", f"/sprints/{plan['id']}", {"status": "active"}),
        ("POST", "/issues", {"title": "Intrusion"}),
        ("PUT", f"/issues/{issue['id']}", {"title": "Intrusion"}),
        ("PATCH", f"/issues/{issue['id']}/status", {"status": "completed"}),
        ("DELETE", f"/issues/{issue['id']}", None),
        ("POST", f"/issues/{issue['id']}/comments", {"body": "Intrusion"}),
        ("POST", "/import", {"csv": "Task\nIntrusion"}),
    ]
    for method, path, payload in requests:
        response = client.request(method, root + path, headers=outsider, json=payload)
        assert response.status_code == 404, (method, path, response.text)
        response = client.request(method, root + path, json=payload)
        assert response.status_code == 401, (method, path, response.text)
    own_space = client.post("/teams", headers=outsider, json={"name": "Own space", "key": "OWN"}).json()
    own_root = f"/teams/{own_space['id']}"
    for method, path, payload in requests:
        if path.startswith(f"/issues/{issue['id']}") or path.startswith(f"/sprints/{plan['id']}"):
            response = client.request(method, own_root + path, headers=outsider, json=payload)
            assert response.status_code == 404, (method, path, response.text)
    state = client.get(root + "/workspace", headers=admin).json()
    assert state["issues"][0]["title"] == "Private work"
    assert state["comments"] == []
    assert len(state["members"]) == 2


def test_invite_preview_login_join_and_expiration(client, setup):
    from app.models.team import Team

    admin, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    preview_url = f"/teams/invites/{team['invite_code']}"
    preview = client.get(preview_url)
    assert preview.status_code == 200, preview.text
    assert set(preview.json()) == {"id", "name", "invite_expires_at"}
    assert preview.json()["name"] == team["name"]
    expiry = datetime.fromisoformat(preview.json()["invite_expires_at"].replace("Z", "+00:00"))
    expiry = expiry.replace(tzinfo=timezone.utc) if expiry.tzinfo is None else expiry
    assert timedelta(days=6, hours=23) < expiry - datetime.now(timezone.utc) <= timedelta(days=7, minutes=1)
    assert client.post("/teams/join", json={"code": team["invite_code"]}).status_code == 401
    assert client.get("/teams", headers=outsider).json() == []
    assert client.post("/login", json={"email": "outsider@example.com", "password": "wrong"}).status_code == 401
    login = client.post("/login", json={"email": "outsider@example.com", "password": "test-password-123"})
    assert login.status_code == 200
    logged_in = {"Authorization": "Bearer " + login.json()["access_token"]}
    assert client.post("/teams/join", headers=logged_in, json={"code": team["invite_code"]}).status_code == 200
    assert client.get(root + "/workspace", headers=logged_in).status_code == 200
    with client.session_factory() as db:
        db.get(Team, team["id"]).invite_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    assert client.get(preview_url).status_code == 410
    new_user = account(client, "new_person")
    assert client.post("/teams/join", headers=new_user, json={"code": team["invite_code"]}).status_code == 410
    # The link expires, not the memberships of people who already joined.
    assert client.get(root + "/workspace", headers=member).status_code == 200
    replacement = client.post(root + "/rotate-invite", headers=admin).json()
    assert client.get(preview_url).status_code == 404
    assert client.get(f"/teams/invites/{replacement['invite_code']}").status_code == 200
    assert client.post("/teams/join", headers=new_user, json={"code": replacement["invite_code"]}).status_code == 200


def test_member_removal_revokes_access_and_previous_invites_immediately(client, setup):
    admin, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    member_id = client.get("/me", headers=member).json()["id"]
    owner_id = client.get("/me", headers=admin).json()["id"]
    task = client.post(root + "/issues", headers=member, json={"title": "Keep shared history", "assignee_id": member_id}).json()
    client.post(root + f"/issues/{task['id']}/comments", headers=member, json={"body": "Keep this discussion"})
    assert client.delete(root + f"/members/{owner_id}", headers=member).status_code == 403
    assert client.delete(root + f"/members/{member_id}", headers=member).status_code == 403
    assert client.delete(root + f"/members/{owner_id}", headers=admin).status_code == 409
    assert client.delete(root + f"/members/{member_id}", headers=admin).status_code == 204
    assert client.get(root + "/workspace", headers=member).status_code == 404
    assert client.get("/teams", headers=member).json() == []
    assert client.patch(root + f"/issues/{task['id']}/status", headers=member, json={"status": "completed"}).status_code == 404
    assert client.post(root + "/import", headers=member, json={"csv": "Task\nAccess after removal"}).status_code == 404
    assert client.post("/teams/join", headers=member, json={"code": team["invite_code"]}).status_code == 404
    assert client.get(f"/teams/invites/{team['invite_code']}").status_code == 404
    # Removing a membership preserves accounts, past authorship, and other spaces.
    assert client.get("/me", headers=member).status_code == 200
    state = client.get(root + "/workspace", headers=admin).json()
    assert len(state["members"]) == 1
    assert state["issues"][0]["title"] == "Keep shared history"
    assert state["comments"][0]["body"] == "Keep this discussion"
    assert state["team"]["invite_code"] != team["invite_code"]
    assert client.post("/teams/join", headers=member, json={"code": state["team"]["invite_code"]}).status_code == 200


def test_owner_authority_cannot_be_obtained_from_a_membership_role(client, setup):
    from sqlalchemy import select
    from app.models.team import Membership

    admin, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    member_id = client.get("/me", headers=member).json()["id"]
    owner_id = client.get("/me", headers=admin).json()["id"]
    # A stale legacy admin role must not create a second space owner.
    with client.session_factory() as db:
        db.scalar(select(Membership).where(Membership.team_id == team["id"], Membership.user_id == member_id)).role = "admin"
        db.commit()
    assert client.post(root + "/projects", headers=member, json={"name": "Cannot create"}).status_code == 403
    assert client.post(root + "/rotate-invite", headers=member).status_code == 403
    assert client.put(root, headers=member, json={"name": "Cannot rename", "description": ""}).status_code == 403
    assert client.delete(root + f"/members/{owner_id}", headers=member).status_code == 403
    assert client.get(root + "/workspace", headers=member).json()["team"]["invite_code"] is None
    assert client.get(root + "/workspace", headers=admin).json()["team"]["owner_id"] == owner_id


def test_expired_or_invalid_login_token_cannot_read_spaces(client, setup):
    from app.core.security import create_access_token

    admin, member, outsider, team = setup
    member_id = client.get("/me", headers=member).json()["id"]
    expired = create_access_token(member_id, expires_delta=timedelta(seconds=-10))
    for token in [expired, "not-a-valid-token", create_access_token("not-a-user-id"), create_access_token(99999)]:
        headers = {"Authorization": "Bearer " + token}
        assert client.get("/teams", headers=headers).status_code == 401
        assert client.get(f"/teams/{team['id']}/workspace", headers=headers).status_code == 401
        assert client.post("/teams/join", headers=headers, json={"code": team["invite_code"]}).status_code == 401


def test_space_owner_can_change_name_and_description_without_changing_access_or_projects(client, setup):
    admin, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    member_id = client.get("/me", headers=member).json()["id"]
    before = client.get(root + "/workspace", headers=admin).json()
    project = client.post(root + "/projects", headers=admin, json={"name": "Events", "description": "Keep this project"}).json()
    issue = client.post(root + "/issues", headers=member, json={"title": "Keep this task", "project_id": project["id"]}).json()
    payload = {"name": "Our studio", "description": "A shared place for our website and events."}
    assert client.put(root, headers=member, json=payload).status_code == 403
    assert client.put(root, headers=outsider, json=payload).status_code == 404
    assert client.put(root, json=payload).status_code == 401
    response = client.put(root, headers=admin, json=payload)
    assert response.status_code == 200, response.text
    changed = response.json()
    assert changed["name"] == payload["name"]
    assert changed["description"] == payload["description"]
    for field in ["id", "key", "owner_id", "invite_code", "invite_expires_at"]:
        assert changed[field] == before["team"][field]
    shared = client.get(root + "/workspace", headers=member).json()
    assert shared["team"]["name"] == payload["name"]
    assert shared["team"]["description"] == payload["description"]
    assert {p["id"] for p in shared["projects"]} == {before["projects"][0]["id"], project["id"]}
    assert shared["issues"][0]["id"] == issue["id"]
    assert {m["id"] for m in shared["members"]} == {team["owner_id"], member_id}
    assert client.get("/teams", headers=member).json()[0]["description"] == payload["description"]
    assert client.get(f"/teams/invites/{team['invite_code']}").json()["name"] == payload["name"]
    for forbidden in [{"key": "NEW"}, {"owner_id": member_id}, {"invite_code": "replace-the-code"}]:
        assert client.put(root, headers=admin, json={**payload, **forbidden}).status_code == 422
    for invalid in [{"name": " "}, {"name": "x" * 101}, {"description": "x" * 2001}]:
        assert client.put(root, headers=admin, json={**payload, **invalid}).status_code == 422
    assert client.get(root + "/workspace", headers=admin).json()["team"] == changed
    assert client.delete(root + f"/members/{member_id}", headers=admin).status_code == 204
    assert client.put(root, headers=member, json=payload).status_code == 404
