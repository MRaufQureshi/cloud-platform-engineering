# frontend

The web app: log in, plug the simulated car in and out, change settings, watch the plan and the savings.
React (Vite), plain JavaScript, `aws-amplify` for the Cognito login only.

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
| `src/main.jsx` | loads `/config.json`, configures login, starts the app |
| `src/App.jsx` | the login page, or the app frame (top bar, device picker, pages); fetches every car's status |
| `src/api.js` | every API call, with the token in the `Authorization` header |
| `src/pages/Login.jsx` | our own sign-in form; asks for a new password at the first sign-in |
| `src/pages/Control.jsx` | the house-and-car scene with Plug in / Unplug, the charging rules, what happens when you save |
| `src/pages/Dashboard.jsx` | savings, the plan chart (price, power, battery), the battery gauge, the plan in words, every car, the prices ahead |
| `src/components/` | `House.jsx` (the mascot and the Control scene), `PlanChart.jsx`, `BatteryGauge.jsx`, `Icons.jsx` |
| `src/lib.js` (+ `lib.test.js`) | the pure logic, unit-tested |

**`config.json`.** Terraform writes it into the bucket (API address, login pool and client IDs). Those values
are new after every lab wipe, so the app downloads them at start-up instead of having them compiled in: the
same build works after any rebuild.

**A plug button** only sends a command. The simulated car reports back, and the optimizer makes a new plan.
The app polls (no websockets): every car's status every 5 seconds, the dashboard's plan and savings every 10.
Past slots are hidden, using the *simulated* clock (the simulation runs ahead of the calendar).

**The login.** The app has its own sign-in form instead of Amplify's ready-made screen, The form calls Amplify's
`signIn()`. A user with a temporary password (the demo user) is asked for a new one, sent with `confirmSignIn()`.

**Colours have one meaning each:** teal is energy from the car, indigo is the grid, amber is the sun, and rose
marks only the expensive hours. Errors stay neutral.

## Run it
```bash
cd capstone/apps/frontend
npm ci
npm test                                  # the helper functions
make -C ../.. frontend-config             # downloads the live config.json into public/ (gitignored)
npm run dev                               # http://localhost:5173 (the one local address the API allows)
```

## Deploy
**T.H.E.O. App Deploy** runs when this folder changes on `main`, or from **Actions → T.H.E.O. App Deploy → Run workflow**. The run's Summary page shows the app address as a link.
The first deploy needs the platform applied (`make -C capstone apply`). The address is `terraform output app_url`.

Cache rules: files in `assets/` have a hash in their name and are cached for a year; `index.html` is never
cached; every deploy refreshes CloudFront.
