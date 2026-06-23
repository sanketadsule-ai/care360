# Carapal360 — Build Plan & Roadmap

> **Status of this document:** This is the plan to turn the current **static prototype**
> (`index.html`, `styles.css`, `app.js`) into a real SuiteX/Simplify360-style platform.
> As of now, NOTHING in `README.md` is built yet — that file describes the *target*
> architecture, not the current code. This document is the bridge between the two.

---

## 0. Reality check (read this first)

| | Current reality | Target (README.md) |
|---|---|---|
| Code | 3 static files, hand-typed HTML | Next.js 15 + TS full-stack app |
| Data | Hard-coded in HTML | PostgreSQL/MySQL + Prisma |
| Inbox messages | Typed by hand | Pulled from real social APIs |
| Channels | Click does nothing | Real OAuth connections |
| Auth | None | NextAuth / Supabase Auth |
| Backend | None | API routes + background jobs |

**Conclusion:** This is a *rebuild*, not an *edit*. The static prototype's value is the
**design** — it becomes the visual spec. Everything else is built fresh.

**The hard part is NOT the screens.** It's: real OAuth per platform, background data
ingestion, replying back out through each API, and getting each platform to *approve*
your app for the permissions you need. Plan months, not weeks, for full parity.

---

## 1. Scope strategy — build ONE vertical slice first

Do **not** clone all of SuiteX at once. Build a single channel + single feature
end-to-end, then expand. Recommended first slice:

> **Facebook Pages → Social Inbox (read comments, assign, reply)**

Get that fully working (real login → real data → real reply) before touching
Instagram, X, Analytics, or Publishing.

---

## 2. Recommended tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Matches README; SSR + API in one repo |
| Styling | **Tailwind CSS** | Fast for a project this size; port the prototype's look |
| Database | **PostgreSQL** (Supabase or Neon) | Less ops than self-hosted MySQL; free tier; auth built in |
| ORM | **Prisma** | Type-safe schema + migrations |
| Auth | **Supabase Auth** or **NextAuth.js** | Supabase = less to wire; NextAuth = more control |
| Background jobs | **Inngest** or **BullMQ + Redis** | Scheduled social syncs, retries |
| Hosting | **Vercel** (app) + **Supabase/Neon** (DB) | Zero-config deploys |
| Testing | **Vitest** + React Testing Library + **Playwright** | Vitest is faster than Jest for Next |

> Swap MySQL for Postgres unless you have a hard MySQL requirement. Everything else
> in your README is a good choice — keep it.

---

## 3. Phased milestones

### Phase 1 — Scaffold (1–2 days)
- [ ] `npx create-next-app@latest` (TS, App Router, Tailwind, ESLint)
- [ ] Add Prisma; connect to a Postgres dev DB (Supabase/Neon)
- [ ] Port `styles.css` design tokens (colors, spacing, fonts) into Tailwind config
- [ ] Commit; set up GitHub repo + Vercel preview deploys
- [ ] Rename current `README.md` → `ARCHITECTURE.md`; write a real README

### Phase 2 — UI as components, mock data (3–5 days)
- [ ] Break `index.html` into components: `Header`, `Sidebar`, `Dashboard`,
      `ActionCards`, `CaseList`, `CaseItem`, `CaseDetail`, `SettingsGrid`,
      `SettingsCard`, `ChannelPicker`
- [ ] Render Inbox/Dashboard/Settings/Channels from **mock JSON** (no DB yet)
- [ ] Page routing via App Router (`/`, `/inbox`, `/settings`, `/settings/channels`)
- [ ] Goal: pixel-match the prototype, but now component-driven

### Phase 3 — Database + Auth (3–5 days)
- [ ] Define Prisma schema (see §4)
- [ ] Migrations + seed script with fake users/channels/messages
- [ ] Add auth; protect all app routes; show logged-in user in header
- [ ] Wire Inbox + Settings to read from the DB instead of mock JSON

### Phase 4 — First real integration: Facebook (2–4 weeks incl. approval wait)
- [ ] Create a Facebook App in Meta for Developers (Business type)
- [ ] Implement OAuth "Connect Facebook" flow → store page tokens (encrypted)
- [ ] Background job: poll Page comments/posts → upsert into `messages` (dedup by `platform_message_id`)
- [ ] Inbox actions: assign to agent, change status
- [ ] **Reply path**: post a reply comment back via Graph API
- [ ] Token refresh + error handling (expired/revoked tokens → channel status `error`)

### Phase 5 — Expand (ongoing, one slice at a time)
- [ ] Instagram (via the Facebook/Meta Graph — tied to FB Pages)
- [ ] X / Twitter (paid API tiers — budget for this)
- [ ] YouTube, LinkedIn, Tumblr
- [ ] Analytics dashboards (sentiment, volume, response time)
- [ ] Publishing & scheduling
- [ ] Teams/roles/permissions, audit log, notifications

---

## 4. Initial database schema (Prisma-ready)

Start minimal; the README's schema is a fine basis. Core tables for the first slice:

- **User** — id, email, name, avatarUrl, role(admin|agent|viewer), timestamps
- **Workspace** — id, name (multi-tenant boundary; even if you have one to start)
- **Channel** — id, workspaceId, platform(facebook|instagram|x|youtube|linkedin|tumblr),
  platformId, name, handle, avatarUrl, accessToken(**encrypted**), tokenExpiresAt,
  isAdmin, status(active|paused|disconnected|error), timestamps
- **Message** — id, channelId, platformMessageId(**unique**, dedup), type(post|comment|reply|dm|review),
  authorName, authorHandle, authorAvatarUrl, content, sentiment, status(open|assigned|ongoing|resolved|closed),
  assignedToId(→User), sourceUrl, platformCreatedAt, timestamps
- **Reply** — id, messageId, authorId(→User), content, platformReplyId, sentAt, status(pending|sent|failed)

> **Always encrypt access tokens at rest.** Never log them. Never send them to the client.

---

## 5. Social platform approvals (the real bottleneck)

You must register a developer app per platform and pass review for the permissions you need.
This gates everything in Phase 4–5. Start these applications EARLY — approval can take weeks.

| Platform | What you need | Notes |
|---|---|---|
| **Facebook / Instagram** | Meta App + Business Verification + App Review for `pages_read_engagement`, `pages_manage_engagement`, `pages_messaging`, `instagram_basic`, `instagram_manage_comments` | Hardest paperwork; needs a privacy policy URL, screencast demo, business docs |
| **X (Twitter)** | Developer account + **paid API tier** | Free tier is too limited for an inbox; budget monthly cost |
| **YouTube** | Google Cloud project + OAuth consent screen verification | Quota limits apply |
| **LinkedIn** | LinkedIn Developer app + Marketing API access (application required) | Access is gated/selective |
| **Tumblr** | OAuth app registration | Lightest |

**Prerequisites you'll need regardless:** a deployed HTTPS domain, a privacy policy,
terms of service, and a data-deletion endpoint (Meta requires this).

---

## 6. Security & ops checklist (don't skip)

- [ ] Encrypt all OAuth tokens at rest (e.g. libsodium / KMS)
- [ ] Secrets in env vars only; never commit `.env*`
- [ ] Rate-limit + retry/backoff on all social API calls
- [ ] Webhook signature verification (Meta sends signed webhooks)
- [ ] Per-workspace data isolation (multi-tenancy from day one is easier than retrofitting)
- [ ] Audit log for agent actions (who replied/assigned/closed)
- [ ] Background-job idempotency (dedup on `platformMessageId`)

---

## 7. Suggested order of work (TL;DR)

1. Scaffold Next.js + Tailwind + Prisma + Postgres
2. Port the prototype design into React components (mock data)
3. Add DB + Auth; wire Inbox to real DB
4. **Register the Facebook app NOW** (approval takes weeks — start in parallel with #1)
5. Build the Facebook → Inbox vertical slice end-to-end
6. Only then expand to more channels/features

---

## 8. Cost & time reality

- **Solo dev, first usable slice (FB inbox):** ~4–8 weeks, much of it waiting on Meta approval.
- **Something resembling SuiteX parity:** 6–12+ months.
- **Recurring costs:** X API tier, hosting, DB, possibly a sentiment/AI API.

The screens are ~10% of the work. Budget your energy for integrations and approvals.
