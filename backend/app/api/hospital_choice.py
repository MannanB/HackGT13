"""Serve the hospital choice model. Scoring stays on the client."""

from fastapi import APIRouter

from app.hospital_choice import model_payload

router = APIRouter(prefix="/api/v1/hospital-choice", tags=["hospital-choice"])


@router.get("/model")
def hospital_choice_model() -> dict:
    return model_payload()
