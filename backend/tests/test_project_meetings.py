from datetime import datetime, timezone

from test_team_workspaces import client, setup


def project_context(client, admin, team):
    root = f"/teams/{team['id']}"
    project = client.get(root + "/workspace", headers=admin).json()["projects"][0]
    return root, project, root + f"/projects/{project['id']}/meetings"


def schedule(**changes):
    return {
        "title": "Weekly check-in",
        "agenda": "Review progress and agree on next steps.",
        "meeting_url": "https://meet.example.com/team",
        "starts_at": "2026-10-10T10:00:00+05:30",
        "ends_at": "2026-10-10T10:30:00+05:30",
        **changes,
    }


def create_meeting(client, path, user, **changes):
    response = client.post(path, headers=user, json=schedule(**changes))
    assert response.status_code == 201, response.text
    return response.json()


def test_members_schedule_edit_review_and_keep_completed_meeting_history(client, setup):
    admin, member, outsider, team = setup
    root, project, meetings = project_context(client, admin, team)
    member_id = client.get("/me", headers=member).json()["id"]
    task = client.post(root + "/issues", headers=member, json={"title": "Original task title", "project_id": project["id"], "status": "scheduled"}).json()
    meeting = create_meeting(client, meetings, member)
    path = meetings + f"/{meeting['id']}"
    assert meeting["status"] == "scheduled"
    assert meeting["notes"] == ""
    assert meeting["completed_at"] is None
    assert meeting["task_updates"] == []
    assert meeting["created_by"] == member_id
    assert meeting["created_by_email"] == "member@example.com"
    assert meeting["project_id"] == project["id"]
    assert meeting["team_id"] == team["id"]
    starts_at = datetime.fromisoformat(meeting["starts_at"].replace("Z", "+00:00"))
    assert starts_at == datetime(2026, 10, 10, 4, 30, tzinfo=timezone.utc)
    assert starts_at.utcoffset().total_seconds() == 0
    assert client.get(meetings, headers=admin).json() == [meeting]
    response = client.put(path, headers=admin, json=schedule(title="Project progress review", starts_at="2026-10-10T11:00:00+05:30", ends_at="2026-10-10T11:30:00+05:30"))
    assert response.status_code == 200, response.text
    assert response.json()["title"] == "Project progress review"
    response = client.post(path + "/review", headers=member, json={"notes": "Work has started.", "task_updates": [{"issue_id": task["id"], "status": "ongoing"}], "complete": False})
    assert response.status_code == 200, response.text
    first = response.json()
    assert first["status"] == "scheduled"
    assert first["notes"] == "Work has started."
    assert first["completed_at"] is None
    assert len(first["task_updates"]) == 1
    update = first["task_updates"][0]
    assert update["issue_id"] == task["id"]
    assert update["issue_title"] == "Original task title"
    assert (update["from_status"], update["to_status"]) == ("scheduled", "ongoing")
    assert update["user_email"] == "member@example.com"
    assert datetime.fromisoformat(update["created_at"].replace("Z", "+00:00")).tzinfo is not None
    response = client.post(path + "/review", headers=admin, json={"notes": "All agreed actions are finished.", "task_updates": [{"issue_id": task["id"], "status": "completed"}], "complete": True})
    assert response.status_code == 200, response.text
    completed = response.json()
    assert completed["status"] == "completed"
    assert completed["completed_at"] is not None
    assert completed["notes"] == "All agreed actions are finished."
    assert len(completed["task_updates"]) == 2
    assert completed["task_updates"][0] == update
    assert (completed["task_updates"][1]["from_status"], completed["task_updates"][1]["to_status"]) == ("ongoing", "completed")
    assert completed["task_updates"][1]["user_email"] == "admin@example.com"
    assert client.get(root + "/workspace", headers=member).json()["issues"][0]["status"] == "completed"
    assert client.put(path, headers=admin, json=schedule(title="Cannot rewrite history")).status_code == 409
    # Work continues after meetings: new changes append history without reopening the meeting.
    follow_up = client.post(root + "/issues", headers=member, json={"title": "Share the result", "project_id": project["id"], "status": "scheduled"}).json()
    response = client.post(path + "/review", headers=member, json={"notes": "Follow-up: sharing the result.", "task_updates": [{"issue_id": task["id"], "status": "completed"}, {"issue_id": follow_up["id"], "status": "ongoing"}], "complete": False})
    assert response.status_code == 200, response.text
    later = response.json()
    assert later["status"] == "completed"
    assert later["completed_at"] == completed["completed_at"]
    assert later["task_updates"][:2] == completed["task_updates"]
    assert len(later["task_updates"]) == 3
    assert later["task_updates"][2]["issue_id"] == follow_up["id"]
    assert (later["task_updates"][2]["from_status"], later["task_updates"][2]["to_status"]) == ("scheduled", "ongoing")
    assert next(issue for issue in client.get(root + "/workspace", headers=admin).json()["issues"] if issue["id"] == follow_up["id"])["status"] == "ongoing"
    assert client.get(meetings, headers=member).json() == [later]
    # Immutable task snapshots survive renaming and deleting the live task.
    assert client.put(root + f"/issues/{task['id']}", headers=member, json={"title": "Renamed after the meeting", "status": "completed"}).status_code == 200
    assert client.delete(root + f"/issues/{task['id']}", headers=member).status_code == 204
    history = client.get(meetings, headers=admin).json()[0]
    assert history["notes"] == "Follow-up: sharing the result."
    assert history["completed_at"] == completed["completed_at"]
    assert history["task_updates"] == [{**item, "issue_id": None} if item["issue_id"] == task["id"] else item for item in later["task_updates"]]


def test_meeting_review_validates_every_task_before_saving_any_changes(client, setup):
    admin, member, outsider, team = setup
    root, project, meetings = project_context(client, admin, team)
    other_project = client.post(root + "/projects", headers=admin, json={"name": "Another project"}).json()
    foreign_team = client.post("/teams", headers=outsider, json={"name": "Private space", "key": "PRV"}).json()
    foreign_task = client.post(f"/teams/{foreign_team['id']}/issues", headers=outsider, json={"title": "Private task", "status": "scheduled"}).json()
    other_task = client.post(root + "/issues", headers=member, json={"title": "Other project task", "project_id": other_project["id"], "status": "scheduled"}).json()
    valid = client.post(root + "/issues", headers=member, json={"title": "Keep unchanged on error", "project_id": project["id"], "status": "scheduled"}).json()
    plan = client.post(root + "/sprints", headers=admin, json={"name": "Delivered plan", "project_id": project["id"], "start_date": "2026-10-01", "end_date": "2026-10-09"}).json()
    assert client.patch(root + f"/sprints/{plan['id']}", headers=admin, json={"status": "active"}).status_code == 200
    locked = client.post(root + "/issues", headers=admin, json={"title": "Saved delivery history", "project_id": project["id"], "sprint_id": plan["id"], "status": "completed"}).json()
    assert client.patch(root + f"/sprints/{plan['id']}", headers=admin, json={"status": "completed"}).status_code == 200
    meeting = create_meeting(client, meetings, member)
    review_path = meetings + f"/{meeting['id']}/review"
    response = client.post(review_path, headers=member, json={"notes": "Original notes"})
    assert response.status_code == 200, response.text
    before = response.json()
    for invalid_id, expected in [(other_task["id"], 422), (foreign_task["id"], 422), (99999, 422), (locked["id"], 409)]:
        response = client.post(review_path, headers=member, json={"notes": "Must not be saved", "task_updates": [{"issue_id": valid["id"], "status": "ongoing"}, {"issue_id": invalid_id, "status": "ongoing"}], "complete": True})
        assert response.status_code == expected, response.text
        assert client.get(meetings, headers=admin).json() == [before]
        issues = {issue["id"]: issue for issue in client.get(root + "/workspace", headers=admin).json()["issues"]}
        assert issues[valid["id"]]["status"] == "scheduled"
        assert issues[locked["id"]]["status"] == "completed"
    for updates in [
        [{"issue_id": valid["id"], "status": "ongoing"}, {"issue_id": valid["id"], "status": "completed"}],
        [{"issue_id": valid["id"], "status": "unknown"}],
        [{"issue_id": valid["id"], "status": "ongoing", "project_id": other_project["id"]}],
    ]:
        assert client.post(review_path, headers=member, json={"notes": "Must not be saved", "task_updates": updates, "complete": True}).status_code == 422
    assert client.get(meetings, headers=admin).json() == [before]


def test_meeting_actions_require_membership_and_match_space_project_and_meeting(client, setup):
    admin, member, outsider, team = setup
    root, project, meetings = project_context(client, admin, team)
    member_id = client.get("/me", headers=member).json()["id"]
    meeting = create_meeting(client, meetings, member)
    actions = [("GET", "", None), ("POST", "", schedule()), ("PUT", f"/{meeting['id']}", schedule()), ("POST", f"/{meeting['id']}/review", {"notes": "Unauthorized", "complete": True})]
    for method, suffix, payload in actions:
        assert client.request(method, meetings + suffix, headers=outsider, json=payload).status_code == 404
        assert client.request(method, meetings + suffix, json=payload).status_code == 401
    other_project = client.post(root + "/projects", headers=admin, json={"name": "Second project"}).json()
    other_meetings = root + f"/projects/{other_project['id']}/meetings"
    assert client.get(other_meetings, headers=member).json() == []
    assert client.put(other_meetings + f"/{meeting['id']}", headers=member, json=schedule()).status_code == 404
    assert client.post(other_meetings + f"/{meeting['id']}/review", headers=member, json={"notes": "Wrong project"}).status_code == 404
    foreign = client.post("/teams", headers=outsider, json={"name": "Foreign space", "key": "EXT"}).json()
    foreign_project = client.get(f"/teams/{foreign['id']}/workspace", headers=outsider).json()["projects"][0]
    for invalid_path, headers in [
        (root + f"/projects/{foreign_project['id']}/meetings", admin),
        (f"/teams/{foreign['id']}/projects/{project['id']}/meetings", outsider),
        (root + "/projects/99999/meetings", member),
    ]:
        for method, suffix, payload in actions:
            assert client.request(method, invalid_path + suffix, headers=headers, json=payload).status_code == 404
    assert client.delete(root + f"/members/{member_id}", headers=admin).status_code == 204
    for method, suffix, payload in actions:
        assert client.request(method, meetings + suffix, headers=member, json=payload).status_code == 404
    assert client.get(meetings, headers=admin).json() == [meeting]


def test_meeting_schedule_requires_timezone_valid_times_and_safe_web_links(client, setup):
    admin, member, outsider, team = setup
    root, project, meetings = project_context(client, admin, team)
    meeting = create_meeting(client, meetings, member)
    invalid = [
        {"title": " "},
        {"starts_at": "2026-10-10T10:00:00"},
        {"starts_at": 1791628200},
        {"ends_at": "2026-10-10T10:30:00"},
        {"ends_at": "2026-10-10T10:00:00+05:30"},
        {"ends_at": "2026-10-10T09:00:00+05:30"},
        {"ends_at": "2026-10-10T11:00:00+08:00"},
        {"meeting_url": "javascript:alert(1)"},
        {"meeting_url": "data:text/html,hello"},
        {"meeting_url": "ftp://example.com"},
        {"meeting_url": "/relative-link"},
        {"meeting_url": "https://"},
        {"project_id": 99999},
    ]
    for changes in invalid:
        payload = schedule(**changes)
        response = client.post(meetings, headers=member, json=payload)
        assert response.status_code == 422, (changes, response.text)
        response = client.put(meetings + f"/{meeting['id']}", headers=member, json=payload)
        assert response.status_code == 422, (changes, response.text)
    assert client.get(meetings, headers=member).json() == [meeting]
    for link in ["", "http://example.com/room", "https://example.com/room?invite=abc"]:
        assert client.put(meetings + f"/{meeting['id']}", headers=member, json=schedule(meeting_url=link)).status_code == 200


def test_meeting_review_can_save_a_task_for_later_without_leaving_it_in_a_plan(client, setup):
    admin, member, outsider, team = setup
    root, project, meetings = project_context(client, admin, team)
    plan = client.post(root + "/sprints", headers=admin, json={"name": "This week", "project_id": project["id"], "start_date": "2026-10-10", "end_date": "2026-10-17"}).json()
    task = client.post(root + "/issues", headers=member, json={"title": "Postpone this", "project_id": project["id"], "sprint_id": plan["id"], "status": "scheduled"}).json()
    meeting = create_meeting(client, meetings, member)
    response = client.post(meetings + f"/{meeting['id']}/review", headers=member, json={"notes": "Return to this next month.", "task_updates": [{"issue_id": task["id"], "status": "backlog"}], "complete": True})
    assert response.status_code == 200, response.text
    issue = client.get(root + "/workspace", headers=admin).json()["issues"][0]
    assert issue["status"] == "backlog"
    assert issue["sprint_id"] is None
    assert issue["project_id"] == project["id"]
    assert response.json()["task_updates"][0]["to_status"] == "backlog"
