import re

from app.resume.schemas import ResumeSkill


TAXONOMY: dict[str, tuple[str, tuple[str, ...]]] = {
    "Programming Languages": (
        "Python", "Java", "C", "C++", "JavaScript", "TypeScript", "SQL", "R", "Go", "Kotlin"
    ),
    "Web Development": ("React", "Next.js", "Node.js", "Express", "HTML", "CSS", "Tailwind CSS", "REST APIs"),
    "AI / Machine Learning": ("Machine Learning", "Deep Learning", "Natural Language Processing", "Computer Vision", "TensorFlow", "PyTorch", "scikit-learn", "Pandas", "NumPy", "OpenCV", "Transformers"),
    "Data Science": ("Data Analysis", "Data Visualization", "Statistics", "Power BI", "Tableau", "Excel", "Data Mining"),
    "Databases": ("PostgreSQL", "MySQL", "MongoDB", "Redis", "Supabase"),
    "Cloud / DevOps": ("AWS", "Azure", "Google Cloud", "Docker", "Kubernetes", "Git", "GitHub", "CI/CD"),
    "Computer Science": ("Data Structures", "Algorithms", "DBMS", "Operating Systems", "Computer Networks", "Software Engineering"),
    "Professional Skills": ("Communication", "Leadership", "Teamwork", "Problem Solving", "Project Management"),
}

ALIASES = {
    "js": "JavaScript", "ts": "TypeScript", "react.js": "React", "reactjs": "React",
    "nodejs": "Node.js", "node.js": "Node.js", "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL", "sklearn": "scikit-learn", "nlp": "Natural Language Processing",
}
AMBIGUOUS = {"ml": "Machine Learning"}
NEGATION = re.compile(r"\b(?:no|not|without|lack(?:ing|s)?|unfamiliar with)\b", re.IGNORECASE)


def _pattern(term: str) -> re.Pattern[str]:
    return re.compile(rf"(?<![A-Za-z0-9]){re.escape(term)}(?![A-Za-z0-9])", re.IGNORECASE)


def _evidence(text: str, start: int, end: int) -> str:
    line_start = max(text.rfind("\n", 0, start), text.rfind(".", 0, start)) + 1
    candidates = [position for position in (text.find("\n", end), text.find(".", end)) if position >= 0]
    line_end = min(candidates) + 1 if candidates else min(len(text), end + 160)
    return re.sub(r"\s+", " ", text[line_start:line_end]).strip()[:240]


def extract_skills(text: str) -> tuple[ResumeSkill, ...]:
    categories = {skill: category for category, skills in TAXONOMY.items() for skill in skills}
    matches: dict[str, ResumeSkill] = {}
    terms = [(alias, canonical, "alias_normalization") for alias, canonical in ALIASES.items()]
    terms.extend((skill, skill, "explicit_mention") for skill in categories)
    for term, canonical, method in terms:
        match = _pattern(term).search(text)
        if match is None:
            continue
        context = text[max(0, match.start() - 50):match.end()]
        if NEGATION.search(context):
            continue
        current = matches.get(canonical)
        if current is None:
            matches[canonical] = ResumeSkill(
                name=canonical, category=categories[canonical], evidence=_evidence(text, match.start(), match.end()),
                method=method, confidence="high",
            )
    for alias, canonical in AMBIGUOUS.items():
        match = _pattern(alias).search(text)
        if match and canonical not in matches:
            context = text[max(0, match.start() - 80):match.end() + 80]
            if re.search(r"\b(?:model|learning|trained|classification|regression|data)\b", context, re.IGNORECASE) and not NEGATION.search(context):
                matches[canonical] = ResumeSkill(
                    name=canonical, category=categories[canonical], evidence=_evidence(text, match.start(), match.end()),
                    method="context_inference", confidence="medium",
                )
    return tuple(sorted(matches.values(), key=lambda item: (item.category, item.name.casefold())))
