"""Real MiniLM checks for the proposed nine-report examiner demonstration dataset."""

from datetime import date

import pytest

from app.matching.embeddings import SentenceTransformerEmbeddingProvider
from app.matching.semantic import SemanticMatcher
from app.schemas.lost_found import MatchReport


@pytest.fixture(scope="module")
def reports() -> tuple[MatchReport, ...]:
    values = (
        ("notebook-lost", "LOST", "Blue Data Structures Notebook", "I misplaced a blue notebook containing handwritten Data Structures notes and algorithm diagrams after the DSA class in the Central Library.", "Books", "Central Library", "2026-10-06"),
        ("earbuds-found", "FOUND", "Bluetooth Earphones with Black Charging Case", "Found a pair of Bluetooth earphones inside a small black charging case near the Student Centre seating area.", "Electronics", "Student Centre", "2026-10-07"),
        ("calculator-lost", "LOST", "Casio FX-991ES Plus Scientific Calculator", "Lost my Casio FX-991ES Plus scientific calculator after an engineering tutorial. It has a dark grey cover and my initials inside the case.", "Electronics", "Engineering Block", "2026-10-05"),
        ("notebook-found", "FOUND", "Blue DSA Class Notes Register", "A blue register filled with DSA class notes, linked-list sketches, and sorting examples was found on a Central Library desk.", "Books", "Central Library", "2026-10-06"),
        ("bottle-found", "FOUND", "Blue Steel Water Bottle", "Found a blue stainless-steel water bottle beside the Sports Complex court. It has a silver screw cap and no visible name.", "Drinkware", "Sports Complex", "2026-10-07"),
        ("backpack-found", "FOUND", "Dark Grey Student Laptop Bag", "Found a dark grey student laptop bag near the Student Centre. It has padded shoulder straps and a separate laptop compartment.", "Accessories", "Student Centre", "2026-10-07"),
        ("earbuds-lost", "LOST", "Black Wireless Earbuds in Charging Case", "I lost black wireless earbuds in their compact charging case while studying near the Student Centre. The case has a small scratch on its lid.", "Electronics", "Student Centre", "2026-10-06"),
        ("calculator-found", "FOUND", "Casio FX-991ES Plus Scientific Calculator", "Found a Casio FX-991ES Plus scientific calculator with a dark grey protective cover in the Engineering Block seminar room.", "Electronics", "Engineering Block", "2026-10-05"),
        ("backpack-lost", "LOST", "Grey College Backpack", "Lost a grey college backpack with padded laptop storage and two front pockets near the Student Centre entrance.", "Accessories", "Student Centre", "2026-10-06"),
    )
    return tuple(
        MatchReport(
            id=id_,
            type=type_,
            title=title,
            description=description,
            category=category,
            location=location,
            incident_at=date.fromisoformat(incident_at),
        )
        for id_, type_, title, description, category, location, incident_at in values
    )


@pytest.fixture(scope="module")
def rankings(reports: tuple[MatchReport, ...]):
    matcher = SemanticMatcher(SentenceTransformerEmbeddingProvider("cpu", 1))
    return {
        query.id: matcher.rank(
            query,
            [candidate for candidate in reports if candidate.type != query.type],
            5,
        )
        for query in reports
    }


def test_intended_pairs_rank_first_in_both_directions(rankings) -> None:
    pairs = (
        ("calculator-lost", "calculator-found"),
        ("earbuds-lost", "earbuds-found"),
        ("notebook-lost", "notebook-found"),
        ("backpack-lost", "backpack-found"),
    )
    for lost_id, found_id in pairs:
        assert rankings[lost_id].matches[0].report_id == found_id
        assert rankings[found_id].matches[0].report_id == lost_id
        assert rankings[lost_id].matches[0].confidence != "LOW"
        assert rankings[found_id].matches[0].confidence != "LOW"


def test_unrelated_demo_reports_are_suppressed_from_results(rankings) -> None:
    assert "earbuds-found" not in {
        match.report_id for match in rankings["backpack-lost"].matches
    }
    assert "backpack-lost" not in {
        match.report_id for match in rankings["earbuds-found"].matches
    }
    assert "calculator-found" not in {
        match.report_id for match in rankings["earbuds-lost"].matches
    }


def test_water_bottle_remains_an_unrelated_negative_control(rankings) -> None:
    assert rankings["bottle-found"].matches == ()
    assert all(
        rankings[source].matches[0].report_id != "bottle-found"
        for source in ("calculator-lost", "earbuds-lost", "notebook-lost", "backpack-lost")
    )
