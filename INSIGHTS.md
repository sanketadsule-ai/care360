# Insights from Simplify360 / SuiteX (for building Carapal360)

> Research notes — **not** a build task. These are observations about how the
> Simplify360 SuiteX platform is structured (UI, features, data model, likely
> tech stack), captured so Carapal360 can borrow the proven patterns.
>
> Sources: the live screens (Home, Unibox, Settings, Manage Channels, Facebook
> Pages detail), the Simplify360 marketing site, and public hiring signals.
> The app itself is login-gated, so backend details below are *inferred*, not confirmed.

---

## 1. Likely tech stack (inferred)

| Layer | Evidence | Likely choice |
|---|---|---|
| **Frontend** | SPA routes like `/Home`, `/Settingshome`, `/apps/unibox`, `/allChannels` (capitalized, hash-free client routes); dense enterprise dashboard; an Angular-style icon in the inbox | **Angular** single-page app |
| **Backend** | Public hiring for "Java Big Data Developer" (Bangalore); enterprise CRM integrations (Salesforce, Oracle, Zendesk, Freshdesk) | **Java + Spring Boot** REST API |
| **Listening/search** | "Social listening across platforms, forums, blogs, custom sources"; share-of-voice; keyword highlighting | **Big Data pipeline** — Kafka (ingestion) + Elasticsearch/Solr (search & mentions) |
| **AI/ML** | "AI-powered Unibox", auto-responses, sentiment, intelligent routing | ML services for sentiment, routing, suggested replies |
| **Data** | Cases, queues, channels, workspaces | Relational DB (transactional) + Elasticsearch (mentions/search) |
| **Scale** | "50,000+ tickets/month", "15–50+ channels", real-time | Multi-tenant, queue-based, horizontally scaled ingestion |

**Takeaway for Carapal360:** you don't need their scale. A Next.js + Postgres + a
job queue (Inngest/BullMQ) reproduces the *behavior*; add Elasticsearch only if/when
you build real listening across the open web.

---

## 2. Global layout / navigation model

- **Left icon rail** (thin, ~50px): Home, Social Inbox, Modules (grid), Publish,
  Moderation (shield), Team, Reports — spacer — Settings pinned at bottom.
  Tooltips on hover. This is the top-level module switcher.
- **Top header**: logo (left), then mail, notifications (with count badge), user
  avatar (with online dot) on the right. Constant across all pages.
- **Main content area** swaps per route.

**Takeaway:** the icon rail = top-level modules; everything else is nested inside a
module. Carapal360 already mirrors this — keep it.

---

## 3. Home = a "task launcher" hub (not a metrics dashboard)

The Home screen asks **"What would you like to do today?"** with:
- An **Insight / Productivity** toggle (two modes of the whole product).
- A row of **action cards**: Listen, Analyze, Compare, Ideate, Update & Announcement.
- Selecting one reveals a **second row of sub-options** (e.g. Listen → Brand
  Listening, Influencer, Voice of Customer, Ecommerce Reviews, Location Reviews).

**Insight:** Home is a *guided entry point* that routes users to workflows, rather
than dumping charts. It's a two-level progressive disclosure (mode → action → type).

---

## 4. Unibox (Social Inbox) — the core product

A **3-pane** workspace:
- **Left = case list** (the queue of work).
- **Center = work area** ("Select Case to work or click on play mode for sequence").
- **Right = context panel** (customer/case details when a case is open).

Case-list anatomy worth copying:
- **Toolbar** with view tabs (Messages / Users / Company / Saved) + actions
  (Filter, Sentiment, Search, Analytics, Download).
- **Filter bar**: a **queue selector** ("Assigned/Reassigned/Ongoing"), refresh,
  select-all checkbox.
- **Case item**: avatar, source/profile label, author + network icon, message
  snippet **with highlighted keywords** (e.g. `#accident`), inline action icons
  (emoji, reply, share), timestamp + item type ("Comment"/"Tweet"), a sentiment
  flag, and a selection checkbox.
- **Pagination** at the bottom ("Showing 1 of N").

**Key domain concepts revealed:**
- A **"case"** is the unit of work (a message/comment/review needing action).
- **Queues + assignment** ("Assigned/Reassigned/Ongoing") → cases flow through states.
- **"Play mode for sequence"** = agents work cases one-by-one in a queue (efficiency).
- **Sentiment** is first-class (flags, filters).
- **Bulk actions** via checkboxes.

**Takeaway:** model the inbox around `case` (status, assignee, queue, sentiment),
not just raw "messages". This is the single most important structural insight.

---

## 5. Settings — grouped configuration hub

Card grid organized into labeled sections:
- **Data and Automation**: Workspace Management, Manage Channels, Bulk Operations,
  Download Request, Organizer, Caseform Configuration.
- **Publishing and Response Management**: Publish Settings, Email Signatures,
  FAQs, Media Library.

**Insight:** settings are grouped by *concern* and each is its own sub-app. Notable
configurables that imply features: **Caseform Configuration** (custom case fields),
**Organizer** (rules/automation), **FAQs** (canned/AI replies), **Media Library**
(asset store), **Email Signatures** (response templates), **Bulk Operations**.

---

## 6. Manage Channels — a 3-step onboarding funnel

1. **Pick a source category**: Social, App Reviews, e-Commerce Reviews, Location
   Reviews, Messaging Apps, Others.
2. **Pick a channel**: X, Facebook Pages, YouTube, LinkedIn Company Page,
   Instagram Business, Tumblr.
3. **Channel detail** (e.g. Facebook Pages): **Admin Channels / Non-Admin
   Channels** tabs, **+ Add Channel** button, and connected-page cards showing
   avatar, name, @handle, **connection status** (green check), **last-sync /
   scheduled time**, an **alert icon** (token/permission issue), and a per-card menu.

**Insight:** channels are categorized far beyond "social" — reviews (app store,
e-commerce, locations like Google/Zomato/Yelp) and messaging apps are first-class.
Each connection tracks **health/status** and **admin vs non-admin** access level.

**Takeaway for Carapal360:** your `channels` table should track `status`,
`access_level` (admin/non-admin), and `last_synced_at`, and group by a `source_category`.

---

## 7. Implied data model (from the UI)

- **Workspace** (tenant) → has Users/Team, Channels, Queues, Settings.
- **Channel**: platform, source_category, access_level (admin/non-admin),
  status (connected/error), last_synced_at, schedule.
- **Case**: source channel, author, content, type (post/comment/tweet/review/DM),
  sentiment, status (open/assigned/reassigned/ongoing/resolved), assignee, queue,
  timestamps, custom caseform fields.
- **User/Agent**: role, online status, assignment load.
- **Queue / Assignment rules** (Organizer): routing + escalation.
- **Templates**: FAQs (canned replies), Email Signatures, Media Library assets.
- **Reports**: aggregates over cases (volume, sentiment, response time, SoV).

---

## 8. UX / design-system patterns to adopt

- Dense, compact enterprise layout; generous use of **tabs** and **breadcrumbs**.
- **Status badges** everywhere (connection health, sentiment, case state).
- **Keyword highlighting** inside message text (drives the listening value prop).
- **Progressive disclosure** (Home mode→action→type; Channels source→channel→detail).
- One **primary brand color** + neutral grays + semantic colors (green=connected,
  red=alert, sentiment colors).
- Persistent **chrome** (icon rail + header) with a swappable content region.

---

## 9. What to prioritize for Carapal360 (ordered)

1. **Model cases + queues + assignment**, not just messages (Section 4). Everything
   else hangs off this.
2. **Channel onboarding with health/status tracking** (Section 6) — you've started
   this with Facebook.
3. **Settings as grouped sub-apps** (Section 5) — add them incrementally.
4. **Home as a guided launcher** (Section 3) — cheap, high-perceived-value.
5. **Listening (keyword highlighting + sources)** — highest backend cost; defer
   until the inbox/case loop is solid.

---

## Sources
- [Simplify360 — Social Media Management Platform](https://www.simplify360.com/social-media-management-platform.html)
- [Simplify360 — main site (Omnichannel CX)](https://www.simplify360.com/)
- [Simplify360 hiring — Java Big Data Developer drive (2023)](https://fresherstech.com/simplify360-off-campus-recruitment/)
- [Simplify360 on Cuspera](https://www.cuspera.com/products/simplify360-x-99)
- [Simplify360 on SoftwareSuggest](https://www.softwaresuggest.com/simplify360)
