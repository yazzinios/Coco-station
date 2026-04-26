# Python 3.11-slim — stable LTS with pre-built wheels for all dependencies
FROM python:3.11-slim

WORKDIR /app

# Install build tools + tzdata so datetime.now() reflects the container TZ
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    tzdata \
    ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Upgrade pip/setuptools/wheel first so all modern wheels resolve correctly
RUN pip install --upgrade pip setuptools wheel

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Pre-create ALL data dirs so volume mounts are always writable
# These are created in the image layer; Docker then overlays the host
# bind-mounts on top — the dirs must exist first or the mount is ignored.
RUN mkdir -p \
    /app/data/library \
    /app/data/announcements \
    /app/data/chimes \
    /app/data/branding

# Run as root — this is an internal container on a private Docker network
# Running as non-root caused volume permission errors with named volumes
# WS_PING_INTERVAL / WS_PING_TIMEOUT are read from env at container start
# so nginx never drops idle WebSocket connections
CMD ["sh", "-c", \
  "python migrate.py && uvicorn main:app \
    --host 0.0.0.0 --port 8000 \
    --workers 1 \
    --log-level info \
    --ws-ping-interval ${WS_PING_INTERVAL:-30} \
    --ws-ping-timeout ${WS_PING_TIMEOUT:-20}"]
