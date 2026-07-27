from pathlib import Path
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict

_SERVICE_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', case_sensitive=False)
    cors_origin: str = 'http://localhost:2000'
    pose_model_variant: Literal['lite', 'full', 'heavy'] = 'full'
    min_landmark_visibility: float = 0.5

    def _resolve_model(self, docker_name: str, local_name: str) -> str:
        docker = Path(f'/models/{docker_name}')
        if docker.exists():
            return str(docker)
        local = _SERVICE_ROOT / 'models' / local_name
        if local.exists():
            return str(local)
        return str(docker)

    @property
    def pose_model_path(self) -> str:
        return self._resolve_model(
            f'pose_landmarker_{self.pose_model_variant}.task',
            f'pose_landmarker_{self.pose_model_variant}.task',
        )

    @property
    def hand_model_path(self) -> str:
        return self._resolve_model('hand_landmarker.task', 'hand_landmarker.task')
settings = Settings()
