"""Farmageddon mini-game wave configuration endpoint."""

from fastapi import APIRouter

from app.schemas.farmageddon import WaveConfigResponse

router = APIRouter()

# Lane is randomized at spawn time by the frontend — the lane field is ignored.
WAVES = [
    {
        "wave_number": 1,
        "delay_before_ms": 3000,
        "spawns": [
            {"lane": 0, "delay_ms": 0, "goblin_type": "basic"},
            {"lane": 0, "delay_ms": 1500, "goblin_type": "basic"},
        ],
    },
    {
        "wave_number": 2,
        "delay_before_ms": 5000,
        "spawns": [
            {"lane": 0, "delay_ms": 0, "goblin_type": "basic"},
            {"lane": 0, "delay_ms": 500, "goblin_type": "basic"},
            {"lane": 0, "delay_ms": 1200, "goblin_type": "basic"},
        ],
    },
    {
        "wave_number": 3,
        "delay_before_ms": 5000,
        "spawns": [
            {"lane": 0, "delay_ms": 0, "goblin_type": "basic"},
            {"lane": 0, "delay_ms": 400, "goblin_type": "basic"},
            {"lane": 0, "delay_ms": 800, "goblin_type": "basic"},
            {"lane": 0, "delay_ms": 1600, "goblin_type": "basic"},
        ],
    },
    {
        "wave_number": 4,
        "delay_before_ms": 6000,
        "spawns": [
            {"lane": 0, "delay_ms": 0, "goblin_type": "basic"},
            {"lane": 0, "delay_ms": 300, "goblin_type": "basic"},
            {"lane": 0, "delay_ms": 600, "goblin_type": "basic"},
            {"lane": 0, "delay_ms": 1200, "goblin_type": "basic"},
            {"lane": 0, "delay_ms": 1800, "goblin_type": "basic"},
        ],
    },
    {
        "wave_number": 5,
        "delay_before_ms": 6000,
        "spawns": [
            {"lane": 0, "delay_ms": 0, "goblin_type": "basic"},
            {"lane": 0, "delay_ms": 200, "goblin_type": "basic"},
            {"lane": 0, "delay_ms": 400, "goblin_type": "basic"},
            {"lane": 0, "delay_ms": 1000, "goblin_type": "basic"},
            {"lane": 0, "delay_ms": 1400, "goblin_type": "basic"},
            {"lane": 0, "delay_ms": 1800, "goblin_type": "basic"},
        ],
    },
]


@router.get("/waves", response_model=WaveConfigResponse)
def get_wave_config():
    """Return Farmageddon wave configuration."""
    return {"waves": WAVES}
