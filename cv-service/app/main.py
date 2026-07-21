import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config.settings import settings
from app.api.health import router as health_router
from app.api.websocket import router as websocket_router
from app.cv.pose_detector import detector
from app.cv.hand_detector import hand_detector

def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s', datefmt='%H:%M:%S')

def create_app() -> FastAPI:
    configure_logging()
    # Without the shared secret we could neither authenticate a grant nor sign a
    # result, so every outcome would be indistinguishable from a made-up one.
    # There is no safe degraded mode - refuse to start.
    if not settings.cv_signing_secret:
        raise RuntimeError('CV_SIGNING_SECRET is not set - refusing to start. It must match the value given to the backend.')
    detector.init()
    hand_detector.init()
    app = FastAPI(title='HANA CV Service', version='0.1.0', description='Pose detection over WebSocket. See /docs for the HTTP API.')
    app.add_middleware(CORSMiddleware, allow_origins=[settings.cors_origin], allow_credentials=True, allow_methods=['*'], allow_headers=['*'])
    app.include_router(health_router)
    app.include_router(websocket_router)
    logging.getLogger('hana.cv').info('CV service ready — model=%s, cors_origin=%s', settings.pose_model_variant, settings.cors_origin)
    return app
app = create_app()
