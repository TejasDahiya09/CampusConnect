from dataclasses import dataclass
from datetime import date, timedelta
from random import Random

from app.schemas.lost_found import MatchReport

DATASET_VERSION = "lf-synthetic-v1"
RANDOM_SEED = 20261006
ITEMS = [
    ("Wallets", "black leather wallet"), ("ID cards", "student identification card"),
    ("Keys", "silver key ring"), ("Phones", "Samsung phone in black case"),
    ("Earbuds", "wireless earbuds charging case"), ("Chargers", "white USB C charger"),
    ("Bags", "black backpack"), ("Watches", "digital wrist watch"),
    ("Water bottles", "blue water bottle"), ("Books", "engineering notebook"),
    ("Calculators", "scientific calculator"), ("Glasses", "black frame glasses"),
    ("Umbrellas", "folding umbrella"), ("Stationery", "pencil pouch"),
]
LOCATIONS = ["Central Library", "Library Entrance", "Cafeteria", "Classroom Block A", "Laboratory", "Parking Area", "Auditorium", "Sports Area", "Hostel Common Area", "Main Corridor", "Reception"]


@dataclass(frozen=True)
class SyntheticReport:
    report: MatchReport
    ground_truth_id: str


def generate_reports(seed: int = RANDOM_SEED) -> tuple[SyntheticReport, ...]:
    random = Random(seed)
    reports: list[SyntheticReport] = []
    start = date(2026, 8, 1)
    for index in range(250):
        category, item = ITEMS[index % len(ITEMS)]
        location = LOCATIONS[index % len(LOCATIONS)]
        incident = start + timedelta(days=random.randrange(60))
        ground_truth_id = f"item-{index:03d}"
        reports.extend(
            [
                SyntheticReport(
                    MatchReport(id=f"lost-{index:03d}", type="LOST", title=f"Lost {item}", description=f"Lost {item} near {location.lower()}.", category=category, location=location, incident_at=incident),
                    ground_truth_id,
                ),
                SyntheticReport(
                    MatchReport(id=f"found-{index:03d}", type="FOUND", title=f"Found {item}", description=f"{item.title()} found close to {location.lower()}.", category=category, location=location.replace("Central ", ""), incident_at=incident + timedelta(days=random.randrange(3)),),
                    ground_truth_id,
                ),
            ]
        )
    return tuple(reports)
