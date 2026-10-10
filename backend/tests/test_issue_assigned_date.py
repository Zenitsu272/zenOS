from test_team_workspaces import client, setup


def test_assignment_date_survives_status_and_deadline_changes(client, setup):
    admin, member, _, team = setup
    root = f"/teams/{team['id']}"
    payload = {"title": "Assigned on Friday", "assigned_date": "2026-10-09", "due_date": "2026-10-20", "status": "scheduled"}
    response = client.post(root + "/issues", headers=admin, json=payload)
    assert response.status_code == 201, response.text
    issue_id = response.json()["id"]
    for status in ["ongoing", "completed", "scheduled"]:
        result = client.patch(f"{root}/issues/{issue_id}/status", headers=member, json={"status": status})
        assert result.status_code == 200
        assert result.json()["assigned_date"] == "2026-10-09"
        assert result.json()["due_date"] == "2026-10-20"
    payload["due_date"] = "2026-11-01"
    # Older clients cannot erase an existing assignment date accidentally.
    del payload["assigned_date"]
    result = client.put(f"{root}/issues/{issue_id}", headers=admin, json=payload)
    assert result.status_code == 200
    assert result.json()["assigned_date"] == "2026-10-09"
    assert result.json()["due_date"] == "2026-11-01"
    for date in ["2026-10-08", None]:
        result = client.put(f"{root}/issues/{issue_id}", headers=admin, json={**payload, "assigned_date": date})
        assert result.status_code == 200
        assert result.json()["assigned_date"] == date
        assert client.get(root + "/workspace", headers=member).json()["issues"][0]["assigned_date"] == date


def test_assignment_date_import_and_validation(client, setup):
    admin, _, _, team = setup
    root = f"/teams/{team['id']}"
    response = client.post(root + "/import", headers=admin, json={"csv": "Task,Status,Assigned date,Due date\nFinished,Done,2026-10-09,2026-10-12\nUndated,To do,,2026-10-20\n"})
    assert response.status_code == 201, response.text
    tasks = client.get(root + "/workspace", headers=admin).json()["issues"]
    assert [(task["assigned_date"], task["due_date"]) for task in tasks] == [("2026-10-09", "2026-10-12"), (None, "2026-10-20")]
    assert client.post(root + "/issues", headers=admin, json={"title": "Invalid", "assigned_date": "2026-02-30"}).status_code == 422
    assert client.post(root + "/import", headers=admin, json={"csv": "Task,Assigned date\nValid,2026-10-10\nInvalid,not-a-date\n"}).status_code == 422
    assert len(client.get(root + "/workspace", headers=admin).json()["issues"]) == 2
