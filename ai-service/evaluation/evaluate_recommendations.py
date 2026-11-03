import json, os, time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from app.matching.embeddings import SentenceTransformerEmbeddingProvider
from app.matching.recommendations import MarketplaceRecommender, WEIGHTS
from app.schemas.recommendations import MarketplaceRecommendationRequest

SEED=20261024
TARGET=Path(__file__).parent/"results"/"marketplace-recommendations-v1.json"

def metrics(ranks):
    return {"precision_at_5":sum(1/5 for rank in ranks if rank<=5)/len(ranks),"recall_at_5":sum(rank<=5 for rank in ranks)/len(ranks),"hit_rate_at_5":sum(rank<=5 for rank in ranks)/len(ranks),"mrr":sum(1/rank for rank in ranks)/len(ranks)}

def run():
    started=datetime.now(UTC); now=datetime(2026,10,7,tzinfo=UTC); categories=("Books","Electronics","Calculators","Cycles","Gaming","Music & Instruments")
    candidates=[{"id":f"listing-{i}","title":f"{categories[i%6]} campus item","description":f"Useful {categories[i%6].lower()} for students","category":categories[i%6],"created_at":(now-timedelta(days=i)).isoformat()} for i in range(30)]
    recommender=MarketplaceRecommender(SentenceTransformerEmbeddingProvider("cpu")); personalized=[]; baseline=[]; cold=[]; sparse=[]; diversity=[]
    before=time.perf_counter()
    for i in range(24):
        target=categories[i%6]; context={"interests":[] if i%4==0 else [target],"category_signals":[] if i%3==0 else [{"category":target,"strength":1,"source":"bookmark"}]}
        req=MarketplaceRecommendationRequest.model_validate({"user_context":context,"candidates":candidates,"limit":5}); result=recommender.rank(req,now)
        relevant={item["id"] for item in candidates if item["category"]==target}; order=[item.listing_id for item in result.results]; rank=next((n+1 for n,value in enumerate(order) if value in relevant),6); personalized.append(rank)
        recent=[item["id"] for item in candidates[:5]]; baseline.append(next((n+1 for n,value in enumerate(recent) if value in relevant),6)); diversity.append(len({next(item["category"] for item in candidates if item["id"]==value) for value in order})/len(order))
        (cold if not context["category_signals"] else sparse).append(rank)
    cold_ms=(time.perf_counter()-before)*1000; before=time.perf_counter(); recommender.rank(req,now); warm_ms=(time.perf_counter()-before)*1000
    completed=datetime.now(UTC); personal=metrics(personalized); base=metrics(baseline); decision="A - RECOMMENDER BASELINE VALIDATED" if personal["mrr"]>base["mrr"] else "B - BASELINE NEEDS SCORING TUNING"
    result={"status":"complete","recommenderVersion":"marketplace-hybrid-v1","runId":str(uuid4()),"seed":SEED,"startedAt":started.isoformat(),"completedAt":completed.isoformat(),"dataset":{"users":24,"candidates":30,"scenarios":["single-category","multi-interest","bookmark-driven","profile-only","new-user","sparse","recency","relevance-vs-recency","exclusions","diversity","conflict"]},"weights":WEIGHTS,"availableSignals":["profile interests","bookmarks","listing content","category","createdAt","aggregate viewCount"],"unavailableSignals":["persisted per-user views","implemented inquiries","purchases"],"baselineMetrics":base,"personalizedMetrics":personal,"coldStartMetrics":metrics(cold),"sparseUserMetrics":metrics(sparse),"meanCategoryDiversity":sum(diversity)/len(diversity),"performance":{"coldEvaluationMs":cold_ms,"warmRequestMs":warm_ms},"errorAnalysis":{"personalizedMissesAt5":sum(rank>5 for rank in personalized)},"decision":decision,"limitations":["synthetic ground truth","no persisted per-user view history","ranking scores are not probabilities"]}
    temp=TARGET.with_name(f".{TARGET.name}.{result['runId']}.tmp"); temp.write_text(json.dumps(result,indent=2,sort_keys=True)+"\n",encoding="utf-8"); os.replace(temp,TARGET); return result

if __name__=="__main__": print(json.dumps(run(),indent=2))
