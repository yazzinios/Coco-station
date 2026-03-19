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

# Install requirements — verbose flag shows exactly which package fails
COPY requirements.txt .
RUN pip install --no-cache-dir -v -r requirements.txt

# Copy source code
COPY . .

# Run as non-root user for security
RUN adduser --disabled-password --gecos "" appuser
USER appuser

# Run database migrations and start the server
CMD ["sh", "-c", "python migrate.py && uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1 --log-level info"]
