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
    detector.init()
    hand_detector.init()
    app = FastAPI(title='VitalAge CV Service', version='0.1.0', description='Pose detection over WebSocket. See /docs for the HTTP API.')
    app.add_middleware(CORSMiddleware, allow_origins=[settings.cors_origin], allow_credentials=True, allow_methods=['*'], allow_headers=['*'])
    app.include_router(health_router)
    app.include_router(websocket_router)
    logging.getLogger('vitalage.cv').info('CV service ready — model=%s, cors_origin=%s', settings.pose_model_variant, settings.cors_origin)
    return app
app = create_app()
