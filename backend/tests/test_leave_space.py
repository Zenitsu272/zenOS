from test_team_workspaces import client, create_project, setup
from test_project_meetings import create_meeting


def test_leave_space_preserves_shared_work_and_other_spaces(client, setup):
    owner, member, _, team = setup
    root = f"/teams/{team['id']}"
    member_id = client.get('/me', headers=member).json()['id']
    project = client.get(root + '/workspace', headers=owner).json()['projects'][0]
    second = create_project(client, team, owner, 'Second project')
    assert client.post(f"{root}/projects/{second['id']}/join", headers=member).status_code == 200
    sprint = client.post(root + '/sprints', headers=owner, json={
        'name': 'Plan', 'project_id': project['id'],
        'start_date': '2026-10-10', 'end_date': '2026-10-20',
    })
    assert sprint.status_code == 201
    tasks = []
    for project_id, status in [(project['id'], 'ongoing'), (second['id'], 'review'), (project['id'], 'scheduled')]:
        response = client.post(root + '/issues', headers=member, json={
            'title': 'Keep my work', 'project_id': project_id, 'status': status,
            'assignee_id': member_id, 'assigned_date': '2026-10-10', 'due_date': '2026-10-20',
        })
        assert response.status_code == 201
        tasks.append(response.json())
    assert client.post(root + f"/issues/{tasks[0]['id']}/comments", headers=member,
                       json={'body': 'Keep this discussion'}).status_code == 201
    meetings = f"{root}/projects/{project['id']}/meetings"
    meeting = create_meeting(client, meetings, member)
    assert client.post(meetings + f"/{meeting['id']}/review", headers=member, json={
        'notes': 'Keep these notes', 'complete': True,
        'task_updates': [{'issue_id': tasks[-1]['id'], 'status': 'completed'}],
    }).status_code == 200
    other = client.post('/teams', headers=member, json={'name': 'Other space', 'key': 'OTHER'}).json()
    other_root = f"/teams/{other['id']}"
    other_project = create_project(client, other, member)
    assert client.post(f"{other_root}/projects/{other_project['id']}/join", headers=member).status_code == 200
    assert client.post(other_root + '/issues', headers=member, json={
        'title': 'Keep other assignment', 'project_id': other_project['id'], 'assignee_id': member_id,
    }).status_code == 201
    other_before = client.get(other_root + '/workspace', headers=member).json()
    before = client.get(root + '/workspace', headers=owner).json()
    meetings_before = client.get(meetings, headers=owner).json()

    assert client.delete(root + '/membership', headers=member).status_code == 204

    after = client.get(root + '/workspace', headers=owner).json()
    for key in ('team', 'projects', 'sprints', 'comments'):
        assert after[key] == before[key]
    for saved, original in zip(after['issues'], before['issues'], strict=True):
        expected = {**original}
        if original['status'] != 'completed':
            expected['assignee_id'] = None
            expected['updated_at'] = saved['updated_at']
        assert saved == expected
    assert after['project_memberships'] == []
    assert [m['id'] for m in after['members']] == [team['owner_id']]
    assert after['activity'][1:] == before['activity']
    assert after['activity'][0]['message'] == 'left the space'
    assert after['activity'][0]['email'] == 'member@example.com'
    assert client.get(meetings, headers=owner).json() == meetings_before
    assert client.get(other_root + '/workspace', headers=member).json() == other_before
    assert [t['id'] for t in client.get('/teams', headers=member).json()] == [other['id']]
    assert client.get('/me', headers=member).status_code == 200
    assert client.get(root + '/workspace', headers=member).status_code == 404
    assert client.get(meetings, headers=member).status_code == 404
    assert client.post(root + '/issues', headers=member, json={'title': 'No access'}).status_code == 404
    assert client.post(f"{root}/projects/{project['id']}/join", headers=member).status_code == 404
    assert client.post('/teams/join', headers=member, json={'code': team['invite_code']}).status_code == 200
    assert client.get(root + '/workspace', headers=member).json()['project_memberships'] == []


def test_leave_space_requires_membership_and_blocks_owner_without_changes(client, setup):
    owner, member, outsider, team = setup
    root = f"/teams/{team['id']}"
    before = client.get(root + '/workspace', headers=owner).json()
    assert client.delete(root + '/membership').status_code == 401
    assert client.delete(root + '/membership', headers=outsider).status_code == 404
    assert client.delete(root + '/membership', headers=owner).status_code == 409
    assert client.get(root + '/workspace', headers=owner).json() == before
    assert client.delete(root + '/membership', headers=member).status_code == 204
    assert client.get('/teams', headers=member).json() == []
    assert client.delete(root + '/membership', headers=member).status_code == 404
    # The last remaining member is still the owner and cannot orphan the space.
    assert client.delete(root + '/membership', headers=owner).status_code == 409
