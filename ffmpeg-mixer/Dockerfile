FROM python:3.11-slim

# Install ffmpeg and runtime tools
RUN apt-get update && apt-get install -y \
    ffmpeg \
    bash \
    curl \
    jq \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY deck_manager.py .
COPY entrypoint.sh .

RUN chmod +x entrypoint.sh

# The entrypoint will wait for mediamtx then start deck_manager.py
ENTRYPOINT ["/app/entrypoint.sh"]
