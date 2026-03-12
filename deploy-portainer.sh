#!/bin/bash
# Deploy CocoStation to Portainer
# Usage: ./deploy-portainer.sh <portainer_url> <portainer_api_key>

PORTAINER_URL="${1:-http://localhost:9000}"
API_KEY="${2}"
STACK_NAME="cocostation"

if [ -z "$API_KEY" ]; then
  echo "Error: Need API KEY"
  echo "Usage: ./deploy-portainer.sh <portainer_url> <portainer_api_key>"
  exit 1
fi

curl -k -X POST "$PORTAINER_URL/api/stacks/create/standalone/string" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{ \"name\": \"$STACK_NAME\", \"stackFileContent\": \"$(cat docker-compose.yml | sed 's/"/\\"/g' | tr '\n' '\n')\" }"
