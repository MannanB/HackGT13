from fastapi.testclient import TestClient

from app.hospital_choice import probabilities, utility
from app.main import app

client = TestClient(app)


def test_untrained_model_is_served() -> None:
    response = client.get("/api/v1/hospital-choice/model")
    assert response.status_code == 200
    body = response.json()
    assert body["trained"] is False
    assert body["kind"] == "conditional_logit"
    assert body["features"] == ["travel_minutes", "log_beds", "occupancy"]
    assert body["weights"] == [-1.0, 2.0, -8.0]
    assert body["training"]["loss"] == "cross_entropy"
    assert body["training"]["rows"] > 0


def test_larger_hospital_can_beat_a_slightly_closer_one() -> None:
    closer = utility(10, 100, 0.5)
    larger = utility(12, 400, 0.5)
    assert larger > closer
    shares = probabilities(
        [
            {"travel_minutes": 10, "beds": 100, "occupancy": 0.5},
            {"travel_minutes": 12, "beds": 400, "occupancy": 0.5},
        ]
    )
    assert shares[1] > shares[0]
    assert abs(sum(shares) - 1) < 1e-9
