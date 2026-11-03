def test_match_endpoint_ranks_only_opposite_type_candidates() -> None:
    from test_operational_routes import create_client

    response = create_client().post(
        "/api/v1/lost-found/match",
        json={
            "query": {
                "id": "lost-1", "type": "LOST", "title": "Black wallet",
                "description": "Leather wallet near library", "category": "Wallets",
                "location": "Central Library", "incident_at": "2026-10-01",
            },
            "candidates": [
                {
                    "id": "found-match", "type": "FOUND", "title": "Dark leather wallet",
                    "description": "Wallet found at library entrance", "category": "Wallets",
                    "location": "Library Entrance", "incident_at": "2026-10-01",
                },
                {
                    "id": "found-negative", "type": "FOUND", "title": "White charger",
                    "description": "Charger found in hostel", "category": "Chargers",
                    "location": "Hostel", "incident_at": "2026-09-01",
                },
            ],
            "top_k": 1,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["matcher_version"] == "lf-baseline-v1"
    assert body["matches"][0]["report_id"] == "found-match"


def test_match_endpoint_rejects_invalid_direction_and_payloads() -> None:
    from test_operational_routes import create_client

    response = create_client().post(
        "/api/v1/lost-found/match",
        json={
            "query": {"id": "lost-1", "type": "LOST"},
            "candidates": [{"id": "lost-2", "type": "LOST"}],
            "top_k": 1,
        },
    )

    assert response.status_code == 422


def test_match_endpoint_enforces_candidate_and_top_k_bounds() -> None:
    from test_operational_routes import create_client

    candidate = {"id": "found", "type": "FOUND"}
    too_many_candidates = [
        {**candidate, "id": f"found-{index}"} for index in range(101)
    ]
    response = create_client().post(
        "/api/v1/lost-found/match",
        json={
            "query": {"id": "lost", "type": "LOST"},
            "candidates": too_many_candidates,
            "top_k": 1,
        },
    )
    assert response.status_code == 422

    response = create_client().post(
        "/api/v1/lost-found/match",
        json={
            "query": {"id": "lost", "type": "LOST"},
            "candidates": [candidate],
            "top_k": 21,
        },
    )
    assert response.status_code == 422
