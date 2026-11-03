"""Deterministic, locally generated AI-4 image benchmark with no private data."""

import base64
from dataclasses import dataclass
from datetime import date
from io import BytesIO

from PIL import Image, ImageDraw

from app.schemas.lost_found import ImageEvidence, MatchReport

DATASET_VERSION = "lost-found-multimodal-v1"
DATASET_SEED = 20261022
CATEGORIES = ("Backpacks", "Bottles", "Earbuds", "Calculators", "Books", "Keys", "Wallets", "Chargers", "Umbrellas", "Glasses")
COLORS = ("navy", "teal", "purple", "gray", "brown", "gold", "black", "orange", "red", "green")


@dataclass(frozen=True)
class MultimodalCase:
    query: MatchReport
    candidates: tuple[MatchReport, ...]
    true_id: str
    slice_name: str


def _image(label: str, color: str) -> ImageEvidence:
    canvas = Image.new("RGB", (224, 224), "white")
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((28, 36, 196, 188), radius=24, fill=color, outline="black", width=4)
    draw.text((48, 96), label.upper(), fill="white")
    output = BytesIO()
    canvas.save(output, format="PNG", optimize=True)
    return ImageEvidence(content_base64=base64.b64encode(output.getvalue()).decode(), mime_type="image/png")


def generate_multimodal_dataset() -> tuple[MultimodalCase, ...]:
    cases: list[MultimodalCase] = []
    for index, (category, color) in enumerate(zip(CATEGORIES, COLORS, strict=True)):
        evidence = _image(category, color)
        query = MatchReport(id=f"q-{index}", type="LOST", title="Missing campus item", description="Dark personal item", category=category, location="Central Library", incident_at=date(2026, 10, 1), images=(evidence,))
        candidates = tuple(
            MatchReport(id=identifier, type="FOUND", title="Found campus item", description="Dark personal item", category=category, location="Central Library", incident_at=date(2026, 10, 1), images=(candidate_image,))
            for identifier, candidate_image in ((f"a-{index}", _image(category, COLORS[(index + 1) % len(COLORS)])), (f"b-{index}", _image(category, COLORS[(index + 2) % len(COLORS)])), (f"z-true-{index}", evidence))
        )
        cases.append(MultimodalCase(query, candidates, f"z-true-{index}", "visually_discriminative"))
    for index in range(2):
        query = MatchReport(id=f"q-missing-{index}", type="LOST", title=f"Missing {CATEGORIES[index]}", description="Distinctive labelled item", category=CATEGORIES[index], location="Cafeteria", incident_at=date(2026, 10, 2))
        candidates = (
            MatchReport(id=f"a-true-missing-{index}", type="FOUND", title=f"Found {CATEGORIES[index]}", description="Distinctive labelled item", category=CATEGORIES[index], location="Cafeteria", incident_at=date(2026, 10, 2)),
            MatchReport(id=f"z-negative-missing-{index}", type="FOUND", title="Found unrelated object", description="Different object", category=CATEGORIES[index], location="Hostel", incident_at=date(2026, 9, 1)),
        )
        cases.append(MultimodalCase(query, candidates, f"a-true-missing-{index}", "missing_image_fallback"))
    return tuple(cases)
