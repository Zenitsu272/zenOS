import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text


def test_empty_legacy_folders_cleanup_keeps_all_lists_tasks_and_custom_folders(tmp_path):
    url = "sqlite:///" + (tmp_path / "empty_legacy.db").as_posix()
    env = {**os.environ, "DATABASE_URL": url, "ENVIRONMENT": "test"}
    backend = Path(__file__).resolve().parents[1]

    def migrate(*args):
        result = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=backend, env=env, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        return result.stdout

    migrate("upgrade", "0008_project_memberships")
    engine = create_engine(url)
    removable = set()
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        for user_id in range(1, 7):
            connection.execute(text("INSERT INTO users(id,email,hashed_password,created_at) VALUES (:id,:email,'hash','2026-01-01 00:00:00')"), {"id": user_id, "email": f"person{user_id}@example.com"})

        def folder(user_id, name, created="2026-01-01 00:00:00", updated="2026-02-01 00:00:00"):
            return connection.execute(text("INSERT INTO categories(user_id,name,created_at,updated_at) VALUES (:user_id,:name,:created,:updated)"), {"user_id": user_id, "name": name, "created": created, "updated": updated}).lastrowid

        def task_list(user_id, folder_id, name, notes=None):
            return connection.execute(text("INSERT INTO subbranches(user_id,category_id,name,notes) VALUES (:user_id,:folder_id,:name,:notes)"), {"user_id": user_id, "folder_id": folder_id, "name": name, "notes": notes}).lastrowid

        for user_id in (1, 2):
            for name in ("Learning", "Projects", "DSA", "Internships / Work", "Internships / Research"):
                removable.add(folder(user_id, name))
        # Any list protects its folder, including an empty list or one with notes.
        project = folder(3, "Projects")
        zen_list = task_list(3, project, "zenOS")
        task_list(3, folder(3, "Learning"), "Empty list")
        task_list(3, folder(3, "DSA"), "Notes", "Keep these notes")
        # Even an inconsistent legacy task referencing a list in another folder
        # protects its direct category; the task may belong to another user.
        task_only = folder(4, "Learning")
        connection.execute(text("INSERT INTO tasks(user_id,category_id,subbranch_id,title,task_type,priority,estimated_hours,progress,completed) VALUES (3,:folder,:list,'Retain completed work','Daily','Medium',1,100,1)"), {"folder": task_only, "list": zen_list})
        folder(5, "My custom folder")
        folder(5, "Learning", created="2026-01-02 00:00:00")
        folder(5, "Projects", created="2025-12-31 23:59:59")
        removable.add(folder(6, "Learning", created="2026-01-01 00:00:05"))
        folder(6, "Projects", created="2026-01-01 00:00:06")
        snapshots = {}
        for table in ("categories", "subbranches", "tasks", "users"):
            snapshots[table] = [dict(row) for row in connection.execute(text(f"SELECT * FROM {table} ORDER BY id")).mappings() if table != "categories" or row['id'] not in removable]
    assert "removed 11 folders; no lists or tasks deleted" in migrate("upgrade", "head")
    migrate("upgrade", "head")
    migrate("check")
    with engine.connect() as connection:
        for table, expected in snapshots.items():
            assert [dict(row) for row in connection.execute(text(f"SELECT * FROM {table} ORDER BY id")).mappings()] == expected, table
    engine.dispose()


def test_upgrade_preserves_personal_and_legacy_space_data_and_matches_models(tmp_path):
    database = tmp_path / "migration.db"
    url = "sqlite:///" + database.as_posix()
    env = {**os.environ, "DATABASE_URL": url, "ENVIRONMENT": "test"}
    backend = Path(__file__).resolve().parents[1]

    def migrate(*args):
        result = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=backend, env=env, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr

    migrate("upgrade", "0001_initial")
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO users (id,email,hashed_password) VALUES (1,'legacy@example.com','hash')"))
        connection.execute(text("INSERT INTO categories (id,user_id,name) VALUES (1,1,'Legacy work')"))
        connection.execute(text("INSERT INTO subbranches (id,user_id,category_id,name) VALUES (1,1,1,'Existing project')"))
        connection.execute(text("INSERT INTO tasks (id,user_id,category_id,subbranch_id,title,task_type,priority,estimated_hours,progress,completed) VALUES (1,1,1,1,'Keep this task','Daily','Medium',1,0,0)"))
    migrate("upgrade", "0002_team_workspaces")
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO users (id,email,hashed_password) VALUES (2,'teammate@example.com','hash')"))
        connection.execute(text("INSERT INTO teams (id,name,key,invite_code) VALUES (10,'Existing space','OLD','legacy-invite-code'),(20,'Another space','TWO','second-invite-code')"))
        connection.execute(text("INSERT INTO memberships (id,team_id,user_id,role) VALUES (1,10,1,'admin'),(2,10,2,'member'),(3,20,2,'admin')"))
        connection.execute(text("INSERT INTO sprints (id,team_id,name,goal,start_date,end_date,status,active_team_id,retrospective) VALUES (10,10,'Current work','Keep moving','2026-10-09','2026-10-23','active',10,''),(11,10,'Delivered work','Previous goal','2026-09-01','2026-09-14','completed',NULL,'Worked well'),(20,20,'Other work','Another goal','2026-10-09','2026-10-23','active',20,'')"))
        connection.execute(text("INSERT INTO issues (id,team_id,reporter_id,assignee_id,sprint_id,title,description,acceptance_criteria,status,priority,issue_type,points,label) VALUES (10,10,1,2,10,'Keep current work','Details','Check me','ongoing','High','Task',3,'Launch'),(11,10,2,NULL,11,'Keep delivery history','','','completed','Medium','Task',5,''),(20,20,2,NULL,20,'Other private work','','','scheduled','Low','Task',1,'')"))
        connection.execute(text("INSERT INTO issue_comments (id,issue_id,user_id,body) VALUES (1,10,2,'Keep our discussion')"))
        connection.execute(text("INSERT INTO team_activity (id,team_id,user_id,message) VALUES (1,10,1,'created current work')"))
    migrate("upgrade", "head")
    migrate("check")
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT title FROM tasks WHERE id=1")) == "Keep this task"
        assert connection.scalar(text("SELECT email FROM users WHERE id=1")) == "legacy@example.com"
        assert connection.execute(text("SELECT id,owner_id FROM teams ORDER BY id")).all() == [(10, 1), (20, 2)]
        assert connection.execute(text("SELECT description FROM teams ORDER BY id")).all() == [("",), ("",)]
        assert connection.execute(text("SELECT team_id,name FROM projects ORDER BY team_id")).all() == [(10, "General"), (20, "General")]
        assert connection.scalar(text("SELECT count(*) FROM teams WHERE invite_expires_at IS NOT NULL")) == 2
        assert connection.scalar(text("SELECT invite_code FROM teams WHERE id=10")) == "legacy-invite-code"
        assert connection.scalar(text("SELECT count(*) FROM issues i JOIN projects p ON p.id=i.project_id WHERE i.team_id=p.team_id")) == 3
        assert connection.scalar(text("SELECT count(*) FROM sprints s JOIN projects p ON p.id=s.project_id WHERE s.team_id=p.team_id")) == 3
        assert connection.scalar(text("SELECT count(*) FROM sprints WHERE status='active' AND active_project_id=project_id")) == 2
        assert connection.scalar(text("SELECT active_project_id FROM sprints WHERE id=11")) is None
        assert connection.scalar(text("SELECT retrospective FROM sprints WHERE id=11")) == "Worked well"
        assert connection.execute(text("SELECT title,status,sprint_id,assignee_id FROM issues WHERE id=10")).one() == ("Keep current work", "ongoing", 10, 2)
        assert connection.execute(text("SELECT status,sprint_id,points FROM issues WHERE id=11")).one() == ("completed", 11, 5)
        assert connection.scalar(text("SELECT body FROM issue_comments WHERE id=1")) == "Keep our discussion"
        assert connection.scalar(text("SELECT message FROM team_activity WHERE id=1")) == "created current work"
        assert connection.scalar(text("SELECT count(*) FROM meetings")) == 0
        assert connection.scalar(text("SELECT count(*) FROM meeting_task_updates")) == 0
        assert connection.execute(text("SELECT pm.project_id,pm.user_id FROM project_memberships pm")).all() == [
            (connection.scalar(text("SELECT project_id FROM issues WHERE id=10")), 2)
        ]
        assert connection.scalar(text("SELECT count(*) FROM otp_challenges")) == 0
        assert connection.scalar(text("SELECT count(*) FROM auth_rate_limits")) == 0
    inspector = inspect(engine)
    assert {"teams", "projects", "issues", "memberships", "sprints", "meetings", "meeting_task_updates", "otp_challenges", "auth_rate_limits"}.issubset(inspector.get_table_names())
    assert "code" not in {column["name"] for column in inspector.get_columns("otp_challenges")}
    issue_reference = next(foreign_key for foreign_key in inspector.get_foreign_keys("meeting_task_updates") if foreign_key["constrained_columns"] == ["issue_id"])
    assert issue_reference["options"]["ondelete"] == "SET NULL"
    migrate("downgrade", "0001_initial")
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM tasks")) == 1
    engine.dispose()


def test_personal_cleanup_only_removes_exact_unused_starter_trees(tmp_path):
    database = tmp_path / "personal_cleanup.db"
    url = "sqlite:///" + database.as_posix()
    env = {**os.environ, "DATABASE_URL": url, "ENVIRONMENT": "test"}
    backend = Path(__file__).resolve().parents[1]

    def migrate(*args):
        result = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=backend, env=env, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr

    migrate("upgrade", "0003_space_projects")
    engine = create_engine(url)
    legacy = {
        "Internships / Work": ["Company A Internship", "Intel AIoT Club", "Freelance Work", "Research Assistantship"],
        "Learning": ["TensorFlow", "Spring Boot", "MLOps", "Communication Theory"],
        "Projects": ["SheAlert", "Healthcare AI App", "Portfolio Website"],
        "DSA": ["Arrays", "Trees", "Dynamic Programming", "Contest Prep"],
    }
    unchanged = "2026-01-01 00:00:00"
    changed = "2026-02-01 00:00:00"
    removable_categories = set()
    removable_lists = set()
    with engine.begin() as connection:
        for user_id in range(1, 16):
            connection.execute(text("INSERT INTO users (id,email,hashed_password,created_at) VALUES (:id,:email,'hash',:time)"), {"id": user_id, "email": f"legacy{user_id}@example.com", "time": unchanged})

        def tree(user_id, name, children=None):
            category_id = connection.execute(text("INSERT INTO categories (user_id,name,created_at,updated_at) VALUES (:user_id,:name,:time,:time)"), {"user_id": user_id, "name": name, "time": unchanged}).lastrowid
            child_ids = []
            for child in legacy.get(name, []) if children is None else children:
                child_ids.append(connection.execute(text("INSERT INTO subbranches (user_id,category_id,name,created_at,updated_at) VALUES (:user_id,:category_id,:name,:time,:time)"), {"user_id": user_id, "category_id": category_id, "name": child, "time": unchanged}).lastrowid)
            return category_id, child_ids

        def task(user_id, category_id, list_id, title):
            connection.execute(text("INSERT INTO tasks (user_id,category_id,subbranch_id,title,task_type,priority,estimated_hours,progress,completed) VALUES (:user_id,:category_id,:list_id,:title,'Daily','Medium',1,0,0)"), {"user_id": user_id, "category_id": category_id, "list_id": list_id, "title": title})

        # All four original untouched templates should disappear, including their empty lists.
        for name in legacy:
            category_id, child_ids = tree(1, name)
            removable_categories.add(category_id)
            removable_lists.update(child_ids)

        # Existing work, notes, and every kind of customization must survive unchanged.
        category_id, child_ids = tree(2, "Projects")
        task(2, category_id, child_ids[0], "Keep project work")
        category_id, child_ids = tree(3, "DSA")
        connection.execute(text("UPDATE subbranches SET notes='Keep these notes' WHERE id=:id"), {"id": child_ids[0]})
        tree(4, "Learning", [*legacy["Learning"], "My custom subject"])
        tree(5, "Projects", legacy["Projects"][:-1])
        tree(6, "Internships / Work", ["My employer", *legacy["Internships / Work"][1:]])
        category_id, _ = tree(7, "Learning")
        connection.execute(text("UPDATE categories SET updated_at=:time WHERE id=:id"), {"time": changed, "id": category_id})
        tree(8, "My DSA", legacy["DSA"])

        # Even inconsistent old task relationships must protect any referenced starter tree.
        starter_id, starter_lists = tree(9, "Learning")
        custom_id, custom_lists = tree(9, "Custom", ["Personal"])
        task(9, custom_id, starter_lists[0], "Keep task referencing a starter list")
        other_starter_id, _ = tree(9, "Projects")
        task(9, other_starter_id, custom_lists[0], "Keep task referencing a starter folder")

        category_id, child_ids = tree(10, "DSA")
        connection.execute(text("UPDATE subbranches SET updated_at=:time WHERE id=:id"), {"time": changed, "id": child_ids[0]})
        category_id, child_ids = tree(11, "Learning")
        connection.execute(text("UPDATE subbranches SET user_id=12 WHERE id=:id"), {"id": child_ids[0]})
        tree(12, "Learning", [])
        tree(13, "My empty folder", [])
        category_id, child_ids = tree(14, "Projects")
        connection.execute(text("UPDATE categories SET created_at=:time,updated_at=:time WHERE id=:id"), {"time": changed, "id": category_id})
        connection.execute(text("UPDATE subbranches SET created_at=:time,updated_at=:time WHERE category_id=:id"), {"time": changed, "id": category_id})
        category_id, child_ids = tree(15, "DSA")
        connection.execute(text("UPDATE subbranches SET notes='   ' WHERE id=:id"), {"id": child_ids[0]})

        before_categories = [dict(row) for row in connection.execute(text("SELECT * FROM categories ORDER BY id")).mappings() if row["id"] not in removable_categories]
        before_lists = [dict(row) for row in connection.execute(text("SELECT * FROM subbranches ORDER BY id")).mappings() if row["id"] not in removable_lists]
        before_tasks = [dict(row) for row in connection.execute(text("SELECT * FROM tasks ORDER BY id")).mappings()]

    migrate("upgrade", "0004_empty_personal_workspace")
    with engine.connect() as connection:
        assert [dict(row) for row in connection.execute(text("SELECT * FROM categories ORDER BY id")).mappings()] == before_categories
        assert [dict(row) for row in connection.execute(text("SELECT * FROM subbranches ORDER BY id")).mappings()] == before_lists
        assert [dict(row) for row in connection.execute(text("SELECT * FROM tasks ORDER BY id")).mappings()] == before_tasks
        assert connection.scalar(text("SELECT count(*) FROM categories WHERE user_id=1")) == 0
        assert connection.scalar(text("SELECT count(*) FROM subbranches WHERE user_id=1")) == 0
    engine.dispose()


def test_empty_default_project_cleanup_preserves_user_projects_and_all_referenced_work(tmp_path):
    database = tmp_path / "project_cleanup.db"
    url = "sqlite:///" + database.as_posix()
    env = {**os.environ, "DATABASE_URL": url, "ENVIRONMENT": "test"}
    backend = Path(__file__).resolve().parents[1]

    def migrate(*args):
        result = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=backend, env=env, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr

    migrate("upgrade", "0005_space_meetings")
    engine = create_engine(url)
    old_description = "A place for your team's first tasks."
    migrated_description = "Your existing tasks and work plans."
    removable = set()
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO users (id,email,hashed_password) VALUES (1,'project-owner@example.com','hash')"))
        for team_id in range(1, 15):
            connection.execute(text("INSERT INTO teams (id,name,key,invite_code,owner_id,invite_expires_at) VALUES (:id,:name,:key,:code,1,'2027-01-01 00:00:00')"), {"id": team_id, "name": f"Space {team_id}", "key": f"SP{team_id}", "code": f"existing-invite-code-{team_id}"})
            connection.execute(text("INSERT INTO memberships (team_id,user_id,role) VALUES (:team_id,1,'admin')"), {"team_id": team_id})

        def project(team_id, name="General", description=old_description):
            return connection.execute(text("INSERT INTO projects (team_id,name,description) VALUES (:team_id,:name,:description)"), {"team_id": team_id, "name": name, "description": description}).lastrowid

        def issue(team_id, project_id, title):
            connection.execute(text("INSERT INTO issues (team_id,project_id,reporter_id,title,description,acceptance_criteria,status,priority,issue_type,points,label) VALUES (:team_id,:project_id,1,:title,'','','scheduled','Medium','Task',0,'')"), {"team_id": team_id, "project_id": project_id, "title": title})

        def plan(team_id, project_id, active_project_id=None):
            connection.execute(text("INSERT INTO sprints (team_id,project_id,name,goal,start_date,end_date,status,active_project_id,retrospective) VALUES (:team_id,:project_id,'Existing plan','','2026-10-10','2026-10-17',:status,:active_project_id,'')"), {"team_id": team_id, "project_id": project_id, "active_project_id": active_project_id, "status": "active" if active_project_id else "planned"})

        # Both historical automatic descriptions are recognized, without deleting their spaces.
        removable.add(project(1))
        removable.add(project(2, description=migrated_description))
        issue(3, project(3), "Keep this task and its project")
        plan(4, project(4))
        meeting_project = project(5, description=migrated_description)
        connection.execute(text("INSERT INTO meetings (team_id,project_id,title,agenda,meeting_url,starts_at,ends_at,status,notes,created_by) VALUES (5,:project_id,'Keep this meeting','','','2026-10-10 10:00:00','2026-10-10 10:30:00','scheduled','',1)"), {"project_id": meeting_project})

        # Same-name user projects and manually recreated exact defaults must survive.
        project(6, description="")
        project(7)
        connection.execute(text("INSERT INTO team_activity (team_id,user_id,message) VALUES (7,1,'created project General')"))
        project(8, name="First user project", description="")
        project(8)
        active_reference = project(9)
        plan(9, project(9, name="Plan project", description=""), active_reference)
        project(10, name="Renamed project")
        project(11, description="Build a better team workspace.")

        # Even inconsistent legacy references from another space protect existing work.
        foreign_reference = project(12)
        issue(13, foreign_reference, "Keep legacy cross-space reference")

        # Deleting the first candidate must not turn the second into another cleanup candidate.
        removable.add(project(14))
        project(14, description=migrated_description)

        snapshots = {}
        for table in ["projects", "teams", "memberships", "issues", "sprints", "meetings", "team_activity"]:
            snapshots[table] = [dict(row) for row in connection.execute(text(f"SELECT * FROM {table} ORDER BY id")).mappings() if table != "projects" or row["id"] not in removable]

    migrate("upgrade", "head")
    migrate("check")
    with engine.connect() as connection:
        for table, expected in snapshots.items():
            assert [dict(row) for row in connection.execute(text(f"SELECT * FROM {table} ORDER BY id")).mappings()] == expected, table
        assert connection.scalar(text("SELECT count(*) FROM projects WHERE team_id IN (1,2)")) == 0
        assert connection.scalar(text("SELECT count(*) FROM projects WHERE team_id=14")) == 1
        assert connection.scalar(text("SELECT count(*) FROM teams")) == 14
    engine.dispose()
