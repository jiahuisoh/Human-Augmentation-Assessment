from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', case_sensitive=False)
    cors_origin: str = 'http://localhost:2000'
    pose_model_variant: Literal['lite', 'full', 'heavy'] = 'full'
    min_landmark_visibility: float = 0.5
    cv_signing_secret: str = ''
    outcome_ttl_seconds: int = 300

    @property
    def pose_model_path(self) -> str:
        return f'/models/pose_landmarker_{self.pose_model_variant}.task'

    @property
    def hand_model_path(self) -> str:
        return '/models/hand_landmarker.task'
settings = Settings()
