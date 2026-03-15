FROM jrottenberg/ffmpeg:6.0-alpine

# Install python for controlling the processes
RUN apk add --no-cache python3 py3-pip bash curl jq

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY deck_manager.py .
COPY entrypoint.sh .

RUN chmod +x entrypoint.sh

# The entrypoint will wait for mediamtx then start deck_manager.py
ENTRYPOINT ["/app/entrypoint.sh"]
