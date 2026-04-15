from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///data/family_learning.db"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 30
    parent_pin: str = "1234"
    tts_voices_dir: str = "voices"
    tts_cache_dir: str = "data/tts_cache"

    model_config = {"env_prefix": "", "case_sensitive": False}


settings = Settings()
