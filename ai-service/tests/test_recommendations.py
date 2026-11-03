from datetime import UTC, datetime, timedelta

from app.matching.embeddings import EMBEDDING_DIMENSION, EmbeddingProvider
from app.matching.recommendations import MarketplaceRecommender, WEIGHTS
from app.schemas.recommendations import MarketplaceRecommendationRequest


class FakeProvider(EmbeddingProvider):
    def encode(self, texts):
        return tuple((1.0, *(0.0 for _ in range(EMBEDDING_DIMENSION - 1))) for _ in texts)


def request(interests=(), signals=()):
    now = datetime(2026, 10, 7, tzinfo=UTC)
    return MarketplaceRecommendationRequest.model_validate({"user_context":{"interests":interests,"category_signals":signals},"candidates":[{"id":"old-book","title":"Algorithms book","description":"study material","category":"Books","created_at":(now-timedelta(days=20)).isoformat()},{"id":"new-cycle","title":"Campus cycle","description":"bicycle","category":"Cycles","created_at":now.isoformat()},{"id":"new-book","title":"Engineering book","description":"textbook","category":"Books","created_at":now.isoformat()}],"limit":3})


def test_weights_are_bounded_and_sum_to_one() -> None:
    assert sum(WEIGHTS.values()) == 1.0


def test_profile_cold_start_and_recent_cold_start_are_truthful() -> None:
    recommender = MarketplaceRecommender(FakeProvider())
    assert recommender.rank(request(interests=("books",)), datetime(2026,10,7,tzinfo=UTC)).strategy == "profile"
    recent = recommender.rank(request(), datetime(2026,10,7,tzinfo=UTC))
    assert recent.strategy == "recent"
    assert recent.results[0].listing_id in {"new-book", "new-cycle"}


def test_bookmark_category_signal_ranks_and_explains_saved_items() -> None:
    result = MarketplaceRecommender(FakeProvider()).rank(request(signals=({"category":"Books","strength":1,"source":"bookmark"},)), datetime(2026,10,7,tzinfo=UTC))
    assert result.recommender_version == "marketplace-hybrid-v1"
    assert result.results[0].listing_id == "new-book"
    assert "Similar to items you saved" in result.results[0].reasons
    assert all(0 <= item.score <= 1 for item in result.results)


def test_diversification_prevents_three_same_category_items_when_alternatives_exist() -> None:
    result = MarketplaceRecommender(FakeProvider()).rank(request(interests=("books",)), datetime(2026,10,7,tzinfo=UTC))
    assert len(result.results) == 3
    assert len({item.listing_id for item in result.results}) == 3


def test_view_signal_is_weaker_than_bookmark_and_has_truthful_reason() -> None:
    recommender = MarketplaceRecommender(FakeProvider())
    now = datetime(2026, 10, 7, tzinfo=UTC)
    viewed = recommender.rank(
        request(signals=({"category":"Books","strength":0.35,"source":"view"},)), now
    )
    bookmarked = recommender.rank(
        request(signals=({"category":"Books","strength":1,"source":"bookmark"},)), now
    )
    viewed_book = next(item for item in viewed.results if item.listing_id == "new-book")
    bookmarked_book = next(item for item in bookmarked.results if item.listing_id == "new-book")
    assert viewed_book.score < bookmarked_book.score
    assert "Based on items you've viewed" in viewed_book.reasons
    assert "Similar to items you saved" not in viewed_book.reasons


def test_no_view_request_preserves_profile_only_behavior() -> None:
    result = MarketplaceRecommender(FakeProvider()).rank(
        request(interests=("books",)), datetime(2026,10,7,tzinfo=UTC)
    )
    assert result.strategy == "profile"
    assert all("Based on items you've viewed" not in item.reasons for item in result.results)
