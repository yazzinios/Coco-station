#!/bin/bash
set -e

MEDIAMTX_HOST=${MEDIAMTX_HOST:-mediamtx}

echo "Waiting for MediaMTX to be ready at $MEDIAMTX_HOST:1935..."
while ! nc -z $MEDIAMTX_HOST 1935; do
  sleep 1
done
echo "MediaMTX is up."

# Start the python deck manager
echo "Starting deck_manager.py..."
exec python3 /app/deck_manager.py
