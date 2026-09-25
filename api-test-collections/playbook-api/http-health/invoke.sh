#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${BASE_URL:-http://localhost:7071/api}"
curl -sS -i "$BASE_URL/health" -H "Accept: application/json"
