# BACKEND

This folder contains backend-specific implementation code separated from frontend UI code.

## Structure

- `src/`
  - `cosmos-backend.ts` — Azure Cosmos DB container bootstrap and access helpers
  - `action-ner.ts` — structured action/entity extraction for execution-layer form autofill
- `classifier/`
  - Python classifier + spaCy extraction service (`server.py`, training scripts, model assets)

## Notes

- Next.js API routes remain in `src/app/api/**/route.ts` because route files must stay there for App Router conventions.
- Those route files now import backend logic from `BACKEND/src/*`.
- Run classifier service with:

```bash
cd BACKEND/classifier
python server.py
```

The classifier now includes a local trainable Civic Risk model endpoint:

- `POST http://127.0.0.1:5001/predict-civic-risk`

This endpoint is consumed by `BACKEND/src/services/civic-twin-graph-service.ts` to blend
heuristic graph scoring with local ML risk inference for Government AI Twin warnings.

Government-to-citizen alert persistence is exposed through Next backend routes:

- `GET /api/backend/citizen-alerts` — fetch active citizen alerts
- `POST /api/backend/citizen-alerts` — publish new citizen alert broadcasts/protocol advisories

These routes use `BACKEND/src/services/citizen-alert-service.ts` and persist records in the
Cosmos container `citizenAlerts`.

- Optional env var for Next backend to call extractor:

```bash
NER_SERVICE_URL=http://127.0.0.1:5001/extract
CIVIC_RISK_MODEL_URL=http://127.0.0.1:5001/predict-civic-risk
```
