"""Serve the trained model of a normal Atlanta day."""

from fastapi import APIRouter

from app.activity_model import model_payload

router = APIRouter(prefix="/api/v1/activity", tags=["activity"])


@router.get("/model")
def activity_model() -> dict:
    return model_payload()
