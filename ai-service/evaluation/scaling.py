"""Deterministic synthetic corpus and pure in-memory helpers for AI-3 measurements."""

from dataclasses import dataclass
from datetime import date, timedelta
from random import Random

import numpy as np

from app.matching.baseline import category_score, location_score, time_score
from app.schemas.lost_found import MatchReport

SCALING_CORPUS_VERSION = "lost-found-scaling-v1"
SCALING_SEED = 20261021
SCALING_REPORT_COUNT = 10_000
SCALING_PAIR_COUNT = SCALING_REPORT_COUNT // 2
SCALE_LEVELS = (100, 500, 1_000, 5_000, 10_000)
CANDIDATE_POOL_LEVELS = (50, 100, 250, 500)

ITEMS = (
    ("Wallets", "leather wallet", "billfold"),
    ("ID cards", "student identity card", "university ID"),
    ("Keys", "silver key ring", "metal keychain"),
    ("Phones", "Samsung phone", "Galaxy mobile"),
    ("Earbuds", "wireless earbuds", "Bluetooth earphones"),
    ("Chargers", "USB C charger", "power adapter"),
    ("Bags", "blue backpack", "blue rucksack"),
    ("Watches", "digital wrist watch", "electronic timepiece"),
    ("Water bottles", "water bottle", "water flask"),
    ("Books", "engineering notebook", "course exercise book"),
    ("Calculators", "scientific calculator", "exam calculation device"),
    ("Glasses", "black frame glasses", "dark spectacles"),
    ("Umbrellas", "folding umbrella", "compact rain umbrella"),
    ("Stationery", "pencil pouch", "writing supplies case"),
    ("Laptops", "laptop computer", "portable notebook computer"),
    ("Bicycles", "campus bicycle", "pedal cycle"),
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
    ("Student Centre", "Student Union", "student hub"),
    ("Bus Stop", "Transit Shelter", "campus transport stop"),
)
MARKS = (
    "red striped",
    "blue checked",
    "green patterned",
    "orange labelled",
    "purple tagged",
    "yellow marked",
    "black engraved",
    "white stickered",
    "silver banded",
    "gold trimmed",
)


@dataclass(frozen=True)
class ScalingEntry:
    """A report plus evaluation-only pairing metadata not present on MatchReport."""

    report: MatchReport
    paired_report_id: str


def generate_scaling_corpus(
    seed: int = SCALING_SEED, pair_count: int = SCALING_PAIR_COUNT
) -> tuple[ScalingEntry, ...]:
    """Generate up to 5,000 LOST/FOUND pairs without production or student data."""

    if pair_count < 1 or pair_count > SCALING_PAIR_COUNT:
        raise ValueError("pair count must be within the scaling corpus")
    random = Random(seed)
    entries: list[ScalingEntry] = []
    start = date(2026, 1, 1)
    for index in range(pair_count):
        category, item, synonym = ITEMS[index % len(ITEMS)]
        primary, alternate, semantic_location = LOCATIONS[index % len(LOCATIONS)]
        mark = MARKS[(index // len(ITEMS)) % len(MARKS)]
        reference = f"set {index % 97 + 1}"
        incident_at = start + timedelta(days=random.randrange(180))
        lost_id = f"scale-lost-{index:04d}"
        found_id = f"scale-found-{index:04d}"
        entries.extend(
            (
                ScalingEntry(
                    report=MatchReport(
                        id=lost_id,
                        type="LOST",
                        title=f"Missing {mark} {item}",
                        description=(
                            f"Lost a {mark} {item} near the {semantic_location}; "
                            f"identifying detail {reference}."
                        ),
                        category=category,
                        location=primary,
                        incident_at=incident_at,
                    ),
                    paired_report_id=found_id,
                ),
                ScalingEntry(
                    report=MatchReport(
                        id=found_id,
                        type="FOUND",
                        title=f"Recovered {mark} {synonym}",
                        description=(
                            f"A {mark} {synonym} was handed in close to the {alternate}; "
                            f"identifying detail {reference}."
                        ),
                        category=category,
                        location=alternate,
                        incident_at=incident_at + timedelta(days=random.randrange(3)),
                    ),
                    paired_report_id=lost_id,
                ),
            )
        )
    return tuple(entries)


def select_query_entries(entries: tuple[ScalingEntry, ...], count: int) -> tuple[ScalingEntry, ...]:
    """Return a stable, evenly spaced LOST query sample with known FOUND matches."""

    lost = tuple(entry for entry in entries if entry.report.type == "LOST")
    if count < 1 or count > len(lost):
        raise ValueError("query count must be within the available LOST reports")
    step = len(lost) / count
    return tuple(lost[int(index * step)] for index in range(count))


def controlled_candidate_indices(
    entries: tuple[ScalingEntry, ...], query: ScalingEntry, candidate_count: int, seed: int
) -> tuple[int, ...]:
    """Build a deterministic stress pool that always includes the true match.

    This intentionally isolates vector-ranking behavior from candidate exclusion.
    """

    if candidate_count < 1 or candidate_count > len(entries):
        raise ValueError("candidate count must be between 1 and corpus size")
    target_index = next(
        index for index, entry in enumerate(entries) if entry.report.id == query.paired_report_id
    )
    query_index = next(index for index, entry in enumerate(entries) if entry.report.id == query.report.id)
    available = [index for index in range(len(entries)) if index not in {query_index, target_index}]
    random = Random(f"{seed}:{query.report.id}:{candidate_count}")
    random.shuffle(available)
    selected = [target_index, *available[: candidate_count - 1]]
    if candidate_count == len(entries):
        # The corpus contains the query itself, which must never be a candidate. Add one
        # deterministic duplicate distractor only for the 10,000-vector stress measurement.
        selected.append(available[0])
    return tuple(selected)


def metadata_candidate_indices(
    query: ScalingEntry, found_entries: tuple[ScalingEntry, ...], candidate_count: int
) -> tuple[int, ...]:
    """Deterministic metadata-only proxy for bounded pre-FastAPI candidate selection."""

    if candidate_count < 1 or candidate_count > len(found_entries):
        raise ValueError("candidate count must be within the FOUND corpus")

    return metadata_candidate_order(query, found_entries)[:candidate_count]


def metadata_candidate_order(
    query: ScalingEntry, found_entries: tuple[ScalingEntry, ...]
) -> tuple[int, ...]:
    """Return the complete deterministic metadata ordering for prefix reuse."""

    def score(entry: ScalingEntry) -> float:
        candidate = entry.report
        return (
            0.70 * category_score(query.report, candidate)
            + 0.20 * location_score(query.report, candidate)
            + 0.10 * time_score(query.report, candidate)
        )

    return tuple(
        sorted(
            range(len(found_entries)),
            key=lambda index: (-score(found_entries[index]), found_entries[index].report.id),
        )
    )


def top_k_indices(query_vector: np.ndarray, candidate_matrix: np.ndarray, top_k: int) -> tuple[int, ...]:
    """Return deterministic descending cosine-similarity positions for normalized vectors."""

    if candidate_matrix.ndim != 2 or query_vector.ndim != 1:
        raise ValueError("vectors must be a matrix and a vector")
    if candidate_matrix.shape[1] != query_vector.shape[0]:
        raise ValueError("vector dimensions must match")
    if top_k < 1:
        raise ValueError("top_k must be positive")
    scores = candidate_matrix @ query_vector
    ordered = np.argsort(-scores, kind="stable")
    return tuple(int(index) for index in ordered[: min(top_k, len(ordered))])


def rank_of_target(
    query_vector: np.ndarray, candidate_matrix: np.ndarray, target_position: int, top_k: int = 5
) -> int:
    """Return a one-based target rank within a cutoff, or zero if it is absent."""

    positions = top_k_indices(query_vector, candidate_matrix, top_k)
    return next((index + 1 for index, position in enumerate(positions) if position == target_position), 0)


def recall_at(ranks: tuple[int, ...], cutoff: int) -> float:
    """Compute recall for one relevant candidate per query; zero denotes not retrieved."""

    if not ranks or cutoff < 1:
        return 0.0
    return sum(0 < rank <= cutoff for rank in ranks) / len(ranks)


def validate_scaling_result(result: dict[str, object]) -> None:
    """Validate the public shape of a generated measurement artifact."""

    if result.get("status") != "complete":
        raise ValueError("scaling result is not complete")
    provenance = result.get("provenance")
    if not isinstance(provenance, dict):
        raise ValueError("scaling result requires provenance")
    required_provenance = {
        "run_id",
        "started_at",
        "completed_at",
        "evaluator_version",
        "stages_completed",
    }
    if not required_provenance.issubset(provenance):
        raise ValueError("scaling result provenance is incomplete")
    configuration = result.get("configuration")
    if not isinstance(configuration, dict):
        raise ValueError("scaling result requires configuration")
    mode = result.get("mode")
    if mode == "full":
        if result.get("corpus_size") != SCALING_REPORT_COUNT:
            raise ValueError("full scaling result has an unexpected corpus size")
        expected_scales = list(SCALE_LEVELS)
        expected_pools = list(CANDIDATE_POOL_LEVELS)
    elif mode == "quick":
        expected_scales = configuration.get("scale_levels")
        expected_pools = configuration.get("candidate_pool_levels")
        if not isinstance(expected_scales, list) or not isinstance(expected_pools, list):
            raise ValueError("quick scaling configuration is incomplete")
    else:
        raise ValueError("scaling result has an invalid mode")
    scale_results = result.get("scale_results")
    candidate_pool_results = result.get("candidate_pool_results")
    if not isinstance(scale_results, list) or not isinstance(candidate_pool_results, list):
        raise ValueError("scaling result requires result lists")
    if [item.get("candidate_count") for item in scale_results if isinstance(item, dict)] != list(
        expected_scales
    ):
        raise ValueError("scaling result is missing required scale levels")
    if [item.get("candidate_pool") for item in candidate_pool_results if isinstance(item, dict)] != list(
        expected_pools
    ):
        raise ValueError("scaling result is missing required candidate-pool levels")
