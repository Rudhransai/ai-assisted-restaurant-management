# Running the Restaurant App Locally (VS Code)

## Prerequisites

Install these once if you don't have them already:

| Tool | Download |
|------|----------|
| Node.js 20+ | https://nodejs.org |
| PostgreSQL 16 | https://www.postgresql.org/download |
| Git | https://git-scm.com |

---

## Step 1 — Get the latest code

```bash
# If you already cloned the repo, just pull the latest changes:
git pull origin main

# If you haven't cloned yet:
git clone https://github.com/Rudhransai/ai-assisted-restaurant-management.git
cd ai-assisted-restaurant-management
```

---

## Step 2 — Create a local PostgreSQL database

Open **pgAdmin** or the **psql** terminal and run:

```sql
CREATE DATABASE restaurant;
```

The app creates all tables automatically on first boot — you don't need to run any SQL scripts.

---

## Step 3 — Set up environment variables

```bash
cd restaurant-backend
cp .env.example .env
```

Open `.env` in VS Code and fill in your values:

```env
DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/restaurant
SESSION_SECRET=any_long_random_string_here
MAIL_SMTP_HOST=smtp.gmail.com
MAIL_SMTP_PORT=587
MAIL_SMTP_USER=your_gmail@gmail.com
MAIL_SMTP_PASS=your_gmail_app_password
MAIL_FROM="Restaurant <your_gmail@gmail.com>"
```

> **Gmail App Password**: Go to https://myaccount.google.com/apppasswords, generate a password for "Mail", and paste it into `MAIL_SMTP_PASS`.

---

## Step 4 — Install dependencies

```bash
# Make sure you are inside restaurant-backend/
cd restaurant-backend
npm install
```

---

## Step 5 — Run the app

### Option A — One click (VS Code task)
Open the repo folder in VS Code, then run **Terminal → Run Task… → "Run app (backend + frontend)"**.
This starts the backend (port 3000) and the Vite frontend (port 5000) together.
You can also press **F5** ("Debug Backend API") to run/debug the backend with breakpoints.

### Option B — Two terminals

Open **two** VS Code terminals:

**Terminal 1 — Backend API**
```bash
cd restaurant-backend
npm run dev:server
```
You should see:
```
Server successfully booted up on port 3000 using PostgreSQL
```

**Terminal 2 — Frontend**
```bash
cd restaurant-backend
npm run dev
```
You should see:
```
  VITE v8.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5000/
```

---

## Step 6 — Open in browser

Visit: **http://localhost:5000**

### Default manager account
The app seeds a default manager when it first starts:
- **Email:** `manager@restaurant.com`
- **Password:** `manager123`

### Create customer accounts
Click **"New here? Create an account"** on the login page to register a customer.

---

## Folder structure

```
restaurant-backend/
├── src/
│   ├── app.ts              ← Express backend (API + serves frontend in prod)
│   ├── config/             ← Database connection
│   ├── frontend/           ← React components (Customer & Manager dashboards)
│   ├── integrations/       ← Email sender (nodemailer)
│   ├── middleware/         ← Auth, error handling
│   └── services/           ← DB store, auth service, scheduler
├── .env.example            ← Copy this to .env and fill in your values
├── vite.config.ts          ← Frontend dev server config
└── package.json
```

---

## Common problems

| Problem | Fix |
|---------|-----|
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL is not running — start it via pgAdmin or `pg_ctl start` |
| `password authentication failed` | Check the password in `DATABASE_URL` matches your PostgreSQL user |
| `relation "users" does not exist` | The DB tables auto-create on boot — make sure the backend started without errors |
| Emails not sending | Verify `MAIL_SMTP_PASS` is a Gmail App Password (not your Gmail login password) |
| Port 3000 or 5000 already in use | Kill the process using that port: `npx kill-port 3000 5000` |

---

## Building for production (optional)

```bash
cd restaurant-backend
npm run build          # compiles React frontend → dist/
npm run start:server   # Express serves both API + frontend on port 3000
```
