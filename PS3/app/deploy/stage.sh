#!/usr/bin/env bash
# Copy only what the API needs at runtime into a clean directory, so a cloud build uploads
# a few MB instead of the multi-GB repo (datasets are not needed at runtime).
#
#   stage.sh <dest-dir>
#
# If the frontend has been exported (frontend/out), it is included and served by the API.
set -euo pipefail

DEST="${1:?usage: stage.sh <dest-dir>}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

rm -rf "$DEST"
mkdir -p "$DEST"

copy() {  # copy <repo-relative path> [dest-relative path]
  local src="$ROOT/$1" dst="$DEST/${2:-$1}"
  [ -e "$src" ] || { echo "stage.sh: missing $1" >&2; exit 1; }
  mkdir -p "$(dirname "$dst")"
  cp -R "$src" "$dst"
}

copy PS3/app/requirements.txt
copy PS3/app/adapters
copy PS3/app/backend
copy PS3/ACV/acv_core.py
copy PS3/SHM_Work/src
copy PS3/SHM_Work/outputs/submission/shm_final_model_metadata.json
copy PS3/Rail_Corrugation_Work/src
copy PS3/Rail_Corrugation_Work/models
copy PS3/Door_Work/src
cp "$ROOT/PS3/app/deploy/Dockerfile" "$DEST/Dockerfile"

if [ -d "$ROOT/PS3/app/frontend/out" ]; then
  copy PS3/app/frontend/out PS3/app/static
  echo "stage.sh: including exported frontend"
else
  echo "stage.sh: no frontend/out found - API only"
fi

find "$DEST" -name "__pycache__" -type d -prune -exec rm -rf {} +
echo "stage.sh: staged $(du -sh "$DEST" | cut -f1) in $DEST"
