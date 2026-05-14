# Fast Chiptuningfiles — Deployment Notes

Frontend deployment (Netlify)

1. Manual drag-and-drop
   - Build the frontend: `cd frontend && npm ci && npm run build`
   - Create `frontend_build.zip` (or zip the `frontend/build` folder) and drag it to https://app.netlify.com/drop

2. Automatic via GitHub Actions (recommended)
   - The repository includes `netlify.toml` and a workflow at `.github/workflows/deploy-netlify.yml`.
   - Add the following GitHub Actions secrets in your repo settings -> Secrets -> Actions:
     - `NETLIFY_AUTH_TOKEN` : a Netlify personal access token
     - `NETLIFY_SITE_ID` : your Netlify site id (Site settings -> Site information)
   - Push to `main` to trigger the workflow which builds `frontend` and deploys `frontend/build` to Netlify.

Backend deployment (Railway)

- The backend is prepared for deployment on Railway. Ensure your `backend/.env` contains `MONGO_URL` and any other env vars required.

If you'd like, I can (A) create the `frontend_build.zip` now (done earlier), (B) try to enable Netlify deploy via the GitHub UI (requires your Netlify permissions), or (C) configure additional CI steps.
