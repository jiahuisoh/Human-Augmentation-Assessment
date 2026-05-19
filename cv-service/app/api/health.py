from datetime import datetime, timezone
from fastapi import APIRouter
router = APIRouter()

@router.get('/health')
def health() -> dict:
    return {'status': 'ok', 'service': 'cv-service', 'timestamp': datetime.now(timezone.utc).isoformat()}
