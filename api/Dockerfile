# Python 3.11-slim — stable LTS with pre-built wheels for all dependencies
FROM python:3.11-slim

WORKDIR /app

# Install build tools in case any package needs to compile from source
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Upgrade pip/setuptools/wheel first so all modern wheels resolve correctly
RUN pip install --upgrade pip setuptools wheel

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Pre-create data dirs so volume mounts are always writable
RUN mkdir -p /app/data/library /app/data/announcements

# Run as root — this is an internal container on a private Docker network
# Running as non-root caused volume permission errors with named volumes
CMD ["sh", "-c", "python migrate.py && uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1 --log-level info"]
