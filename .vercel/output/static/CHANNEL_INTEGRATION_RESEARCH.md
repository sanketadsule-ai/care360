# Channel Integration Research — Connect → Fetch → Unified Inbox

> Scope: ONLY the flow you asked about — how to **connect each channel**, **get its
> data via API**, and **show it in one unified inbox (Unibox)**. Global research,
> insights only. Verify exact scopes/pricing against each platform's live docs before
> building — these change often (e.g. X overhauled pricing in Feb 2026).

---

## 1. The universal pattern (every channel follows this)

Whatever the platform, a unified inbox is always these 5 stages:

```
 CONNECT            INGEST             NORMALIZE          STORE            DISPLAY / REPLY
 (OAuth, get   →   (webhook push  →   (map payload  →   (DB, dedup   →   (Unibox renders
  tokens)           or API poll)       to 1 schema)      by native id)    cases; reply via API)
```

1. **CONNECT** — OAuth per platform; store an **access token (+ refresh token)** per
   channel, **encrypted**. Tokens expire → mark channel `status = error` and re-auth.
2. **INGEST** — two methods (mix per platform):
   - **Webhooks** (platform *pushes* events to your HTTPS endpoint) — real-time, preferred.
   - **Polling** (you *pull* on a cron schedule) — fallback where no webhook exists.
3. **NORMALIZE** — convert each platform's different JSON into ONE common `case` shape.
   **This normalization layer is the heart of a unified inbox.**
4. **STORE** — upsert into your DB; **dedupe on the platform's native message id**.
5. **DISPLAY / REPLY** — Unibox queries the unified store; replies go back out through
   each platform's send API using the stored token.

**The single biggest insight:** the channels are wildly different at the edges
(auth, endpoints, limits, approvals), but they collapse into the *same* internal
`case` model. Build the normalization layer first; everything else plugs into it.

---

## 2. Per-channel deep dive

Legend — **Ingest**: 🔔 = webhook available, 🔁 = polling only.

### Facebook Pages (Meta Graph API) — 🔔
- **Connect:** Facebook Login (OAuth 2.0). Get user token → exchange for long-lived →
  `GET /me/accounts` to get **per-Page access tokens**.
- **Scopes:** `pages_show_list`, `pages_read_engagement` (read posts/comments),
  `pages_manage_engagement` (reply/like), `pages_messaging` (DMs),
  `pages_manage_metadata` (subscribe to webhooks).
- **Get data:** `/{page}/feed` (posts), `/{post}/comments`, `/{page}/conversations`
  (Messenger DMs), `/{page}/ratings` (recommendations/reviews).
- **Ingest:** Page **webhooks** for `feed`, `mention`, `messages` → real-time.
- **Reply:** `POST /{comment-id}/comments`, `POST /{conversation}/messages`.
- **Gotchas:** Needs **App Review + Business Verification** for production. Commenter
  identity hidden until reviewed. Business-Use-Case rate limits per page.

### Instagram Business (Meta Graph API, tied to a FB Page) — 🔔
- **Connect:** IG Business/Creator account linked to a FB Page; same Meta OAuth.
- **Scopes:** `instagram_basic`, `instagram_manage_comments`,
  `instagram_business_manage_messages` (DMs), `pages_show_list`.
- **Get data:** `/{ig-user}/media` → `/{media}/comments`; @mentions; DMs via the
  Messenger/Instagram messaging API.
- **Ingest:** webhooks for `comments`, `mentions`, `messages`.
- **Reply:** comment replies; DMs **only inside a 24-hour window** after the user
  messages you (then 7 days for support only). This window rule shapes your UI.

### X / Twitter (API v2) — 🔁 (🔔 only on Enterprise)
- **Connect:** OAuth 2.0 (PKCE) or 1.0a; app in X Developer Portal.
- **PRICING — the big gotcha (changed Feb 2026):** new developers are now on
  **pay-per-use** (~**$0.01 per post written, $0.005 per post read, capped 2M reads/mo**).
  The flat **$200 Basic / $5,000 Pro** tiers are **closed to new signups**;
  Enterprise starts ~$42k/mo. The free tier is write-only-ish (negligible reads) —
  **you cannot realistically collect mentions on free.**
- **Get data:** `GET /2/users/:id/mentions`, `GET /2/tweets/search/recent`, DMs via
  `/2/dm_events`.
- **Ingest:** **polling** on paid pay-per-use; real-time **Account Activity API**
  only on Enterprise.
- **Reply:** `POST /2/tweets` (reply), DM endpoints.
- **Insight:** X is the **most expensive and most rate-limited** channel. Budget for
  it explicitly or defer it.

### YouTube (Data API v3) — 🔁
- **Connect:** Google OAuth 2.0; Google Cloud project.
- **Scopes:** `youtube.force-ssl` (read+write comments), `youtube.readonly`.
- **Get data:** `commentThreads.list` (comments on your videos/channel) → `comments.list`.
- **Ingest:** **polling only** for comments (PubSubHubbub push exists for *new
  uploads*, not comments). **Quota = 10,000 units/day** by default; every call costs
  units → budget your polling frequency.
- **Reply:** `comments.insert` / `commentThreads.insert`.

### LinkedIn (Company Page) — 🔁
- **Connect:** OAuth 2.0; LinkedIn Developer app.
- **Access is the gotcha:** comment/mention reading needs the **Community Management
  API** (part of Marketing Developer Platform) — **application-gated and selective**.
  Without approval you can't read engagement.
- **Get data / reply:** organization posts, comments, mentions via Community Mgmt API.

### Tumblr — 🔁
- **Connect:** OAuth 1.0a; Tumblr API. **Lightest** to integrate.
- **Get data:** blog posts and notes (limited engagement data).

### Reviews — Locations (Google Business Profile) — 🔁
- **Connect:** Google OAuth; **Business Profile APIs** (formerly Google My Business).
- **Access gotcha:** must **request quota/allowlisting** from Google.
- **Get data / reply:** `accounts.locations.reviews.list` and review **reply** endpoint.
- Yelp / Tripadvisor / Zomato: **partner-only or no open review API** → usually via
  third-party aggregators or scraping (fragile, ToS-sensitive).

### Reviews — App stores — 🔁
- **Apple:** App Store Connect API → customer reviews + responses (JWT key auth).
- **Google Play:** Play Developer API → `reviews.list` / `reviews.reply`.

### Messaging apps — 🔔
- **WhatsApp Business Platform (Cloud API, via Meta):** business verification + a
  phone number; **inbound via webhooks**, send via messages API; **24-hour
  customer-service window** + pre-approved templates outside it.
- **Telegram Bot API:** easiest — create a bot, set a webhook, receive/send instantly.
- **Messenger:** covered by the Meta Page integration above.

---

## 3. The unified `case` schema (normalization target)

Every platform payload maps into this. This is what the Unibox actually renders.

```
case {
  id                 // your internal id
  channel_id         // which connected channel it came from
  platform           // facebook | instagram | x | youtube | linkedin | tumblr | google_review | whatsapp | ...
  platform_item_id   // native id  → UNIQUE, used for dedup
  type               // post | comment | reply | dm | mention | review
  author_name
  author_handle
  author_avatar_url
  content            // text (store raw; render with textContent to avoid XSS)
  media[]            // optional images/video urls
  rating             // for reviews (1–5), else null
  sentiment          // positive | negative | neutral | unset  (your ML/heuristic)
  status             // open | assigned | reassigned | ongoing | resolved | closed
  assignee_id        // which agent
  queue              // routing bucket
  source_url         // deep link back to the original
  platform_created_at
  ingested_at
}
```

**Mapping examples:**
- FB comment → `type=comment`, author from `from.name`, `platform_item_id=comment.id`.
- Google review → `type=review`, `rating=starRating`, content from `comment`.
- WhatsApp message → `type=dm`, author from contact profile.

---

## 4. Ingestion: webhooks vs polling (decision rule)

| Use **webhooks** when the platform offers them | Use **polling** when it doesn't |
|---|---|
| Meta (FB/IG), WhatsApp, Telegram, X-Enterprise | YouTube comments, Google/app-store reviews, X pay-per-use, LinkedIn, Tumblr |
| Real-time, low overhead, no wasted calls | Cron job (e.g. every 1–15 min); watch rate limits/quota |
| Needs a **public HTTPS endpoint** + signature verification | Track a per-channel `last_synced_at` cursor; dedup on native id |

A real product runs **both**: webhooks where available, polling as fallback/backfill.

---

## 5. Token & connection-health management (do this from day one)

- Store tokens **encrypted**; never in client code or logs.
- Refresh before expiry; on failure set channel `status = error` and surface the
  red **alert badge** (exactly what SuiteX shows on a broken Facebook page card).
- Record `last_synced_at` per channel (SuiteX shows this as a timestamp on each card).
- Respect each platform's **rate limits / quota**; back off and retry on 429.
- Make ingestion **idempotent** — re-delivered webhooks/poll overlaps must not create
  duplicate cases (dedup on `platform_item_id`).

---

## 6. Recommended build order (easiest/cheapest → hardest)

1. **Facebook Pages** — free API, webhooks, you already started. ✅
2. **Instagram Business** — reuses the Meta app/OAuth you built for FB. Low extra cost.
3. **Telegram** — trivial, real webhooks, good for proving the multi-channel pipeline.
4. **YouTube** — free but quota-limited; polling.
5. **Google Business reviews** — high value for "reviews", but access-gated.
6. **WhatsApp** — high value, but business verification + template rules.
7. **LinkedIn** — defer until you're approved for Community Management API.
8. **X / Twitter** — defer or budget; pay-per-use makes it the costliest to read.

Do **1–3 first** to prove the connect→ingest→normalize→Unibox loop across *different*
auth + ingest styles. Once that loop is solid, every other channel is "just another
adapter" feeding the same `case` schema.

---

## 7. Hard constraints to plan around (the real blockers)

| Constraint | Affects | Reality |
|---|---|---|
| **App review / verification** | Meta (FB/IG/WhatsApp), Google reviews | Weeks of paperwork; needs privacy policy, data-deletion endpoint, demo video |
| **Access application (selective)** | LinkedIn, Google Business Profile | May be rejected/slow; not guaranteed |
| **Cost** | **X/Twitter** | Pay-per-use or $42k Enterprise; biggest money sink |
| **Quota** | YouTube, Google | Daily unit caps throttle polling frequency |
| **Messaging windows** | Instagram/WhatsApp DMs | 24-hour free-reply window; templates after |
| **No official API** | Yelp/Tripadvisor/Zomato/Amazon reviews | Aggregators or scraping; fragile + ToS risk |

**Bottom line:** the engineering pattern is uniform and learnable (Section 1 + 3).
The *real* difficulty per channel is **auth approval and cost**, not the code. Sequence
your roadmap by those constraints (Section 6), not by which logo looks coolest.

---

## Sources
- [X (Twitter) API pricing 2026 — pay-per-use shift](https://twitterapi.io/blog/x-api-cost-breakdown-2026)
- [X (Twitter) API pricing tiers 2026 (Postproxy)](https://postproxy.dev/blog/x-api-pricing-2026/)
- [Instagram Messaging API 24-hour window policy (2026)](https://www.keyapi.ai/blog/instagram-messaging-api-policy/)
- [Instagram Graph API developer guide 2026](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/)
- [Meta — Instagram messaging API docs](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/)
