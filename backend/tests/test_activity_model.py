from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_activity_model_is_trained() -> None:
    response = client.get("/api/v1/activity/model")
    assert response.status_code == 200
    body = response.json()
    assert body["trained"] is True
    assert body["kind"] == "activity_rate"
    assert body["features"] == [
        "worker_share",
        "employed_share",
        "transit_share",
        "limited_english_share",
        "log_income",
        "jobs_per_resident",
        "km_to_downtown",
    ]
    assert body["categories"]
    assert len(body["bias"]) == len(body["categories"])
    assert len(body["sensitivity"]) == len(body["categories"])
    assert len(body["makeupWeights"]) == len(body["features"])
    assert body["walkMetersPerMinute"] > 0
    assert body["transferPenaltyMinutes"] >= 0
    assert body["training"]["observedWeekdayBoardings"] > 0
    assert body["training"]["stationCorrelation"] > 0
