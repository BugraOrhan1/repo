# Fast Chiptuningfiles Panel

A polished customer portal for tuning-file uploads, order tracking, support chat, credits, and vehicle selection with Dutch license plate lookup.

## What it does

- Customer login and registration
- Upload tuning files and track order status
- Support chat per order
- Admin dashboard for users, files, credits, and status updates
- Vehicle cascade selectors for brand, model, generation, engine, and ECU
- Dutch license plate lookup using RDW data
- Manual license plate recognition button for safer matching

## Production setup

This project is designed to run with:

- Frontend: Netlify
- Backend: Railway
- Database: MongoDB Atlas

See [DEPLOY.md](DEPLOY.md) for the exact deployment settings and required environment variables.

## Local development

### Backend

Set the required environment variables first:

- `MONGO_URL`
- `DB_NAME`
- `JWT_SECRET`
- `ADMIN_PASSWORD`
- `ALLOWED_ORIGINS`

Then run the backend from the repository root:

```powershell
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

From the `frontend` folder:

```powershell
npm install
npm start
```

If you need to point the frontend at a different backend URL, set `REACT_APP_BACKEND_URL`.

## Important notes

- The frontend sends normalized license plates to the backend.
- Automatic plate lookup was removed; use the manual recognition button.
- Do not commit `.env` files or other secrets.

## Verification

After deployment, test these endpoints:

```powershell
curl.exe -i "https://YOUR-RAILWAY-URL/api/version"
curl.exe -i "https://YOUR-RAILWAY-URL/api/vehicles/lookup-license-plate?plate=3ZPR41"
```

## Support

For handover and deployment details, read [DEPLOY.md](DEPLOY.md).
