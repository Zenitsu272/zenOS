from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.subbranch import Subbranch
from app.models.user import User


DEFAULT_STRUCTURE = {
    "Internships / Work": ["Company A Internship", "Intel AIoT Club", "Freelance Work", "Research Assistantship"],
    "Learning": ["TensorFlow", "Spring Boot", "MLOps", "Communication Theory"],
    "Projects": ["SheAlert", "Healthcare AI App", "Portfolio Website"],
    "DSA": ["Arrays", "Trees", "Dynamic Programming", "Contest Prep"],
}


def create_default_workspace(db: Session, user: User) -> None:
    for category_name, subbranches in DEFAULT_STRUCTURE.items():
        category = Category(name=category_name, user_id=user.id)
        db.add(category)
        db.flush()
        for subbranch_name in subbranches:
            db.add(Subbranch(name=subbranch_name, category_id=category.id, user_id=user.id))
