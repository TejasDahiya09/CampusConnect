"""Deterministic AI-4B benchmark built from self-generated, transformed fixtures."""

import base64
import random
from dataclasses import dataclass
from datetime import date, timedelta
from io import BytesIO
from typing import Literal

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from app.schemas.lost_found import ImageEvidence, MatchReport

BENCHMARK_VERSION = "lost-found-multimodal-realistic-v1"
BENCHMARK_SEED = 20261023
CASE_COUNT = 120
CATEGORIES = ("Backpacks", "Water bottles", "Calculators", "Earbuds cases", "Keys", "Wallets", "Chargers", "Umbrellas", "Glasses", "Books")
DIFFICULTIES = ("EASY", "MODERATE", "HARD")
INTERACTIONS = ("text_ambiguous_image_useful", "image_ambiguous_text_useful", "both_helpful", "conflicting_image", "conflicting_text", "near_duplicate")
Difficulty = Literal["EASY", "MODERATE", "HARD"]


@dataclass(frozen=True)
class RealisticCase:
    query: MatchReport
    candidates: tuple[MatchReport, ...]
    true_id: str
    category: str
    difficulty: Difficulty
    interaction: str
    transformations: tuple[str, ...]
    has_bilateral_images: bool
    hard_negative_ids: tuple[str, ...]


def _base_image(category: str, identity: int) -> Image.Image:
    colors = ((28, 55, 90), (36, 96, 83), (91, 55, 110), (110, 65, 48), (35, 35, 38), (140, 91, 25))
    image = Image.new("RGB", (256, 256), (218, 215, 205))
    draw = ImageDraw.Draw(image)
    color = colors[identity % len(colors)]
    inset = 28 + (identity % 4) * 4
    draw.rounded_rectangle((inset, 35, 256 - inset, 214), radius=18 + identity % 12, fill=color, outline=(15, 15, 15), width=5)
    for stripe in range(1 + identity % 4):
        x = 55 + stripe * 35
        draw.line((x, 48, x + (identity % 3) * 8, 200), fill=(235, 235, 220), width=4)
    draw.ellipse((92, 84, 164, 156), outline=(255, 190, 35), width=5 + identity % 4)
    draw.text((42, 222), f"{category[:8]}-{identity:02d}", fill=(20, 20, 20))
    return image


def _transform(image: Image.Image, difficulty: Difficulty, seed: int) -> tuple[Image.Image, tuple[str, ...]]:
    randomizer = random.Random(seed)
    names: list[str] = ["resize"]
    transformed = image.resize((224, 224))
    angle = {"EASY": 4, "MODERATE": 12, "HARD": 21}[difficulty] * (-1 if seed % 2 else 1)
    transformed = transformed.rotate(angle, resample=Image.Resampling.BICUBIC, fillcolor=(195, 200, 205))
    names.append("rotation")
    if difficulty != "EASY":
        crop = 12 if difficulty == "MODERATE" else 24
        transformed = transformed.crop((crop, crop // 2, 224 - crop // 2, 224 - crop)).resize((224, 224))
        transformed = ImageEnhance.Brightness(transformed).enhance(0.72 if seed % 2 else 1.28)
        transformed = ImageEnhance.Contrast(transformed).enhance(1.18)
        names.extend(("crop", "brightness", "contrast", "scale"))
    if difficulty == "HARD":
        transformed = transformed.transform((224, 224), Image.Transform.AFFINE, (1, 0.10, -12, 0.04, 1, -6), resample=Image.Resampling.BICUBIC)
        transformed = transformed.filter(ImageFilter.GaussianBlur(radius=1.4))
        pixels = transformed.load()
        for _ in range(1300):
            x, y = randomizer.randrange(224), randomizer.randrange(224)
            pixels[x, y] = tuple(max(0, min(255, channel + randomizer.randint(-24, 24))) for channel in pixels[x, y])
        draw = ImageDraw.Draw(transformed)
        draw.rectangle((145, 115, 223, 176), fill=(82, 94, 74))
        draw.rectangle((0, 190, 224, 224), fill=(125, 108, 92))
        names.extend(("angle_affine", "blur", "noise", "partial_occlusion", "background_clutter"))
    return transformed, tuple(names)


def _evidence(image: Image.Image) -> ImageEvidence:
    output = BytesIO()
    image.save(output, format="JPEG", quality=88, optimize=True)
    return ImageEvidence(content_base64=base64.b64encode(output.getvalue()).decode(), mime_type="image/jpeg")


def generate_realistic_benchmark(case_count: int = CASE_COUNT) -> tuple[RealisticCase, ...]:
    if case_count < 1 or case_count > CASE_COUNT:
        raise ValueError("case_count must be between 1 and 120")
    cases: list[RealisticCase] = []
    for index in range(case_count):
        category = CATEGORIES[index % len(CATEGORIES)]
        difficulty = DIFFICULTIES[index % len(DIFFICULTIES)]
        interaction = INTERACTIONS[index % len(INTERACTIONS)]
        identity = index % 6
        source = _base_image(category, identity)
        query_image, query_transforms = _transform(source, difficulty, BENCHMARK_SEED + index)
        true_image, true_transforms = _transform(source, difficulty, BENCHMARK_SEED + 1000 + index)
        missing_mode = index % 10
        query_images = () if missing_mode in (0, 2) else (_evidence(query_image),)
        true_images = () if missing_mode in (1, 2) else (_evidence(true_image),)
        ambiguous_text = interaction in ("text_ambiguous_image_useful", "conflicting_text", "near_duplicate")
        query_title = "Missing dark campus item" if ambiguous_text else f"Missing {category} mark {identity}"
        true_title = "Found dark campus item" if ambiguous_text else f"Found {category} mark {identity}"
        incident = date(2026, 9, 1) + timedelta(days=index % 20)
        query = MatchReport(id=f"q-{index:03d}", type="LOST", title=query_title, description=f"Personal item with mark {identity if not ambiguous_text else 'unknown'}", category=category, location="Central Library", incident_at=incident, images=query_images)
        candidates: list[MatchReport] = []
        hard_ids: list[str] = []
        for candidate_index in range(5):
            is_true = candidate_index == 4
            candidate_identity = identity if is_true else (identity + candidate_index + 1) % 6
            base = source if is_true else _base_image(category, candidate_identity)
            variant, _ = _transform(base, difficulty, BENCHMARK_SEED + 2000 + index * 10 + candidate_index)
            candidate_id = f"{'z-true' if is_true else chr(97 + candidate_index) + '-hard'}-{index:03d}"
            images = true_images if is_true else (_evidence(variant),)
            title_identity = identity if is_true else candidate_identity
            title = "Found dark campus item" if ambiguous_text else f"Found {category} mark {title_identity}"
            if interaction == "image_ambiguous_text_useful" and not is_true:
                images = (_evidence(true_image),)
            candidates.append(MatchReport(id=candidate_id, type="FOUND", title=title, description=f"Item with mark {title_identity}", category=category, location="Central Library" if is_true else "Library Entrance", incident_at=incident if is_true else incident + timedelta(days=2), images=images))
            if not is_true:
                hard_ids.append(candidate_id)
        cases.append(RealisticCase(query=query, candidates=tuple(candidates), true_id=f"z-true-{index:03d}", category=category, difficulty=difficulty, interaction=interaction, transformations=tuple(sorted(set((*query_transforms, *true_transforms)))), has_bilateral_images=bool(query_images and true_images), hard_negative_ids=tuple(hard_ids)))
    return tuple(cases)
