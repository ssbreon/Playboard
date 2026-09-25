#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:7071/api}"
curl -sS -i -X POST "$BASE_URL/playbooks" \
  -H "Content-Type: application/json" \
  --data @"$(dirname "$0")/sample-data.json"
