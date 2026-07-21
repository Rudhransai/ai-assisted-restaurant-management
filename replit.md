# Restaurant Management App

A full-stack restaurant management system with a React/Vite frontend and an Express/TypeScript backend, backed by Replit's built-in PostgreSQL database.

## Stack
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS
- **Backend**: Express 5, TypeScript, `tsx` (hot-reload)
- **Database**: PostgreSQL (Replit built-in, auto-connected via `DATABASE_URL`)
- **Auth**: JWT (7-day tokens), bcrypt passwords
- **Notifications**: Nodemailer (SMTP) + Twilio (WhatsApp/SMS)

## How to run

Two workflows are configured and start automatically:

| Workflow | Command | Port |
|---|---|---|
| **Backend API** | `cd restaurant-backend && npm run dev:server` | 3000 |
| **Start application** (Vite, preview) | `cd restaurant-backend && npm run dev` | 5000 |

The Vite dev server proxies `/api/*` to `http://localhost:3000`.

## Default credentials

| Role | Email | Password |
|---|---|---|
| Manager | `manager@restaurant.com` | `manager123` |

Customers register themselves at `/register`.

## Key routes (frontend)
- `/login` — login (customer or manager)
- `/register` — customer registration
- `/customer` — customer dashboard (tables, menu, checkout, notify-me)
- `/` — manager dashboard (reservations, waitlist, table controls)
- `/reservation` — public walk-in reservation form

## API endpoints
- `GET /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/tables` *(customer, manager)*
- `GET /api/v1/dishes` *(customer, manager)*
- `POST /api/v1/orders` *(customer)* — book table + dishes, sends confirmation email
- `POST /api/v1/table-watch` *(customer)* — notify me when table is free
- `GET /api/v1/table-watch` *(customer)*
- `GET /api/v1/dashboard` *(manager)*
- `POST /api/v1/reservations` *(manager)*
- `POST /api/v1/waitlist` *(manager)*
- `POST /api/v1/tables/:id/status` *(manager)* — triggers email to table-watchers when set to Available
- `POST /api/v1/reminders/send` *(manager)*

## Email notifications
Gmail SMTP is configured and active. All of the following are set as Replit environment variables/secrets:
- `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT`, `MAIL_SMTP_USER`, `MAIL_FROM` — set as shared env vars
- `MAIL_SMTP_PASS` — set as a Replit Secret (Gmail App Password)

Emails are sent for: reservation reminders, table-available notifications, and order confirmations.

## Twilio (WhatsApp/SMS — optional)
```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_WHATSAPP=whatsapp:+14155238886
TWILIO_FROM_SMS=+1...
```

## User preferences
- Keep the project's existing structure and stack.
