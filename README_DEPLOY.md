Deployment instructions (Netlify frontend + Railway backend)

Prerequisites
- Push this repository to GitHub.
- Have access to your Netlify account and Railway account.
- Ensure `backend/.env` contains `MONGO_URL`, `DB_NAME`, and any secrets. Rotate passwords if they were shared publicly.

Frontend — Netlify (quick)
1. Go to Netlify → New site → Import from Git.
2. Connect your GitHub repo and select the repo.
3. In "Build settings": set Base directory to `frontend`, Build command `npm run build`, Publish directory `build`.
4. Under Site settings → Environment variables, add `REACT_APP_BACKEND_URL` with the public URL of your deployed backend.
5. Deploy site.

Backend — Railway (quick)
1. Go to Railway.app and create a new project -> Deploy from GitHub.
2. Connect the same GitHub repo and select the repository root.
3. Railway will detect a Python project; if not, set the start command to:
   `uvicorn server:app --host 0.0.0.0 --port $PORT`
4. In Railway project settings → Environment, add these variables:
   - `MONGO_URL` (your Atlas connection string)
   - `DB_NAME`
   - `JWT_SECRET` (set a strong secret)
   - `CORS_ORIGINS` (e.g. `*` or your frontend URL)
5. Deploy. Railway gives you a public URL — copy it into Netlify's `REACT_APP_BACKEND_URL`.

Notes
- If Railway cannot install `emergentintegrations==0.1.0` from `backend/requirements.txt`, remove or replace that dependency before deploying (it appears to be an internal package). You can create a minimal `requirements.txt` for deployment containing the core packages.
- For automated CI/CD, consider adding GitHub Actions or Railway/Netlify native links.

Security
- Rotate any leaked passwords immediately and update `backend/.env` and Atlas user credentials.
