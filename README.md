# Doctor Site

Patient, booking and admin website for Prof. Dr. Javed Iqbal, an ENT specialist in Lahore.

## Features

- Landing page describing the doctor, services and contact info
- 3-step online appointment booking with live available time slots
- Day-by-day queue number system — the first patient of the day gets #1, the next #2, and so on (ordered by time slot)
- Payment method selection (Cash, JazzCash, EasyPaisa, Bank Transfer) with per-service fees and payment instructions
- Smart FAQ chatbot that answers clinic questions and guides patients to book
- Public appointment lookup by reference number
- Admin dashboard (login + manage appointments) at `/admin` — simple big-button UI: quick filters (Today / New / Confirmed / Completed), one-tap Confirm / Done / Cancel, and Paid toggling
- Notifications for new appointments via Twilio SMS
- Storage in PostgreSQL, or a local `data.json` file when no database is set

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000. Admin area: http://localhost:3000/admin.

## Configuration (environment variables)

| Variable              | Required | Description                                        |
| --------------------- | -------- | -------------------------------------------------- |
| `PORT`                | no       | Port to listen on (default `3000`)                 |
| `ADMIN_PASSWORD`      | no       | Admin login password (default `admin123` — change it!) |
| `DATABASE_URL`        | no       | PostgreSQL connection string. Uses `data.json` if unset |
| `JAZZCASH_NUMBER`     | no       | JazzCash number shown to patients for payment     |
| `EASYPAISA_NUMBER`    | no       | EasyPaisa number shown to patients for payment     |
| `BANK_DETAILS`        | no       | Bank transfer instructions shown to patients       |
| `TWILIO_ACCOUNT_SID`  | no       | Twilio account sid for SMS alerts                  |
| `TWILIO_AUTH_TOKEN`   | no       | Twilio auth token                                  |
| `TWILIO_FROM`         | no       | Twilio sender number                               |
| `NOTIFY_TO`           | no       | Phone number that receives SMS alerts              |

Copy `.env.example` to `.env` and adjust values. The app reads real environment variables, not the `.env` file directly (`.env` is for reference); use a process manager like `node --env-file=.env server.js` if you want dotenv loading.

## Storage

- **No database set** — appointments are stored in `data.json` (auto-created).
- **`DATABASE_URL` set** — the app creates the `appointments` table on boot and uses PostgreSQL. It falls back to JSON if the connection fails.

## Deployment (Render)

The `render.yaml` blueprint deploys this app on Render. Connect the repo in the Render dashboard and it provisions the service automatically.

1. In Render, create a PostgreSQL database and copy its connection string.
2. Set the env vars from the table above (`ADMIN_PASSWORD` at minimum; optionally `DATABASE_URL`, `TWILIO_*`, `NOTIFY_TO`).
3. Deploy. The health check pings `/` .

## API

| Method | Path                        | Description                                |
| ------ | --------------------------- | ------------------------------------------ |
| GET    | `/api/slots?date=YYYY-MM-DD`| Available time slots for a date            |
| GET    | `/api/services`             | Services with fees and payment options     |
| POST   | `/api/appointments`         | Create an appointment (JSON body)          |
| GET    | `/api/appointments/:ref`    | Public lookup by reference                 |
| POST   | `/api/admin/login`          | Login, returns a Bearer token              |
| GET    | `/api/admin/appointments`   | List appointments (admin token)            |
| GET    | `/api/admin/stats`          | Totals: all, pending, confirmed, today, paid, revenue |
| PATCH  | `/api/admin/appointments/:id`| Update status (admin token)               |
| PATCH  | `/api/admin/appointments/:id/payment` | Update payment status (admin token) |
| DELETE | `/api/admin/appointments/:id`| Delete appointment (admin token)          |
