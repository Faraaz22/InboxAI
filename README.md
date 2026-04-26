# InboxAI

An event-driven Gmail automation backend that classifies incoming email with an LLM and routes each message through a configurable rules engine — auto-forward, create tasks, ping webhooks, send notifications.

Built as a production-grade NestJS service: real OAuth, Gmail Pub/Sub push, queued workers, idempotent processing, encrypted token storage, Dockerized CI/CD.

> **Live:** https://inboxai-mse2.onrender.com
> **Stack:** NestJS · TypeScript · PostgreSQL · Redis · BullMQ · Gemini · Gmail API · Pub/Sub · Docker · GitHub Actions

---

## What it does

1. User connects their Gmail account via OAuth.
2. Gmail pushes a notification to our webhook every time a new message arrives (Google Cloud Pub/Sub).
3. The webhook enqueues a job; a BullMQ worker fetches the message, persists it, and asks Gemini to classify it (e.g. `job_opportunity`, `invoice`, `transactional`, `personal`, `promotional`, `spam`).
4. A workflow engine evaluates user-defined rules against the classified email and runs any matching actions — `log`, `send_email`, `webhook`, `create_task`.

```
Gmail ──push──▶ Pub/Sub ──HTTP──▶ /gmail/webhook
                                       │
                                       ▼
                            BullMQ queue (Redis)
                                       │
                                       ▼
                       Worker: fetch → persist → classify
                                       │
                                       ▼
                            Workflow Engine
                          (rules + handlers)
                                       │
              ┌────────────┬───────────┼────────────┐
              ▼            ▼           ▼            ▼
            log()    send_email()  webhook()   create_task()
```

---

## Why it's interesting

- **Event-driven, not polling.** Uses Gmail's Pub/Sub push so we react in seconds without burning quota.
- **Async + idempotent.** The webhook returns `200` immediately; classification happens off the request path. Pub/Sub at-least-once delivery is handled with a unique constraint on `gmailMessageId` and a graceful `23505` catch in the repository — no duplicates even on redelivery.
- **Decoupled architecture.** Each module follows a DDD layout (`domain` / `application` / `infrastructure` / `presentation`). The workflow engine separates *handlers* (code) from *rules* (DB rows) so adding a new automation is a `POST /workflows` away — no redeploy.
- **Real auth.** Google OAuth 2.0 with refresh tokens encrypted at rest using AES-256 with a key rotated via env var.
- **Production-shaped.** Multi-stage Docker, non-root runtime user, GitHub Actions CI/CD pushing to GHCR, deployed on Render with managed Postgres (Neon) and Redis (Upstash).

---

## Architecture

```
inboxai-backend/src/
├── main.ts
├── app.module.ts            # TypeORM + BullMQ + Schedule + feature modules
└── modules/
    ├── gmail/               # OAuth, Pub/Sub webhook, Gmail API client, watch renewal
    ├── email/               # Email entity + queue processor (classification job)
    ├── ai/                  # Gemini-backed classifier
    ├── workflow/            # Rules engine, action handlers, action logs, seeder
    └── users/               # Gmail account records, encrypted refresh-token storage
```

Each feature module owns its tables, controllers, services, and queue consumers. Cross-module communication goes through interfaces in `domain/` so the engine never imports a TypeORM entity directly.

### The workflow engine

A workflow is a row in Postgres:

```jsonc
{
  "trigger": "email_received",
  "conditions": [
    { "field": "type", "operator": "equals", "value": "job_opportunity" }
  ],
  "actions": [
    { "type": "send_email",
      "config": { "to": "me@example.com", "subject": "New: {{subject}}" } }
  ]
}
```

When a new email is classified, the engine queries workflows by trigger, evaluates conditions (AND across the array), and dispatches each action to the registered handler. Adding a new action type is one class implementing `IAction` plus a registration in the module — no engine changes.

A bootstrap seeder populates sensible defaults the first time the table is empty (controlled by `SEED_FORWARD_EMAIL`), so the app is usable out of the box.

---

## Tech stack

| Concern        | Choice                                |
| -------------- | ------------------------------------- |
| Runtime        | Node 22 (alpine)                      |
| Framework      | NestJS 11                             |
| Language       | TypeScript                            |
| Database       | PostgreSQL (Neon) via TypeORM         |
| Queue          | Redis + BullMQ (Upstash)              |
| Email push     | Gmail API + Google Cloud Pub/Sub      |
| Classification | Google Gemini                         |
| Outbound mail  | Resend (Nodemailer SMTP)              |
| Container      | Docker (multi-stage, non-root)        |
| CI/CD          | GitHub Actions → GHCR → Render        |
| Auth crypto    | AES-256-GCM for refresh tokens at rest |

---

## CI/CD

`.github/workflows/ci.yml` runs on every push and PR to `main`:

1. **lint-and-build** — `npm ci` → `tsc --noEmit` → `nest build`
2. **docker** — multi-stage build, pushed to `ghcr.io/<owner>/inboxai:latest` (and `:<sha>`) on main
3. Render auto-deploys from the latest GHCR tag

The Dockerfile installs deps in a build stage, prunes dev deps, and copies only `dist/` + prod `node_modules/` into a fresh `node:22-alpine` runtime stage running as the non-root `node` user.

---

## Running locally

```bash
git clone https://github.com/<your-org>/inboxai.git
cd inboxai/inboxai-backend
cp .env.example .env   # fill in the values below
docker compose up -d   # local Postgres + Redis
npm ci
npm run start:dev
```

### Required env vars

```env
# DB & queue (single URL each — works with Neon/Upstash or local docker-compose)
DATABASE_URL=postgresql://...
REDIS_URL=rediss://default:...@host:6379

# Google OAuth (GCP Console → APIs & Services → Credentials)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://your-host/gmail/oauth/callback

# Gmail Pub/Sub
GOOGLE_PUBSUB_TOPIC=projects/<id>/topics/inboxai
PUBSUB_AUDIENCE=https://your-host/gmail/webhook
PUBSUB_SERVICE_ACCOUNT_EMAIL=...@<id>.iam.gserviceaccount.com

# AI + outbound email
GEMINI_API_KEY=...
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=...
MAIL_FROM=InboxAI <onboarding@resend.dev>

# Crypto + seed
TOKEN_ENCRYPTION_KEY=<64-hex-chars>   # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SEED_FORWARD_EMAIL=you@example.com    # default workflow recipient
APP_BASE_URL=https://your-host
```

Then visit `https://your-host/gmail/oauth/connect` to start the consent flow.

---

## API

| Method | Path                          | Purpose                                 |
| ------ | ----------------------------- | --------------------------------------- |
| GET    | `/gmail/oauth/connect`        | Begin Google consent flow               |
| GET    | `/gmail/oauth/callback`       | OAuth redirect target (Google calls)   |
| POST   | `/gmail/webhook`              | Pub/Sub push endpoint (Google calls)   |
| POST   | `/workflows`                  | Create a rule                           |
| GET    | `/workflows`                  | List rules                              |
| GET    | `/workflows/actions`          | List registered action handlers         |
| GET    | `/workflows/:id/logs`         | Execution history for an email         |

---

## Roadmap

- Web UI for connecting accounts and managing workflows (currently API + curl)
- More action types: Slack, Notion, Linear
- Per-user workflows with auth
- Replay & dry-run for actions
- Retry/DLQ for failed action executions

---

## License

UNLICENSED — portfolio project. Reach out if you want to use any of it.
