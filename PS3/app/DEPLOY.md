# Running and deploying the PS3 app

One Python service (FastAPI) runs all four subsystem models and, in production, also serves the
exported Next.js UI, so the whole app is a single URL.

```
browser ──► Cloud Run service "ps3-api"
              ├─ /            exported UI  (PS3/app/frontend/out)
              └─ /api/...     analyse uploads (ACV, Door, Rail, SHM)
```

## Run locally

```bash
# 1. backend (from the repo root)
python3 -m venv .venv && source .venv/bin/activate
pip install -r PS3/app/requirements.txt          # macOS also needs: brew install libomp
uvicorn PS3.app.backend.main:app --port 8000

# 2. frontend (second terminal)
cd PS3/app/frontend
npm install
npm run dev                                       # http://localhost:3000, talks to :8000
```

`scikit-learn` must be exactly 1.8.0 (the Rail model file only loads on that version), which is
why the requirements are pinned.

## Deploy to Google Cloud (Cloud Shell)

Cloud Shell (the terminal icon in the console) already has `gcloud`, Node and Docker, and is
already signed in.

```bash
git clone https://github.com/rishu1903/NebulaX-Hackathon-2026.git
cd NebulaX-Hackathon-2026
gcloud config set project <YOUR_PROJECT_ID>
bash PS3/app/deploy/deploy.sh
```

`deploy.sh` enables the required APIs, builds the UI, stages only the runtime files (~3 MB, no
datasets), and runs `gcloud run deploy --allow-unauthenticated`. It prints the public URL; check
`<URL>/api/health` shows all four subsystems as `true`.

Options (environment variables): `REGION` (default `asia-southeast1`), `SERVICE` (default
`ps3-api`), `MIN_INSTANCES` (set to 1 during judging to avoid a cold start), `MAX_INSTANCES`
(default 3, caps cost).

### Optional: Firebase Hosting in front

`MODE=firebase bash PS3/app/deploy/deploy.sh` additionally deploys `firebase.json`, which serves the
UI from Firebase Hosting and rewrites `/api/**` to Cloud Run. It needs `firebase login` and
Firebase enabled on the project. The single Cloud Run URL works without it.

## Notes

- The API is stateless and public: uploads are processed in memory and never stored. Limits: 30 MB
  per upload (Cloud Run allows 32 MiB), allowed types per subsystem, and `--max-instances`.
- Temporary lab projects (e.g. Qwiklabs) expire, and may block public Cloud Run access or billing;
  use a project that will still exist during judging.
- You can rehearse the production layout without Docker: build the UI (`npm run build`), then
  `PS3/app/deploy/stage.sh /tmp/stage`, and run `uvicorn PS3.app.backend.main:app` from `/tmp/stage`.
- The Dockerfile and the Cloud Build/Cloud Run steps have not been run from this repository yet
  (no Docker or gcloud in the development environment); everything the image contains was verified
  by running the staged tree directly.
