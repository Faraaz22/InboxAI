# InboxAI — Project Notes

A single-source doc covering architecture, what's built, what's missing, Gmail API integration plan, deployment, and interview talking points.

---

## 1. What InboxAI Is

Event-driven email automation backend. It reads a user's Gmail, classifies each message with an LLM, and fires a user-configured workflow (send email / create task / webhook) based on the classification.

**Elevator pitch (interview version):**
> InboxAI is an event-driven email automation backend. It ingests Gmail messages via Google Pub/Sub push, classifies them with an LLM (Gemini), and runs a user-configured workflow — send an email, create a task, or fire a webhook — based on the classification. Built in NestJS with a DDD-style module layout (domain / application / infrastructure / presentation), PostgreSQL + TypeORM for persistence, BullMQ on Redis for async classification so the ingest endpoint stays fast, and a pluggable action registry so new workflow steps drop in without touching the engine.

**Follow-up talking points:**
- **Why a queue?** Decouples ingestion latency from LLM latency; gives retries + backpressure for free.
- **Why DDD layout?** Swap Gmail for IMAP, Postgres for anything, Gemini for Claude without touching domain code.
- **Why an action registry?** Open/closed principle — add new action types without modifying the workflow engine.
- **Trade-off chosen:** Gmail API push over IMAP polling — sub-second latency vs 30s, at the cost of OAuth + watch-renewal complexity.

---

## 2. Current Architecture (what's already built)

```
User's Gmail ──(TODO: Gmail API)──▶ POST /emails ──┐
                                                   ▼
                              IngestEmailUseCase (saves, queues)
                                                   │
                                                   ▼
                              BullMQ queue "email-processing"
                                                   │
                                                   ▼
                              EmailProcessor → Gemini classify
                                                   │
                                                   ▼
                              WorkflowEngine.trigger('email_received')
                                                   │
                        ┌──────────────┬───────────┴────────────┬──────────────┐
                        ▼              ▼                        ▼              ▼
                  send_email      webhook (out)           create_task        log
                  (Resend)        POST to user URL
```

**Modules already in place:**
- `modules/email` — ingestion, persistence, BullMQ processor
- `modules/ai` — Gemini classification
- `modules/workflow` — workflow engine + action registry (`send_email`, `webhook`, `create_task`, `log`)

**Infrastructure wired up:**
- PostgreSQL via TypeORM
- Redis + BullMQ (`@nestjs/bull`, `bullmq`, `ioredis`)
- Outbound SMTP via **Resend** (tested, working — messageId returned 250 OK)

---

## 3. SMTP / Resend (Outbound — DONE)

| | Direction | Purpose |
|---|---|---|
| **Gmail API** | Inbound (read) | Pull user's mail IN so we can classify + trigger workflows |
| **Resend (SMTP)** | Outbound (send) | System notifications fired OUT by the `send_email` action |

**Config (in `.env`):**
```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_...
```

**Test result:** Successfully sent to `throwaway53453@gmail.com` via `onboarding@resend.dev` sender.

**Known issue:** `send-email.action.ts:51` hardcodes `from: "InboxAI" <noreply@inboxai.com>`. Resend will reject this in production until `inboxai.com` is verified on your Resend account. For now, either verify a domain on Resend or change the `from` to `onboarding@resend.dev` (Resend's default test sender).

---

## 4. What's Missing

| # | Gap | Priority |
|---|---|---|
| 1 | **Gmail ingestion** — `POST /emails` is a dumb endpoint; nothing actually pushes real mail in | **P0** |
| 2 | **Inbound webhook controller** — to receive Pub/Sub push from Gmail | **P0** |
| 3 | **Users/auth module** — no OAuth, no per-user token storage | **P0** |
| 4 | **Scheduler** (`@nestjs/schedule`) — for Gmail `watch` renewal every 7 days | **P1** |
| 5 | **Idempotency** — dedupe by Gmail `messageId` so retries don't double-ingest | **P1** |
| 6 | **Resend sender domain** verification (see above) | **P2** (prod only) |
| 7 | **Secrets rotation** — `.env` in repo has live keys; rotate before going public | **P2** |

> Note: `webhook.action.ts` is **outbound** (your app → user's URL). It is **not** the Gmail inbound webhook — that's a separate new controller.

---

## 5. Gmail API Integration Plan

### 5a. The full picture

```
Gmail  ──push──▶  Pub/Sub topic  ──push──▶  POST /gmail/webhook  (new controller)
                                                       │
                                                       ▼
                                       fetch message via Gmail API
                                       (users.history.list → users.messages.get)
                                                       │
                                                       ▼
                                       IngestEmailUseCase (exists)
                                                       │
                                                       ▼
                                       BullMQ → classify → workflow engine
```

### 5b. Google Cloud Console checklist

- [x] GCP project created
- [x] Pub/Sub topic created
- [ ] Grant `gmail-api-push@system.gserviceaccount.com` the **Pub/Sub Publisher** role on the topic
- [ ] Create a **push subscription** on that topic → endpoint = `https://<your-railway-url>/gmail/webhook`, ack deadline ~60s
- [ ] Enable **Gmail API**
- [ ] Configure **OAuth consent screen** (External, Testing mode is fine for portfolio)
- [ ] Create **OAuth 2.0 Client ID** (Web application) → add Railway URL as authorized redirect URI
- [ ] Add yourself + any test friends as **test users** in consent screen (max 100)

### 5c. Code estimate (~400–600 LOC new)

| Piece | Files | Rough LOC |
|---|---|---|
| Users/auth module (OAuth callback, token storage — encrypt refresh tokens at rest) | `users.module`, entity, controller, service | ~200 |
| Gmail connector service (`watch`, `history.list`, `messages.get`, token refresh) | `gmail.service.ts` | ~150 |
| Pub/Sub inbound webhook controller | `gmail-webhook.controller.ts` | ~60 |
| Watch-renewal cron (`@nestjs/schedule`) — renews every 6 days | `gmail-watch.scheduler.ts` | ~40 |
| Glue into existing `IngestEmailUseCase` | minor changes | ~20 |
| Config (Google OAuth client id/secret, Pub/Sub topic name, redirect URL) | `.env`, module config | ~10 |

### 5d. OAuth verification — the catch

Gmail scopes (`gmail.readonly`, `gmail.modify`) are **"restricted"** — Google's most sensitive tier.

**Unverified / Testing mode:**
- Max **100 test users**, each added manually
- Users see a "Google hasn't verified this app" warning screen each time they consent
- **Refresh tokens expire every 7 days** → users must re-consent weekly
- Good enough for a portfolio project / demo / resume

**Full verification for restricted scopes:**
- Requires a **CASA security assessment** (~$500–$2000 via a third-party vendor)
- Privacy policy + homepage + demo video
- Only worth it if launching a real product

**Recommendation:** stay in Testing mode. Accept the weekly re-consent. Document this as a known limitation. Mention in interviews: *"I consciously scoped verification out — it's a third-party paid audit that only makes sense for launched products."*

---

## 6. Deployment

### GitHub Actions (free)
- 2000 min/month on private repos, unlimited on public
- Plan: one workflow on push to `main` → lint + typecheck + test in parallel → build Docker image → push to GHCR or Docker Hub → Railway auto-redeploys on new image

### Docker
- Multi-stage Dockerfile: build stage with dev deps → runtime stage with `dist/` + prod deps only
- Target image size: ~200 MB (vs ~1.2 GB single-stage)
- `docker-compose.yml` already exists for local Postgres + Redis

### Railway hosting
- Free tier is **gone** (now $5/mo hobby credit)
- You'll run 3 services: app + Postgres + Redis — credit burns even when idle
- **Alternative free combo:** Fly.io (Postgres 3 GB free) + Upstash Redis (256 MB free) + app on Fly.io — truly free for small projects
- Railway gives you a stable HTTPS URL for Pub/Sub push, which matters

### Debugging / observability (free tiers)
- Railway's built-in logs (basic, fine for MVP)
- **Better Stack** — free logs tier, decent UI
- **Axiom** — 500 GB/mo free
- **Grafana Cloud** — free tier includes logs + metrics
- **Sentry** free tier for error tracking

### Gotcha
Gmail Pub/Sub push needs a **stable public HTTPS URL**. If you redeploy to a new Railway service name, you must update the Pub/Sub subscription endpoint in GCP — it's not automatic.

---

## 7. Next Steps (in order)

1. Finish Pub/Sub config in GCP (grant publisher role, create push subscription — see §5b).
2. Build users/auth module → OAuth consent + token storage.
3. Build `GmailService` → OAuth exchange, `users.watch`, `users.messages.get`, token refresh.
4. Build `POST /gmail/webhook` controller → Pub/Sub push handler → call `IngestEmailUseCase`.
5. Build watch-renewal cron.
6. Write a Dockerfile (multi-stage).
7. Write `.github/workflows/ci.yml` → lint/test/build/push.
8. Deploy to Railway, point Pub/Sub subscription at the Railway URL.
9. Verify a real email flows through end-to-end.

---

## 8. Open Questions / Decisions To Revisit

- Encrypt refresh tokens at rest? (Yes — use a symmetric key in env, or Google Cloud KMS.)
- Keep BullMQ or move to Google Cloud Tasks? (Keep BullMQ — simpler, no lock-in.)
- Add a frontend? (Out of scope for now — this is a backend project.)
- Add per-user rate limits? (Not until real traffic.)

---

## 9. Complete End-to-End Flow (simplified)

Read top to bottom. Each `[box]` is a step, bullets show what happens there or what gets stored.

```
[1. User connects Gmail (OAuth)]
        │
        ▼
[Store in gmail_accounts table]
  • emailAddress
  • refreshToken (encrypted AES-256-GCM)
  • historyId (Gmail's cursor — "last event I've seen")
  • watchExpiresAt (Gmail watches expire every 7 days)
        │
        ▼
[Start Gmail watch → Pub/Sub topic]
  Tells Gmail: "push me a notification whenever this inbox changes"
        │
────────────────────────────────────
        │
        ▼
[2. New email arrives in the user's Gmail]
        │
        ▼
[Gmail → Pub/Sub → POST /gmail/webhook]
  Pub/Sub sends an HTTP POST signed with a Google JWT
        │
        ▼
[Verify JWT + decode payload]
  • emailAddress  (whose inbox changed)
  • historyId     (new cursor position)
        │
        ▼
[Fetch what's new via Gmail API]
  • history.list(startHistoryId = stored cursor)  → list of new message IDs
  • messages.get(id, format="full")               → headers + body
  (404 on messages.get → skip that one; deleted before we fetched)
        │
        ▼
[3. Ingest Email]
  • Dedupe: if gmailMessageId already in DB → return existing row, skip
  • [DB WRITE: emails]
      - id (UUID — our internal id)
      - gmailMessageId (Gmail's id — unique, used for dedupe)
      - from, subject, body
      - status = "pending"
      - type = null           (classified later)
      - receivedAt
  • [DB WRITE: gmail_accounts.historyId = latest]   (advance cursor)
        │
        ▼
[Push job to BullMQ queue (Redis)]
  Webhook returns 204 immediately. The slow work runs async.
        │
────────────────────────────────────
        │
        ▼
[4. Worker picks up the job]
        │
        ▼
[AI Classification (Gemini 2.5 Flash)]
  Input:  subject + body (first 800 chars)
  Prompt: 8 categories + 5 few-shot examples
  Config: temp=0, thinkingBudget=0, maxOutputTokens=20
  Cost:   ~$0.0003 per email

  ┌─────────────────────────────────────────────────────────────┐
  │  The 8 categories (tags) Gemini picks from:                 │
  │                                                             │
  │   • job_opportunity  — recruiter mail, LinkedIn/Naukri      │
  │                        alerts, ATS updates, rejections,     │
  │                        interview invites (broad catch-all   │
  │                        for anything career-related)         │
  │   • hackathon        — Devpost, MLH, Unstop, deadlines      │
  │   • newsletter       — opt-in digests, Substack, updates    │
  │   • promotion        — marketing, discounts, sales          │
  │   • transactional    — receipts, OTPs, shipping, invoices   │
  │   • personal         — one-to-one human email               │
  │   • spam             — unsolicited junk, phishing           │
  │   • general          — fallback when nothing else fits      │
  └─────────────────────────────────────────────────────────────┘
        │
        ▼
[Update email row]
  • [DB WRITE: emails.type = classified label]
  •            emails.status = "classified"
        │
        ▼
[5. Trigger workflows]
        │
        ▼
[Load workflows table]
  [DB READ: workflows WHERE trigger="email_received" AND isActive=true]
        │
        ▼
[Evaluate conditions (AND logic — all must pass)]

  Each condition has:
    • field     (any key from the email context: type / from / subject)
    • operator  (equals | contains | not_equals)      ← only 3 supported
    • value     (string; compared case-insensitive)

  Empty conditions array = always matches.
  All conditions pass = workflow fires.
  Any condition fails  = workflow skipped (no action_log row written).
        │
        ▼
[If match → run each action in order]
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│ The 4 action types (the "cases" a workflow can do):                 │
│                                                                     │
│  ┌─────────────┬─────────────────────────────────────────────────┐  │
│  │ log         │ console.log only. No DB, no network.            │  │
│  │             │ Cheap way to verify a workflow is matching.     │  │
│  ├─────────────┼─────────────────────────────────────────────────┤  │
│  │ webhook     │ HTTP POST to a URL you configure.               │  │
│  │             │ config: { url, headers? }                        │  │
│  │             │ Body: { event, timestamp, data: context }       │  │
│  │             │ Useful for: Zapier, n8n, Slack, your own APIs   │  │
│  ├─────────────┼─────────────────────────────────────────────────┤  │
│  │ send_email  │ Sends via Resend SMTP.                          │  │
│  │             │ config: { to, subject, template }               │  │
│  │             │ {{from}} {{subject}} {{type}} get interpolated  │  │
│  ├─────────────┼─────────────────────────────────────────────────┤  │
│  │ create_task │ [DB WRITE: tasks row]                           │  │
│  │             │ config: { titleTemplate, assignee }             │  │
│  │             │ Auto-generated to-dos for later review          │  │
│  └─────────────┴─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
[Every action execution → action_log table]
  [DB WRITE: action_log]
    • workflowId
    • workflowName
    • emailId
    • actionType
    • success / failure
    • message (what happened, or the error)
    • metadata (e.g. messageId from Resend, HTTP status from webhook)
    • executedAt
        │
        ▼
[Done ✅]
```

### Example workflow "cases" (what a user would actually configure)

These are the kinds of rules a user would POST to `/workflows`. Each combines **classification tag** (condition) with **action** (what to do):

| Use case | Conditions | Action |
|---|---|---|
| **Notify me on job emails** | `type = job_opportunity` | `send_email` to your personal inbox |
| **Log all spam silently** | `type = spam` | `log` (cheap observability) |
| **Fan out receipts to a tracker** | `type = transactional` | `webhook` to a spreadsheet or Zapier |
| **Remind me of hackathons** | `type = hackathon` | `create_task` with deadline-styled title |
| **Stripe-only invoice flow** | `type = transactional` AND `from contains "@stripe.com"` | `webhook` to your billing service |
| **LinkedIn job alerts only** | `type = job_opportunity` AND `from contains "linkedin.com"` | `send_email` with LinkedIn-specific template |
| **Flag "URGENT" subject lines** | `subject contains "urgent"` | `create_task` + `send_email` (two actions in one workflow) |
| **Catch-all debugger** | *no conditions* (empty array) | `log` — matches every email, great for verifying the pipeline is alive |

### How the "complex" parts connect (plain English)

- **Pub/Sub** is just Google's message bus. Gmail writes a tiny note ("something changed") to it, and it POSTs that note to our `/gmail/webhook`. We don't get the email itself — we get a cursor (`historyId`) and have to ask Gmail "what changed since cursor X?"
- **historyId** is Gmail's version number for the mailbox. We store the last one we've processed. Next push, we diff from there → get the list of new messages → fetch each.
- **BullMQ** is a queue on Redis. When an email arrives, we save it and drop a job into the queue, then return fast. A separate worker picks up the job, calls Gemini, classifies — all async. This is why your webhook responds in ~50ms even though Gemini takes 1–2 seconds.
- **Workflows** are if-this-then-that rules sitting in Postgres. Every email triggers an evaluation pass: load active workflows, check conditions, fire actions on matches. Users write these once; they run forever.
- **action_log** is the audit trail. Every time *any* action runs (success OR failure), one row gets written. Logger is ephemeral console output; action_log is queryable forever — that's the whole difference.

### A. OAuth Setup (runs once per Gmail user)

### A. OAuth Setup (runs once per Gmail user)

```
┌──────────┐                                                           ┌──────────┐
│   User   │                                                           │  Google  │
└────┬─────┘                                                           └────┬─────┘
     │                                                                      │
     │  1. GET /gmail/oauth/connect                                         │
     ▼                                                                      │
┌──────────────────────────────────────────────────────────────┐            │
│  GmailAuthController.connect()                               │            │
│  → builds auth URL with scopes (gmail.readonly, email)       │            │
│  → 302 redirect to accounts.google.com/o/oauth2/v2/auth      │───────────▶│
└──────────────────────────────────────────────────────────────┘            │
                                                                            │
     User clicks "Allow" in Google consent screen    ◀───────────────────── │
                                                                            │
     │  2. GET /gmail/oauth/callback?code=<one-time-code>                   │
     ▼                                                                      │
┌──────────────────────────────────────────────────────────────┐            │
│  GmailAuthController.callback()                              │            │
│  → gmail.exchangeCode(code)                                  │───────────▶│
│       client.getToken() → { refresh_token, access_token }    │◀───────────│
│       oauth2.userinfo.get() → { email }                      │            │
│                                                              │            │
│  → accounts.upsertOnConnect(email, refreshToken)             │            │
│    [DB WRITE: gmail_accounts                                 │            │
│       { id, emailAddress, refreshTokenEncrypted (AES-256),   │            │
│         historyId:null, watchExpiresAt:null }]               │            │
│                                                              │            │
│  → gmail.startWatch(account)                                 │            │
│       users.watch({ topicName, labelIds:['INBOX'] })         │───────────▶│
│       returns { historyId, expiration }                      │◀───────────│
│                                                              │            │
│  → accounts.updateWatch(id, historyId, expiresAt)            │            │
│    [DB WRITE: gmail_accounts.historyId = X                   │            │
│                        .watchExpiresAt = now + 7d]           │            │
│                                                              │            │
│  → returns HTML "Connected" page                             │            │
└──────────────────────────────────────────────────────────────┘            │
                                                                            │
                Gmail is now pushing inbox events to Pub/Sub ───────────────┘
```

### B. Runtime: what happens when an email arrives

```
 ┌─────────────┐
 │  New email  │   User receives an email in their Gmail inbox.
 │  in Gmail   │
 └──────┬──────┘
        │
        │  Gmail watch fires
        ▼
 ┌─────────────────────────────────────┐
 │  Google Cloud Pub/Sub topic         │   payload (base64 JSON):
 │  (projects/.../topics/inboxai)      │     { "emailAddress": "x@gmail.com",
 │                                     │       "historyId": "12345" }
 └─────────────────┬───────────────────┘
                   │  HTTP POST (push subscription, with signed JWT)
                   ▼
 ┌────────────────────────────────────────────────────────────────────┐
 │  POST /gmail/webhook         GmailWebhookController.handle()       │
 │                                                                    │
 │  1. verifyPubSubJwt(Authorization: Bearer <token>)                 │
 │     ├─ google-auth-library verifies signature + audience           │
 │     └─ checks payload.email === PUBSUB_SERVICE_ACCOUNT_EMAIL       │
 │        (reject → 401, stops here for unauthorized pushes)          │
 │                                                                    │
 │  2. decode message.data → { emailAddress, historyId }              │
 │                                                                    │
 │  3. accounts.findByEmail(emailAddress)                             │
 │     [DB READ: gmail_accounts]                                      │
 │     ├─ if account.historyId == null:                               │
 │     │   [DB WRITE: gmail_accounts.historyId = pushed historyId]    │
 │     │   return 204 (first push establishes baseline)               │
 │     └─ else: continue                                              │
 │                                                                    │
 │  4. gmail.fetchNewMessagesSince(account, account.historyId)        │
 │     ├─ gmail.users.history.list(startHistoryId)                    │
 │     │    → returns list of messageAdded IDs since last cursor      │
 │     └─ for each id: gmail.users.messages.get(id, format:'full')    │
 │          ├─ 200 → parse { messageId, from, subject, body,          │
 │          │                internalDate }                           │
 │          └─ 404 → WARN "skipped" and continue (message was         │
 │                   deleted / moved to trash before we fetched)      │
 │                                                                    │
 │  5. for each parsed message:                                       │
 │       ingest.execute({ from, subject, body, gmailMessageId })      │
 │                                                                    │
 │  6. [DB WRITE: gmail_accounts.historyId = latestHistoryId]         │
 │     (advance cursor so retries/future pushes don't re-fetch)       │
 └────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
 ┌────────────────────────────────────────────────────────────────────┐
 │  IngestEmailUseCase.execute(dto)                                   │
 │                                                                    │
 │  1. if dto.gmailMessageId:                                         │
 │       existing = emailRepo.findByGmailMessageId(...)               │
 │       [DB READ: emails WHERE gmailMessageId = X]                   │
 │       if existing → RETURN (idempotent — Pub/Sub retry / dup push) │
 │                                                                    │
 │  2. [DB WRITE: emails                                              │
 │        { id:uuid, from, subject, body, type:null,                  │
 │          status:'pending', gmailMessageId, receivedAt }]           │
 │                                                                    │
 │  3. emailQueue.add('classify', { emailId: saved.id })              │
 │     ├─ pushes BullMQ job into Redis list "bull:email-processing"   │
 │     └─ returns immediately — ingestion latency stays low           │
 └────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
 ┌────────────────────────────────────────────────────────────────────┐
 │  Redis — BullMQ queue "email-processing"                           │
 │  Job sits here until a worker picks it up (usually instant).       │
 │  Survives process crashes, auto-retries on failure.                │
 └────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
 ┌────────────────────────────────────────────────────────────────────┐
 │  EmailProcessor.handleClassify(job)                                │
 │                                                                    │
 │  1. email = emailRepo.findById(emailId)                            │
 │     [DB READ: emails WHERE id = X]                                 │
 │                                                                    │
 │  2. type = AiService.classifyEmail(subject, body)                  │
 │     ├─ HTTP POST to Gemini 2.5 Flash                               │
 │     ├─ 8-category prompt + 5 few-shot examples + body(800 chars)   │
 │     ├─ temperature=0, thinkingBudget=0, maxOutputTokens=20         │
 │     ├─ result whitelisted against EmailType[] or defaults          │
 │     │   to 'general'                                               │
 │     └─ cost ≈ $0.0003 per call                                     │
 │                                                                    │
 │  3. email.markAsClassified(type)       (domain method)             │
 │                                                                    │
 │  4. workflowEngine.trigger('email_received',                       │
 │       { id, from, subject, type })                                 │
 │                                                                    │
 │  5. emailRepo.updateStatus(email)                                  │
 │     [DB WRITE: emails SET status='classified', type=X]             │
 │                                                                    │
 │  On exception anywhere above:                                      │
 │     email.markAsFailed()                                           │
 │     [DB WRITE: emails SET status='failed']                         │
 └────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
 ┌────────────────────────────────────────────────────────────────────┐
 │  WorkflowEngineService.trigger(triggerType, context)               │
 │                                                                    │
 │  1. workflows = workflowRepo.findByTrigger('email_received')       │
 │     [DB READ: workflows WHERE trigger='email_received' AND         │
 │               isActive=true]                                       │
 │                                                                    │
 │  2. for each workflow:                                             │
 │                                                                    │
 │     ┌─ evaluate conditions (AND logic):                            │
 │     │    for each { field, operator, value }:                      │
 │     │      actualValue = context[field]                            │
 │     │      operator in (equals | contains | not_equals)            │
 │     │    ALL must pass → workflow matches                          │
 │     │                                                              │
 │     ├─ no match → skip (no log row — design choice)                │
 │     │                                                              │
 │     └─ match → for each action in workflow.actions:                │
 │          runAction(action, context, workflowId, workflowName)      │
 └────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
 ┌────────────────────────────────────────────────────────────────────┐
 │  runAction() — executes ONE action, always logs outcome            │
 │                                                                    │
 │  executor = actionRegistry.get(action.type)                        │
 │                                                                    │
 │  try {                                                             │
 │    result = executor.execute(action, context)                      │
 │  } catch (err) {                                                   │
 │    result = { success:false, message:err.message, ... }            │
 │  }                                                                 │
 │                                                                    │
 │  actionLogService.log(workflowId, workflowName, emailId, result)   │
 │  [DB WRITE: action_log                                             │
 │     { workflowId, workflowName, emailId, actionType,               │
 │       success, message, metadata, executedAt }]                    │
 └────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
 ┌────────────────────────────────────────────────────────────────────┐
 │  Action executor — depends on action.type                          │
 │                                                                    │
 │  ╔════════════╦═══════════════════════════════════════════════════╗│
 │  ║ log        ║ logger.log() — console only, no DB / network      ║│
 │  ╠════════════╬═══════════════════════════════════════════════════╣│
 │  ║ webhook    ║ fetch(POST url, body:{ event, timestamp, data })  ║│
 │  ║            ║ success = response.ok                             ║│
 │  ╠════════════╬═══════════════════════════════════════════════════╣│
 │  ║ send_email ║ nodemailer.sendMail({ from:MAIL_FROM, to,         ║│
 │  ║            ║   subject, html }) via Resend SMTP                ║│
 │  ║            ║ {{from}} {{subject}} {{type}} interpolated         ║│
 │  ╠════════════╬═══════════════════════════════════════════════════╣│
 │  ║ create_task║ [DB WRITE: tasks                                  ║│
 │  ║            ║    { id, title (interpolated), description,       ║│
 │  ║            ║      emailId, workflowName, assignee,             ║│
 │  ║            ║      status:'open' }]                              ║│
 │  ╚════════════╩═══════════════════════════════════════════════════╝│
 └────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
                 DONE — webhook returns 204 to Pub/Sub
                 (Pub/Sub acks; won't retry this message)
```

### C. Background: scheduled jobs

```
 ┌────────────────────────────────────────────────────────────────────┐
 │  GmailWatchScheduler @Cron('EVERY_HOUR')                           │
 │                                                                    │
 │  1. accounts = gmailAccountService.findAll()                       │
 │     [DB READ: gmail_accounts]                                      │
 │                                                                    │
 │  2. for each account:                                              │
 │       if watchExpiresAt < now + 48h:                               │
 │         gmail.startWatch(account)  → new historyId, new expiry     │
 │         [DB WRITE: gmail_accounts.historyId + watchExpiresAt]      │
 │                                                                    │
 │  Why: Gmail watch expires after 7 days. Without this, pushes stop  │
 │       silently — emails still arrive but our pipeline sees nothing.│
 └────────────────────────────────────────────────────────────────────┘
```

### Tables at a glance — what lives where

| Table | Written by | Purpose |
|---|---|---|
| `gmail_accounts` | OAuth callback, webhook (advance cursor), watch scheduler | Per-user: encrypted refresh token, last processed historyId, watch expiry |
| `emails` | `IngestEmailUseCase` (insert), `EmailProcessor` (update status+type) | One row per unique email (deduped by `gmailMessageId`) |
| `workflows` | `POST /workflows` (CreateWorkflowUseCase) | User-configured if-this-then-that rules |
| `action_log` | `runAction()` — every action execution, success or failure | Audit trail: what ran, when, on which email, with what outcome |
| `tasks` | `CreateTaskAction` — only when a `create_task` action fires | Auto-generated to-dos the user can review later |

### Where the network calls go (for interviews)

| From | To | When |
|---|---|---|
| Nest → Google OAuth2 | `oauth2.googleapis.com` | Once on connect (token exchange), then every hour-ish for access-token refresh |
| Google Gmail → Google Pub/Sub | `pubsub.googleapis.com` | Whenever a user's INBOX changes |
| Google Pub/Sub → Nest | `/gmail/webhook` | Push delivery, HTTP POST with signed JWT |
| Nest → Google Gmail API | `gmail.googleapis.com` | On every push: `history.list` + `messages.get` (×N) |
| Nest → Google Gemini | `generativelanguage.googleapis.com` | Per email classify (via BullMQ worker) |
| Nest → Resend SMTP | `smtp.resend.com:587` | Per `send_email` action |
| Nest → User's webhook URL | any HTTPS | Per `webhook` action |
| Nest → Postgres / Redis | local or managed | Everywhere (reads + writes + queue) |



                                                                                                        
  Classification is step 3 of 5. The full pipeline:                                                      

    1. INGEST        Gmail push → /gmail/webhook → history.list → messages.get
                          → POST to IngestEmailUseCase → saves row in emails
                          → enqueues BullMQ "classify" job

    2. QUEUE         BullMQ + Redis — decouples ingest from slow AI call

    3. CLASSIFY      EmailProcessor picks up job → AiService calls Gemini
                          → 8-category label stored on the row

    4. TRIGGER       WorkflowEngineService.trigger('email_received', {...})
                          → loads all active workflows matching that trigger
                          → evaluates each workflow's conditions (AND logic)
                              (e.g. type=transactional, from contains "@stripe.com")

    5. ACT           For each matching workflow, runs its actions via ActionRegistry:
                        • log              → just writes a log line
                        • webhook          → outbound POST to user-configured URL
                        • send_email       → Resend SMTP (your throwaway test earlier)
                        • create_task      → inserts a row in tasks table
                          Every execution recorded in action_log (audit trail).

  Plus infrastructure features:

  - Watch auto-renewal — GmailWatchScheduler runs hourly, renews any Gmail watch expiring <48h away.
  Without this, Gmail stops pushing after 7 days.
  - Encrypted refresh tokens — AES-256-GCM on OAuth refresh tokens in Postgres (crypto.util.ts).
  - Pub/Sub JWT verification — only Google-signed pushes are accepted on /gmail/webhook.
  - Idempotent-ish ingestion — history cursor advances per push, so duplicate pushes don't re-ingest.



  ┌───────────────────┬─────────┬────────────────────────┐
  │                   │ Before  │         After          │
  ├───────────────────┼─────────┼────────────────────────┤
  │ Body chars        │ 2000    │ 800                    │
  ├───────────────────┼─────────┼────────────────────────┤
  │ Few-shot examples │ 7       │ 5 (sharper ones)       │
  ├───────────────────┼─────────┼────────────────────────┤
  │ Definitions       │ verbose │ compact                │
  ├───────────────────┼─────────┼────────────────────────┤
  │ thinkingBudget    │ 512     │ 0                      │
  ├───────────────────┼─────────┼────────────────────────┤
  │ maxOutputTokens   │ 1024    │ 20                     │
  ├───────────────────┼─────────┼────────────────────────┤
  │ Prompt tokens     │ ~900    │ ~300                   │
  ├───────────────────┼─────────┼────────────────────────┤
  │ Cost per email    │ ~$0.002 │ ~$0.0003 (~6× cheaper) │
  └───────────────────┴─────────┴────────────────────────┘

  Key behavioral change

  job_opportunity is now an explicit catch-all for anything career-related — application updates,
  rejections, ATS notifications. The example "Status of your application has changed" → job_opportunity
  is right in the prompt now. That email you saw earlier ("Fwd: Status of your job application has
  changed") should now classify as job_opportunity → your notifier workflow fires → Resend sends you the
  mail.

  
  ┌──────────────────────────────────┬───────────────────┬─────────────────────┐
  │                                  │ thinkingBudget: 0 │ thinkingBudget: 512 │
  ├──────────────────────────────────┼───────────────────┼─────────────────────┤
  │ Latency                          │ ~1s               │ ~3s                 │
  ├──────────────────────────────────┼───────────────────┼─────────────────────┤
  │ Cost per email                   │ ~$0.0003          │ ~$0.002             │
  ├──────────────────────────────────┼───────────────────┼─────────────────────┤
  │ Accuracy on obvious emails       │ Same              │ Same                │
  ├──────────────────────────────────┼───────────────────┼─────────────────────┤
  │ Accuracy on ambiguous edge cases │ Slightly worse    │ Slightly better     │
  └──────────────────────────────────┴───────────────────┴─────────────────────┘











   The AI service does NOT create conditions

  That's the core confusion. Here's the actual division of labor:

  ┌───────────────┬──────────────────────────────────────────────────────────────────────────────────┐
  │               │                                   What it does                                   │
  ├───────────────┼──────────────────────────────────────────────────────────────────────────────────┤
  │ AI service    │ Reads the email → returns exactly one string: the classification label           │
  │ (Gemini)      │ (job_opportunity, spam, newsletter, etc.). That's it.                            │
  ├───────────────┼──────────────────────────────────────────────────────────────────────────────────┤
  │ You (the      │ Write workflow rules once — saved in the workflows DB table — that reference     │
  │ user)         │ those labels (e.g. "if type is job_opportunity, send email")                     │
  ├───────────────┼──────────────────────────────────────────────────────────────────────────────────┤
  │ Workflow      │ Compares the label from AI against the rules from you, and fires actions on      │
  │ engine        │ matches                                                                          │
  └───────────────┴──────────────────────────────────────────────────────────────────────────────────┘

  So conditions are static data you define, not something AI generates. AI gives you the label, you
  decide what to do with each possible label.

  Why conditions exist (the whole point)

  One email fires every active workflow through the engine. Each workflow asks a different question about
   the email. Conditions are how each workflow says "I only care about X kind of email."

  Picture an email arrives and you have 3 workflows. The engine tries all 3:

  Incoming email:  { type: "newsletter", from: "substack.com" }

  ┌─ Workflow A: "Notify on jobs"
  │     conditions: [type equals "job_opportunity"]
  │     Engine checks: "newsletter" equals "job_opportunity"? ❌
  │     → SKIP (rightly — this isn't a job email)
  │
  ├─ Workflow B: "Log everything"
  │     conditions: []
  │     Engine checks: no conditions → vacuously true ✅
  │     → RUN → writes console log + action_log row
  │
  └─ Workflow C: "Archive spam"
        conditions: [type equals "spam"]
        Engine checks: "newsletter" equals "spam"? ❌
        → SKIP

  So for that email, only Workflow B fires. Conditions didn't "fail" — they correctly filtered the email
  to the right workflow.

  The odds of failing aren't random — they're designed. A condition type = job_opportunity deliberately
  fails for non-job emails. That's the whole function of a condition: to say "this workflow only handles
  X."

  Why multiple workflows exist

  Without conditions, you'd only have 2 extreme options:
  - Do everything to every email (send 500 emails/day to yourself, create 500 tasks, spam webhooks)
  - Do nothing

  Conditions let you say "route these emails this way, those emails that way":

  job_opportunity  → Workflow A → send_email to me
  hackathon        → Workflow B → create_task
  transactional    → Workflow C → webhook to finance spreadsheet
  spam             → Workflow D → log only
  * (everything)   → Workflow E → log (for debugging)

  Five workflows, mutually exclusive conditions on four of them, one catch-all. Each email matches a
  subset and the right side effects happen.








  Yes — not logging skipped workflows is the correct design

  If we logged every skip, every email would produce N rows (one per workflow you own). At 5 workflows ×
  100 emails/day × 365 days = 182,500 rows of "nothing happened." You only care about what did happen,
  and action_log is the historical record of actions — a skip isn't an action.

  The tradeoff: you lose the ability to answer "why didn't workflow X fire on this email?" from the DB
  alone. If you ever need that, a good compromise is a DEBUG-level logger line on skips (keeps stdout
  verbose in dev, DB clean in prod).

  Where the comparison happens — 2 files

  1. The loop — workflow-engine.service.ts

  This is the orchestrator. Runs once per classified email. Loads all active workflows, loops through
  them, and asks each one "do you match?"

  // src/modules/workflow/application/workflow-engine.service.ts:22-30

  const workflows = await this.workflowRepo.findByTrigger(triggerType);

  for (const workflow of workflows) {
    if (!workflow.matchesEmail(context as any)) {
      this.logger.log(`⏭️   "${workflow.name}" skipped — conditions not met`);
      continue;              // ← this is where skip happens (no action_log write)
    }
    // match → run actions and log each one
    for (const action of workflow.actions) {
      await this.runAction(action, ...);
    }
  }

  Notice the continue — when matchesEmail returns false, we just move on. No DB write.

  2. The actual comparison logic — workflow.entity.ts

  This is a pure domain method on the Workflow class. Zero dependencies, all logic. Two methods, ~20
  lines total:

  // src/modules/workflow/domain/workflow.entity.ts:30-50

  // Top-level: does ANY workflow condition fail?
  matchesEmail(emailData: Record<string, any>): boolean {
    return this.conditions.every(condition =>
      this.evaluateCondition(condition, emailData),
    );
    // Array.every() returns true if ALL pass, false if ANY fail.
    // On empty array: returns true vacuously → catch-all workflows match.
  }

  // Per-condition: equals / contains / not_equals
  private evaluateCondition(condition, data): boolean {
    const actualValue   = String(data[condition.field] ?? '').toLowerCase();
    const expectedValue = condition.value.toLowerCase();

    switch (condition.operator) {
      case 'equals':     return actualValue === expectedValue;
      case 'contains':   return actualValue.includes(expectedValue);
      case 'not_equals': return actualValue !== expectedValue;
      default:           return false;
    }
  }

  Two things worth noticing:

  1. Case-insensitive by default — both sides are .toLowerCase()'d, so from contains "LinkedIn.com"
  matches notifications@linkedin.com. Nice default for email matching.
  2. This is where you'd add new operators — want starts_with, ends_with, regex, in_list? Add a case here
   and a type in ConditionOperator. Nothing else changes.

  Flow across the two files

  email classified
        │
        ▼
  WorkflowEngineService.trigger()          ← file #1 (loop)
        │
        │ for each workflow in DB:
        ▼
  workflow.matchesEmail(context)           ← file #2 (pure logic)
        │
        │ .every() → evaluateCondition() → equals/contains/not_equals
        ▼
        true  → runAction() → DB write action_log
        false → continue  (no DB write, log line only)

  Rule of thumb for this codebase (DDD pattern):
  - application/ = orchestration (loops, workflows, transactions)
  - domain/ = pure business rules (this comparison logic is 100% unit-testable with zero mocks)

  That separation is why I said earlier "adding new operators wouldn't touch the engine" — the engine
  just calls matchesEmail; the comparison details live in the domain.

✻ Cooked for 35s

※ recap: Goal: build InboxAI (Gmail-ingesting email automation backend) and get it deployed with CI/CD.
  Current task: you're about to POST two workflows to your running backend — a catch-all logger and a
  job-opportunity notifier. Next action: run the two curl POSTs to `http://localhost/workflows`.

❯ whats context ? does it check against all trigger types? bcz when do we need not equals,   field:      
  string;              // e.g. "type", "from", "subject"                                                 
    operator: ConditionOperator;                                                                         
    value: string;    and whats the value there? in active workflows how are these conditions being      
  created ? ??                                                                                           

● Four questions — let me answer each clearly.

  ---
  1. What is context?

  It's a plain JavaScript object describing the email being processed. Built in
  EmailProcessor.handleClassify and passed to the engine:

  // email.processor.ts
  await this.workflowEngine.trigger('email_received', {
    id:      email.id,                 // our UUID
    from:    email.from,                // "notifications@linkedin.com"
    subject: email.subject,             // "New role: Backend at Acme"
    type:    type,                      // "job_opportunity"  ← from Gemini
  });

  The engine then adds workflowId and workflowName before passing it into each action. So by the time
  evaluateCondition runs, context has:

  {
    id: "uuid-abc-123",
    from: "notifications@linkedin.com",
    subject: "New role: Backend at Acme",
    type: "job_opportunity",
    workflowId: "...",       // added by engine
    workflowName: "..."      // added by engine
  }

  When a condition says field: "from", the engine does context["from"] → gets the string. That's all
  "field" means — a key name to look up in this object.

  ---
  2. Does it check against all trigger types?

  No. Only workflows whose trigger matches what fired are loaded.

  const workflows = await this.workflowRepo.findByTrigger('email_received');
  // ↑ only workflows where trigger = 'email_received'

  Right now there's only ONE trigger type in the system: 'email_received'. So every active workflow has
  the same trigger. The architecture was designed to support more later — e.g. 'email_sent',
  'task_completed', 'webhook_received' — but we haven't added them yet.

  So today: one trigger, many workflows. In the future: many triggers, each with its own set of
  workflows.

  ---
  3. When do we need not_equals?

  For exclusion logic. Think of it as "everything EXCEPT this":

  // Workflow: "Log everything except spam"
  {
    "conditions": [
      { "field": "type", "operator": "not_equals", "value": "spam" }
    ],
    "actions": [{ "type": "log", "config": {} }]
  }

  Without not_equals, you'd have to write 7 separate workflows (one for each non-spam category) to
  achieve the same thing. not_equals lets you do it in one.

  Other real-world uses:
  - from not_equals "noreply@github.com" → ignore noisy automated notifications
  - type not_equals "general" → only act on emails the AI confidently categorized (non-fallback)

  ---
  4. What's value?

  The string you're comparing AGAINST. The condition is read as a sentence:

  { field: "type", operator: "equals", value: "job_opportunity" }
           ↑                ↑                 ↑
       what to get    how to compare    what to compare to

  Reads as: "The email's type must equal "job_opportunity"."

  More examples:

  ┌──────────────────────────────────────────────────────┬───────────────────────────────────────────┐
  │                      Condition                       │                 Reads as                  │
  ├──────────────────────────────────────────────────────┼───────────────────────────────────────────┤
  │ { field: "from", operator: "contains", value:        │ The sender's address must contain         │
  │ "linkedin.com" }                                     │ "linkedin.com"                            │
  ├──────────────────────────────────────────────────────┼───────────────────────────────────────────┤
  │ { field: "subject", operator: "contains", value:     │ The subject line must contain "urgent"    │
  │ "urgent" }                                           │                                           │
  ├──────────────────────────────────────────────────────┼───────────────────────────────────────────┤
  │ { field: "type", operator: "not_equals", value:      │ The classification must not be "spam"     │
  │ "spam" }                                             │                                           │
  └──────────────────────────────────────────────────────┴───────────────────────────────────────────┘

  value is always a string, and comparisons are case-insensitive (both sides are lowercased before
  comparing).

  ---
  5. How are conditions created? (The BIG confusion)

  You create them manually. One time. They live in the DB forever after that.

  There's no AI involved in creating conditions. Nothing is automatic. Here's the full flow:

      ┌──────────────────────────────────────────────────────────────┐
      │ YOU (the developer, once per workflow):                      │
      │                                                              │
      │   1. Write a JSON describing the rule                        │
      │   2. curl POST http://localhost/workflows with that JSON     │
      │   3. CreateWorkflowUseCase saves it into workflows table     │
      │                                                              │
      │   ← That's it. No AI, no automation. You wrote it once.      │
      └──────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
      ┌──────────────────────────────────────────────────────────────┐
      │ RUNTIME (every email, forever after):                        │
      │                                                              │
      │   Email arrives → classified by AI → engine loads all        │
      │   workflows from DB → evaluates saved conditions against     │
      │   the email → fires actions on matches                       │
      └──────────────────────────────────────────────────────────────┘

  The division of labor clearly

  ┌──────────────────────────────────────────┬────────────────────────┬─────────────────────────────┐
  │                  Thing                   │     Who creates it     │            When             │
  ├──────────────────────────────────────────┼────────────────────────┼─────────────────────────────┤
  │ The email's type label (job_opportunity, │ Gemini (AI)            │ Every incoming email, at    │
  │  etc.)                                   │                        │ runtime                     │
  ├──────────────────────────────────────────┼────────────────────────┼─────────────────────────────┤
  │ Workflow name                            │ You                    │ Once, when you POST the     │
  │                                          │                        │ workflow                    │
  ├──────────────────────────────────────────┼────────────────────────┼─────────────────────────────┤
  │ Workflow conditions                      │ You                    │ Once, when you POST the     │
  │                                          │                        │ workflow                    │
  ├──────────────────────────────────────────┼────────────────────────┼─────────────────────────────┤
  │ Workflow actions                         │ You                    │ Once, when you POST the     │
  │                                          │                        │ workflow                    │
  ├──────────────────────────────────────────┼────────────────────────┼─────────────────────────────┤
  │ Workflow isActive                        │ You (or a future admin │ Once, then toggleable       │
  │                                          │  UI)                   │                             │
  └──────────────────────────────────────────┴────────────────────────┴─────────────────────────────┘

  The AI's only job is: given subject+body, output one of 8 strings. That's it.

  Your job: write the rules in JSON that reference those 8 strings. You're essentially saying: "AI, you
  tell me what kind of email this is. I'll tell you what to do with each kind."

  Example end-to-end

  You run this once:
  curl -X POST http://localhost/workflows \
    -H "Content-Type: application/json" \
    --data '{
      "name": "Job Notifier",
      "trigger": "email_received",
      "conditions": [{ "field": "type", "operator": "equals", "value": "job_opportunity" }],
      "actions": [{ "type": "send_email", "config": { "to": "me@...", ... } }],
      "isActive": true
    }'

  → A row lands in the workflows table. Done.

  From then on, every email that arrives:
  1. AI classifies it → type: "job_opportunity" (or whatever)
  2. Engine loads the workflow row from DB
  3. Compares email.type against the condition you wrote months ago
  4. Matches → sends email via Resend

  You never touch the workflow again until you want a different rule.

  What a frontend would do (future work)

  A frontend would just be a nicer wrapper for the POST above. Buttons like "Create rule" → dropdowns for
   field, operator, value → Save → same API call under the hood. The conditions logic doesn't change.

   Gmail push → fetch email → save to DB → AI classifies → engine queries                            
     workflows where trigger='email_received' → for each, check conditions →
     if all conditions pass, run its actions (log / send_email / webhook / create_task)             
                  
  So you must add rule rows to the workflows table. Each row is { trigger, conditions[], actions[]
  }.

  What a rule looks like

  - trigger — only one option exists today: email_received (always use this)
  - conditions — array of { field, operator, value } checks. ALL must pass. Empty [] = match every
  email.
    - field: type (the AI label), from, subject, body
    - operator: equals, not_equals, contains
  - actions — array of things to do when matched
    - log — print a line (useful for debugging)
    - send_email — send via Resend (config: { to, subject, template })
    - webhook — POST to a URL
    - create_task — insert a row into the tasks table

  The AI can label as: job_opportunity, invoice, transactional, personal, promotional, general, spam
   (check ai.service.ts:72 for the full list).

  Useful rules to add

  # 1) Forward job opportunities to your alt inbox
  curl -X POST https://inboxai-mse2.onrender.com/workflows -H "Content-Type: application/json" -d '{
    "name": "Forward job opps",
    "trigger": "email_received",
    "conditions": [{ "field": "type", "operator": "equals", "value": "job_opportunity" }],
    "actions": [{ "type": "send_email", "config": {
      "to": "faraazmahmood0@gmail.com",
      "subject": "New job: {{subject}}",
      "template": "From: {{from}}"
    }}],
    "isActive": true
  }'

  # 2) Auto-create a task for every invoice
  curl -X POST https://inboxai-mse2.onrender.com/workflows -H "Content-Type: application/json" -d '{
    "name": "Track invoices",
    "trigger": "email_received",
    "conditions": [{ "field": "type", "operator": "equals", "value": "invoice" }],
    "actions": [{ "type": "create_task", "config": {
      "title": "Pay invoice from {{from}}",
      "description": "{{subject}}"
    }}],
    "isActive": true
  }'

  # 3) Already exists — keep "Log everything" with empty conditions for debugging
