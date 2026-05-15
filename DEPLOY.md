# Deployment Guide

This repo is ready for production with a Railway backend and Netlify frontend.

## Backend (Railway)

- Start command:
  - `uvicorn server:app --host 0.0.0.0 --port $PORT`
- Install command / requirements:
  - use the repository root `requirements.txt` for Railway deployment
- Required environment variables:
  - `MONGO_URL`
  - `DB_NAME`
  - `JWT_SECRET`
  - `ADMIN_PASSWORD`
  - `ALLOWED_ORIGINS` (comma-separated, e.g. `https://tuningpaneel1.netlify.app,http://localhost:3000`)

Notes:
- `ADMIN_PASSWORD` is used to seed the admin account if it does not exist.
- Do not commit `.env` files. Store secrets only in Railway environment variables.
- If Railway still points at a stale build, redeploy from the latest `main` commit and verify `/api/version`.

## Frontend (Netlify)

- Base directory: `frontend`
- Build command: `npm run build`
- Publish directory: `build`
- Required environment variables:
  - `REACT_APP_BACKEND_URL` (your Railway backend URL)

Notes:
- The frontend uses the normalized license plate value when calling the backend lookup endpoint.
- Auto plate lookup was removed; users must click the recognition button manually.

## Quick Verification

After deploy:

```powershell
curl.exe -i "https://YOUR-RAILWAY-URL/api/version"
curl.exe -i "https://YOUR-RAILWAY-URL/api/vehicles/lookup-license-plate?plate=3ZPR41"
```

Expected:
- `/api/version` returns `200`.
- Lookup returns `200` with RDW data for `3ZPR41`.
