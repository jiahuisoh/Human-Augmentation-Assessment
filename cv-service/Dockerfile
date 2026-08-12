FROM python:3.11-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 \
      libglib2.0-0 \
      libsm6 \
      libxext6 \
      libgles2 \
      libegl1 \
      curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN mkdir -p /models && \
    curl -fL -o /models/pose_landmarker_full.task \
      https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task && \
    curl -fL -o /models/hand_landmarker.task \
      https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task

COPY pyproject.toml ./
RUN pip install --no-cache-dir .

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]


FROM runtime AS test

RUN apt-get update && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir ".[dev]"

CMD ["pytest", "-q"]
