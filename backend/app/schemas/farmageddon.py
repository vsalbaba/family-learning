from pydantic import BaseModel


class SpawnEntry(BaseModel):
    lane: int
    delay_ms: int
    goblin_type: str


class WaveConfig(BaseModel):
    wave_number: int
    delay_before_ms: int
    spawns: list[SpawnEntry]


class WaveConfigResponse(BaseModel):
    waves: list[WaveConfig]
