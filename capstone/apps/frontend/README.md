# frontend

The web app: log in, plug the simulated car in and out, change settings, watch the plan and the savings.
React (Vite), plain JavaScript, `aws-amplify` for the Cognito login only, `recharts` for charts.

## What you'll learn
- Hosting a single-page app on a **private S3 bucket behind CloudFront** (Origin Access Control)
- How a browser app logs in with Cognito and calls an API with a token
- Why the app reads its settings from a `config.json` instead of having them built in

## How it fits together
```
browser ──HTTPS──► CloudFront ──signed request (OAC)──► private S3 bucket (the built app)
   │
   ├─ log in ──► Cognito (Amplify) ──► ID token
   └─ API calls with the token ──► API Gateway (checks the token) ──► Lambda
```

| File | Role |
|---|---|
| `src/main.jsx` | loads `/config.json`, configures login, shows the login screen |
| `src/api.js` | every API call, with the token in the `Authorization` header |
| `src/pages/Control.jsx` | the car card (PLUG IN / PLUG OUT, battery, status) and the settings form |
| `src/pages/Dashboard.jsx` | savings, today's plan chart, live battery line, online indicator |
| `src/lib.js` (+ `lib.test.js`) | the pure logic, unit-tested |
| `deploy-frontend.sh` | build, copy to S3, refresh CloudFront |

**`config.json`.** Terraform writes it into the bucket (API address, login pool and client IDs). Those values
are new after every lab wipe, so the app downloads them at start-up instead of having them compiled in: the
same build works after any rebuild. `deploy-frontend.sh` never overwrites it.

**A plug button** only sends a command. The simulated car reports back, and the optimizer makes a new plan.
The app polls every 5 seconds (no websockets). Charging is drawn upwards in the plan chart and discharging
downwards. Past slots are hidden, using the *simulated* clock (the simulation runs ahead of the calendar).

## Run it
```bash
cd capstone/apps/frontend
npm ci
npm test                                  # the helper functions
make -C ../.. frontend-config             # downloads the live config.json into public/ (gitignored)
npm run dev                               # http://localhost:5173 (the one local address the API allows)
```

## Deploy
`make -C capstone deploy-frontend` (also run by **T.H.E.O. App Deploy** when this folder changes on `main`).
The first deploy needs the platform applied (`make -C capstone apply`). The address is `terraform output app_url`.

Cache rules: files in `assets/` have a hash in their name and are cached for a year; `index.html` is never
cached; every deploy refreshes CloudFront.
