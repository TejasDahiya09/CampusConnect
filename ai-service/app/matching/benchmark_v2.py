"""Frozen-rules, deterministic Benchmark V2 for fair matcher comparison."""

from dataclasses import dataclass
from datetime import date, timedelta
from random import Random
from typing import Literal

from app.schemas.lost_found import MatchReport

BENCHMARK_VERSION = "lost-found-benchmark-v2"
RANDOM_SEED = 20261020
Difficulty = Literal["EASY", "MODERATE", "HARD"]
DIFFICULTY_COUNTS: dict[Difficulty, int] = {"EASY": 150, "MODERATE": 175, "HARD": 175}

ITEMS = (
    ("Wallets", "black leather wallet", "dark billfold"),
    ("ID cards", "student identity card", "university ID"),
    ("Keys", "silver key ring", "metal keychain"),
    ("Phones", "Samsung phone with black case", "Galaxy mobile in dark cover"),
    ("Earbuds", "wireless earbuds in a white charging case", "Bluetooth earphones case"),
    ("Chargers", "white USB C charger", "power adapter"),
    ("Bags", "blue backpack with maths notebook", "blue rucksack containing a mathematics book"),
    ("Watches", "digital wrist watch", "electronic timepiece"),
    ("Water bottles", "blue water bottle", "blue water flask"),
    ("Books", "engineering notebook", "course exercise book"),
    ("Calculators", "scientific calculator", "exam calculation device"),
    ("Glasses", "black frame glasses", "dark spectacles"),
    ("Umbrellas", "folding umbrella", "compact rain umbrella"),
    ("Stationery", "pencil pouch", "writing supplies case"),
)
LOCATIONS = (
    ("Central Library", "Library Entrance", "reading hall"),
    ("Cafeteria", "Food Court", "dining area"),
    ("Classroom Block A", "Lecture Hall A", "teaching block"),
    ("Laboratory", "Science Lab", "lab corridor"),
    ("Parking Area", "Vehicle Parking", "parking lot"),
    ("Auditorium", "Main Hall", "event hall"),
    ("Sports Area", "Sports Ground", "athletics zone"),
    ("Hostel Common Area", "Residence Lounge", "hostel lounge"),
)


@dataclass(frozen=True)
class BenchmarkReport:
    report: MatchReport
    ground_truth_id: str
    difficulty: Difficulty


def _descriptions(
    difficulty: Difficulty, item: str, synonym: str, location: tuple[str, str, str]
) -> tuple[str, str, str, str]:
    primary, alternate, semantic = location
    if difficulty == "EASY":
        return (
            f"Lost {item} near {primary.lower()}.",
            f"Found {item} close to {alternate.lower()}.",
            f"Lost {item}",
            f"Found {item}",
        )
    if difficulty == "MODERATE":
        return (
            f"Missing {item} around the {primary.lower()}.",
            f"{synonym.title()} picked up by the {alternate.lower()}.",
            f"Missing {item}",
            f"Found {synonym}",
        )
    return (
        f"My {item} disappeared near the {semantic}.",
        f"A {synonym} was handed in beside the {alternate.lower()}.",
        f"Missing personal item near {semantic}",
        f"Item handed in at {alternate}",
    )


def generate_benchmark_v2(seed: int = RANDOM_SEED) -> tuple[BenchmarkReport, ...]:
    random = Random(seed)
    difficulties = tuple(
        difficulty for difficulty, count in DIFFICULTY_COUNTS.items() for _ in range(count)
    )
    reports: list[BenchmarkReport] = []
    start = date(2026, 1, 1)
    for index, difficulty in enumerate(difficulties):
        category, item, synonym = ITEMS[index % len(ITEMS)]
        location = LOCATIONS[index % len(LOCATIONS)]
        incident = start + timedelta(days=random.randrange(120))
        lost_description, found_description, lost_title, found_title = _descriptions(
            difficulty, item, synonym, location
        )
        truth = f"v2-item-{index:03d}"
        reports.extend(
            (
                BenchmarkReport(
                    MatchReport(
                        id=f"v2-lost-{index:03d}",
                        type="LOST",
                        title=lost_title,
                        description=lost_description,
                        category=category,
                        location=location[0],
                        incident_at=incident,
                    ),
                    truth,
                    difficulty,
                ),
                BenchmarkReport(
                    MatchReport(
                        id=f"v2-found-{index:03d}",
                        type="FOUND",
                        title=found_title,
                        description=found_description,
                        category=category,
                        location=location[1],
                        incident_at=incident + timedelta(days=random.randrange(3)),
                    ),
                    truth,
                    difficulty,
                ),
            )
        )
    return tuple(reports)
