from test_team_workspaces import account, client
from app.models.team import Team


def test_wing_selection_depends_on_the_space_and_preserves_project_permissions(client):
    owner = account(client, "club-owner")
    member = account(client, "club-member")
    outsider = account(client, "outsider")
    team_payload = {"name": "Intel IoT Club", "key": "IOT"}
    club = client.post("/teams", headers=owner, json=team_payload).json()
    club_root = f"/teams/{club['id']}"
    # Model the one existing space enabled at migration time.
    with client.session_factory() as db:
        db.get(Team, club["id"]).wings_enabled = True
        db.commit()
    assert client.post("/teams/join", headers=member, json={"code": club["invite_code"]}).status_code == 200

    path = club_root + "/projects"
    for wing in [{}, {"wing": None}, {"wing": "unknown"}]:
        assert client.post(path, headers=owner, json={"name": "Missing or invalid wing", **wing}).status_code == 422
    payload = {"name": "Robotics", "wing": "physical_ai"}
    assert client.post(path, headers=member, json=payload).status_code == 403
    assert client.post(path, headers=outsider, json=payload).status_code == 404
    assert client.post(path, json=payload).status_code == 401

    created = []
    for name, wing in [("Modelling", "ai"), ("Robotics", "physical_ai")]:
        response = client.post(path, headers=owner, json={"name": name, "wing": wing})
        assert response.status_code == 201, response.text
        project = response.json()
        assert project["wing"] == wing
        created.append(project)
    workspace = client.get(club_root + "/workspace", headers=member).json()
    assert workspace["team"]["wings_enabled"] is True
    assert workspace["projects"] == created
    assert client.get("/teams", headers=member).json()[0]["wings_enabled"] is True

    # A newly created space with the same display name has the ordinary workflow.
    other = client.post("/teams", headers=outsider, json=team_payload).json()
    assert other["wings_enabled"] is False
    other_root = f"/teams/{other['id']}"
    assert client.post(other_root + "/projects", headers=outsider, json=payload).status_code == 422
    response = client.post(other_root + "/projects", headers=outsider, json={"name": "First project"})
    assert response.status_code == 201, response.text
    assert response.json()["wing"] is None
    assert client.get(other_root + "/workspace", headers=outsider).json()["projects"] == [response.json()]
