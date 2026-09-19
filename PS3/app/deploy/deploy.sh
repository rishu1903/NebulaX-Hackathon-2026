#!/usr/bin/env bash
# Deploy the PS3 app to Google Cloud.
#
#   deploy.sh            build the UI + deploy ONE Cloud Run service that serves UI and API
#   MODE=firebase deploy.sh   also put Firebase Hosting in front (needs firebase login + Firebase
#                             enabled on the project); /api/** is rewritten to Cloud Run
#
# Prerequisites (run once): gcloud auth login; gcloud config set project <PROJECT_ID>
# Settings can be overridden with env vars: PROJECT, REGION, SERVICE, MIN_INSTANCES, MAX_INSTANCES.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-asia-southeast1}"
SERVICE="${SERVICE:-ps3-api}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-3}"
MODE="${MODE:-cloudrun}"

[ -n "$PROJECT" ] || { echo "No project set. Run: gcloud config set project <PROJECT_ID>" >&2; exit 1; }
echo "==> project=$PROJECT region=$REGION service=$SERVICE mode=$MODE"

echo "==> enabling required APIs (safe to re-run)"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  --project "$PROJECT"

echo "==> building the frontend (static export)"
( cd "$APP_DIR/frontend" && npm install --no-audit --no-fund --no-package-lock && npm run build )

STAGE="$(mktemp -d)/build"
echo "==> staging the runtime tree"
"$APP_DIR/deploy/stage.sh" "$STAGE"

echo "==> deploying to Cloud Run"
gcloud run deploy "$SERVICE" \
  --project "$PROJECT" --region "$REGION" \
  --source "$STAGE" \
  --allow-unauthenticated \
  --memory 2Gi --cpu 1 \
  --concurrency 4 --timeout 120 \
  --min-instances "$MIN_INSTANCES" --max-instances "$MAX_INSTANCES" \
  --set-env-vars "MAX_UPLOAD_MB=30"

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')"
echo "==> Cloud Run URL: $URL"

if [ "$MODE" = "firebase" ]; then
  echo "==> deploying Firebase Hosting (rewrites /api/** to $SERVICE)"
  ( cd "$APP_DIR" && npx --yes firebase-tools deploy --only hosting --project "$PROJECT" )
fi

echo "==> done. Health check: $URL/api/health"
