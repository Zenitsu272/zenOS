from test_team_workspaces import account, client, create_project, setup


def test_leave_is_self_only_scoped_and_preserves_completed_work(client, setup):
    owner, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    project = client.get(root + "/workspace", headers=owner).json()["projects"][0]
    member_id = client.get("/me", headers=member).json()["id"]
    other = create_project(client, team, owner, "Other project")
    client.post(f"{root}/projects/{other['id']}/join", headers=member)
    tasks = []
    for project_id, status in [(project['id'], 'ongoing'), (project['id'], 'completed'), (other['id'], 'ongoing')]:
        response = client.post(root + '/issues', headers=owner, json={'title': 'Keep work', 'project_id': project_id, 'status': status, 'assignee_id': member_id})
        assert response.status_code == 201
        tasks.append(response.json())
    path = f"{root}/projects/{project['id']}/membership"
    assert client.delete(path, headers=outsider).status_code == 404
    assert client.delete(path).status_code == 401
    assert client.delete(path, headers=member).status_code == 204
    assert client.delete(path, headers=member).status_code == 204
    state = client.get(root + '/workspace', headers=member).json()
    saved = {i['id']: i for i in state['issues']}
    assert saved[tasks[0]['id']]['assignee_id'] is None
    assert saved[tasks[1]['id']]['assignee_id'] == member_id
    assert saved[tasks[2]['id']]['assignee_id'] == member_id
    assert state['project_memberships'] == [{'project_id': other['id'], 'user_id': member_id}]
    assert len(state['members']) == 2
    assert client.post(root + '/issues', headers=owner, json={'title': 'Invalid assignment', 'project_id': project['id'], 'assignee_id': member_id}).status_code == 422
    assert client.post(f"{root}/projects/{project['id']}/join", headers=member).status_code == 200
    assert client.post(root + '/issues', headers=owner, json={'title': 'Joined again', 'project_id': project['id'], 'assignee_id': member_id}).status_code == 201


def test_owner_can_remove_populated_project_without_touching_other_projects(client, setup):
    from test_project_meetings import create_meeting
    from app.models.team import IssueComment, Meeting, MeetingTaskUpdate, ProjectMembership, Sprint
    from sqlalchemy import select

    owner, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    project = client.get(root + '/workspace', headers=owner).json()['projects'][0]
    other = create_project(client, team, owner, 'Keep this project')
    keep = client.post(root + '/issues', headers=owner, json={'title': 'Keep this task', 'project_id': other['id']}).json()
    sprint = client.post(root + '/sprints', headers=owner, json={'name': 'Plan', 'project_id': project['id'], 'start_date': '2026-10-10', 'end_date': '2026-10-20'}).json()
    client.patch(root + f"/sprints/{sprint['id']}", headers=owner, json={'status': 'active'})
    created = client.post(root + '/issues', headers=member, json={'title': 'Project task', 'project_id': project['id'], 'sprint_id': sprint['id'], 'status': 'scheduled'})
    assert created.status_code == 201, created.text
    task = created.json()
    client.post(root + f"/issues/{task['id']}/comments", headers=member, json={'body': 'Discussion'})
    meetings = f"{root}/projects/{project['id']}/meetings"
    meeting = create_meeting(client, meetings, member)
    review = client.post(meetings + f"/{meeting['id']}/review", headers=member, json={'notes': 'Keep record until project removal', 'complete': True, 'task_updates': [{'issue_id': task['id'], 'status': 'completed'}]})
    assert review.status_code == 200
    path = f"{root}/projects/{project['id']}"
    assert client.delete(path, headers=member).status_code == 403
    assert client.delete(path, headers=outsider).status_code == 404
    assert client.delete(path).status_code == 401
    foreign_space = client.post('/teams', headers=owner, json={'name': 'Separate', 'key': 'SEP'}).json()
    assert client.delete(f"/teams/{foreign_space['id']}/projects/{project['id']}", headers=owner).status_code == 404
    result = client.delete(path, headers=owner)
    assert result.status_code == 204, result.text
    state = client.get(root + '/workspace', headers=owner).json()
    assert state['projects'] == [other]
    assert [i['id'] for i in state['issues']] == [keep['id']]
    assert state['team']['invite_code'] == team['invite_code']
    assert len(state['members']) == 2
    assert state['project_memberships'] == []
    with client.session_factory() as db:
        for model in (IssueComment, Meeting, MeetingTaskUpdate, ProjectMembership, Sprint):
            assert db.scalars(select(model)).all() == []
    assert client.post(path + '/join', headers=member).status_code == 404
    assert client.delete(path, headers=owner).status_code == 404
    assert client.delete(f"{root}/projects/{other['id']}", headers=owner).status_code == 204
    assert client.get(root + '/workspace', headers=owner).json()['projects'] == []


def test_join_is_explicit_immediate_idempotent_and_scoped_to_project(client, setup):
    owner, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    project = create_project(client, team, owner, "Second project")
    join = f"{root}/projects/{project['id']}/join"
    member_id = client.get("/me", headers=member).json()["id"]
    owner_id = client.get("/me", headers=owner).json()["id"]
    payload = {"title": "Only project members", "project_id": project["id"], "assignee_id": member_id}
    # Space membership alone, including ownership, does not make an assignee eligible.
    assert client.post(root + "/issues", headers=owner, json=payload).status_code == 422
    assert client.post(root + "/issues", headers=owner, json={**payload, "assignee_id": owner_id}).status_code == 422
    assert client.post(join, headers=outsider).status_code == 404
    assert client.post(join).status_code == 401
    for _ in range(2):
        assert client.post(join, headers=member).json() == {"project_id": project["id"], "user_id": member_id}
    task = client.post(root + "/issues", headers=owner, json=payload)
    assert task.status_code == 201, task.text
    state = client.get(root + "/workspace", headers=owner).json()
    assert sum(m["project_id"] == project["id"] for m in state["project_memberships"]) == 1
    assert sum(a["message"] == "joined project Second project" for a in state["activity"]) == 1
    assert client.get(root + "/workspace", headers=member).json()["project_memberships"] == state["project_memberships"]
    other_space = client.post("/teams", headers=outsider, json={"name": "Private", "key": "PVT"}).json()
    other_project = create_project(client, other_space, outsider)
    assert client.post(f"{root}/projects/{other_project['id']}/join", headers=member).status_code == 404


def test_updates_cannot_assign_nonparticipants_and_nonparticipants_can_view_projects(client, setup):
    owner, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    project = create_project(client, team, owner, "Website")
    member_id = client.get("/me", headers=member).json()["id"]
    # Everyone can still view projects, create unassigned tasks and contribute.
    task = client.post(root + "/issues", headers=member, json={"title": "Plan together", "project_id": project["id"]}).json()
    assert client.get(root + "/workspace", headers=member).status_code == 200
    assert client.put(root + f"/issues/{task['id']}", headers=owner, json={"title": "Plan together", "assignee_id": member_id}).status_code == 422
    assert client.post(f"{root}/projects/{project['id']}/join", headers=member).status_code == 200
    assert client.put(root + f"/issues/{task['id']}", headers=owner, json={"title": "Plan together", "assignee_id": member_id}).status_code == 200


def test_removal_clears_only_that_spaces_project_memberships_and_does_not_rotate_link(client, setup):
    owner, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    member_id = client.get("/me", headers=member).json()["id"]
    project = create_project(client, team, owner, "Additional project")
    assert client.post(f"{root}/projects/{project['id']}/join", headers=member).status_code == 200
    other = client.post("/teams", headers=member, json={"name": "My other space", "key": "OTHER"}).json()
    other_project = create_project(client, other, member)
    assert client.post(f"/teams/{other['id']}/projects/{other_project['id']}/join", headers=member).status_code == 200
    done = client.post(root + "/issues", headers=owner, json={"title": "Completed history", "project_id": project["id"], "assignee_id": member_id, "status": "completed"}).json()
    assert client.delete(root + f"/members/{member_id}", headers=owner).status_code == 204
    state = client.get(root + "/workspace", headers=owner).json()
    assert state["project_memberships"] == []
    assert state["team"]["invite_code"] == team["invite_code"]
    assert state["team"]["invite_expires_at"] == team["invite_expires_at"]
    assert next(i for i in state["issues"] if i["id"] == done["id"])["assignee_id"] == member_id
    assert client.post(f"{root}/projects/{project['id']}/join", headers=member).status_code == 404
    assert len(client.get(f"/teams/{other['id']}/workspace", headers=member).json()["project_memberships"]) == 1
    newcomer = account(client, "newcomer")
    assert client.post("/teams/join", headers=newcomer, json={"code": team["invite_code"]}).status_code == 200
    # Rejoining a space does not silently rejoin its projects.
    assert client.post("/teams/join", headers=member, json={"code": team["invite_code"]}).status_code == 200
    assert client.get(root + "/workspace", headers=member).json()["project_memberships"] == []
