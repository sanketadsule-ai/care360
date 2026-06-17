# Carapal360 — Social Media Management Platform

> **Production-ready, full-stack Next.js application** for social listening, channel management, and customer engagement — a clone of Simplify360/Nextiva SuiteX rebranded as Carapal360.

---

## 🏗️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 15 (App Router) | SSR, RSC, API Routes |
| **Language** | TypeScript (strict) | Type safety across stack |
| **Database** | MySQL 8+ | Relational data store |
| **ORM** | Prisma | Schema, migrations, type-safe queries |
| **Auth** | NextAuth.js + Facebook OAuth | User auth + Facebook page connections |
| **Testing** | Jest + React Testing Library | Unit + integration tests |
| **Styling** | CSS Modules | Scoped, modular styles |
| **API** | Facebook Graph API v21.0 | Social media data ingestion |

---

## 📁 Project Folder Structure

```
carapal_360/
├── prisma/
│   ├── schema.prisma              # Database schema (single source of truth)
│   ├── migrations/                # Auto-generated migration files
│   └── seed.ts                    # Seed script for development data
│
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── layout.tsx             # Root layout (Server Component)
│   │   ├── page.tsx               # Dashboard home (SSR)
│   │   ├── globals.css            # Global design tokens
│   │   │
│   │   ├── inbox/
│   │   │   ├── page.tsx           # Social Inbox (SSR - fetches cases)
│   │   │   ├── layout.tsx         # Inbox layout with sidebar
│   │   │   └── [caseId]/
│   │   │       └── page.tsx       # Individual case detail view
│   │   │
│   │   ├── settings/
│   │   │   ├── page.tsx           # Settings home (SSR)
│   │   │   └── channels/
│   │   │       ├── page.tsx       # Manage Channels (SSR)
│   │   │       └── facebook/
│   │   │           └── page.tsx   # Facebook Pages management
│   │   │
│   │   └── api/                   # API Route Handlers
│   │       ├── auth/
│   │       │   └── [...nextauth]/
│   │       │       └── route.ts   # NextAuth config
│   │       ├── channels/
│   │       │   ├── route.ts       # GET/POST channels
│   │       │   └── [id]/
│   │       │       └── route.ts   # GET/PUT/DELETE single channel
│   │       ├── facebook/
│   │       │   ├── connect/
│   │       │   │   └── route.ts   # POST - initiate FB OAuth
│   │       │   ├── callback/
│   │       │   │   └── route.ts   # GET - OAuth callback
│   │       │   ├── pages/
│   │       │   │   └── route.ts   # GET - list connected pages
│   │       │   └── feed/
│   │       │       └── route.ts   # GET - fetch page feed/comments
│   │       ├── messages/
│   │       │   ├── route.ts       # GET messages (paginated)
│   │       │   └── [id]/
│   │       │       └── route.ts   # GET/PATCH single message
│   │       └── health/
│   │           └── route.ts       # Health check endpoint
│   │
│   ├── components/                # Reusable UI components
│   │   ├── layout/
│   │   │   ├── Header.tsx         # App header (Server Component)
│   │   │   ├── Sidebar.tsx        # Navigation sidebar
│   │   │   └── HelpFab.tsx        # Floating help button (Client)
│   │   ├── dashboard/
│   │   │   ├── ActionCards.tsx     # Listen/Analyze/Compare cards (Client)
│   │   │   ├── ListeningSection.tsx
│   │   │   └── TabGroup.tsx       # Insight/Productivity tabs (Client)
│   │   ├── inbox/
│   │   │   ├── CaseList.tsx       # Case list panel (Client - interactive)
│   │   │   ├── CaseItem.tsx       # Individual case card
│   │   │   ├── CaseDetail.tsx     # Case detail view
│   │   │   ├── InboxToolbar.tsx   # Toolbar with filters (Client)
│   │   │   └── Pagination.tsx     # Pagination controls (Client)
│   │   ├── settings/
│   │   │   ├── SettingsCard.tsx   # Reusable settings card
│   │   │   ├── SettingsGrid.tsx   # Grid layout for cards
│   │   │   └── ChannelCard.tsx    # Connected channel card
│   │   └── facebook/
│   │       ├── FacebookLogin.tsx  # FB login button (Client)
│   │       ├── PageCard.tsx       # Connected FB page card
│   │       └── ChannelTabs.tsx    # Admin/Non-Admin tabs (Client)
│   │
│   ├── lib/                       # Shared business logic
│   │   ├── db/
│   │   │   ├── prisma.ts          # Prisma client singleton
│   │   │   ├── channels.ts        # Channel CRUD operations
│   │   │   ├── messages.ts        # Message CRUD operations
│   │   │   └── users.ts           # User operations
│   │   ├── facebook/
│   │   │   ├── client.ts          # Facebook Graph API client
│   │   │   ├── auth.ts            # Facebook OAuth helpers
│   │   │   ├── pages.ts           # Fetch/manage FB pages
│   │   │   └── feed.ts            # Fetch posts/comments
│   │   ├── utils/
│   │   │   ├── date.ts            # Date formatting utilities
│   │   │   ├── pagination.ts      # Pagination helpers
│   │   │   └── validation.ts      # Input validation (Zod schemas)
│   │   └── constants.ts           # App-wide constants
│   │
│   └── types/                     # TypeScript type definitions
│       ├── database.ts            # DB model types (from Prisma)
│       ├── facebook.ts            # Facebook API response types
│       ├── api.ts                 # API request/response types
│       └── ui.ts                  # UI component prop types
│
├── __tests__/                     # All test files
│   ├── unit/
│   │   ├── lib/
│   │   │   ├── db/
│   │   │   │   ├── channels.test.ts
│   │   │   │   ├── messages.test.ts
│   │   │   │   └── users.test.ts
│   │   │   ├── facebook/
│   │   │   │   ├── client.test.ts
│   │   │   │   ├── auth.test.ts
│   │   │   │   ├── pages.test.ts
│   │   │   │   └── feed.test.ts
│   │   │   └── utils/
│   │   │       ├── date.test.ts
│   │   │       ├── pagination.test.ts
│   │   │       └── validation.test.ts
│   │   └── components/
│   │       ├── Header.test.tsx
│   │       ├── Sidebar.test.tsx
│   │       ├── CaseItem.test.tsx
│   │       ├── CaseList.test.tsx
│   │       ├── SettingsCard.test.tsx
│   │       ├── FacebookLogin.test.tsx
│   │       └── PageCard.test.tsx
│   ├── integration/
│   │   ├── api/
│   │   │   ├── channels.test.ts
│   │   │   ├── messages.test.ts
│   │   │   └── facebook.test.ts
│   │   └── pages/
│   │       ├── dashboard.test.tsx
│   │       ├── inbox.test.tsx
│   │       └── settings.test.tsx
│   └── mocks/
│       ├── prisma.ts              # Prisma mock for testing
│       ├── facebook.ts            # Facebook API mock responses
│       └── handlers.ts            # MSW request handlers
│
├── docs/                          # Project documentation
│   ├── architecture.md
│   ├── database-schema.md
│   ├── caching-strategy.md
│   ├── facebook-integration.md
│   └── testing/
│       ├── testing-strategy.md
│       ├── 01-database-layer.test.md
│       ├── 02-facebook-api.test.md
│       ├── 03-api-routes.test.md
│       ├── 04-components.test.md
│       └── 05-pages-ssr.test.md
│
├── .env.local                     # Environment variables (not committed)
├── .env.example                   # Example env file
├── jest.config.ts                 # Jest configuration
├── jest.setup.ts                  # Jest global setup
├── next.config.ts                 # Next.js config
├── tsconfig.json                  # TypeScript config
├── package.json
└── README.md                      # This file
```

---

## 🗄️ Database Schema (MySQL)

### Entity Relationship

```
┌──────────┐     ┌───────────┐     ┌──────────────┐
│  users   │────<│ channels   │────<│  messages    │
└──────────┘     └───────────┘     └──────────────┘
     │                │
     │           ┌────┴─────┐
     └──────────<│ settings  │
                 └──────────┘
```

### Tables

#### `users`
| Column | Type | Constraints |
|--------|------|------------|
| id | VARCHAR(36) | PK, UUID |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| name | VARCHAR(255) | NOT NULL |
| avatar_url | VARCHAR(512) | NULLABLE |
| role | ENUM('admin','agent','viewer') | DEFAULT 'agent' |
| created_at | DATETIME | DEFAULT NOW() |
| updated_at | DATETIME | ON UPDATE NOW() |

#### `channels`
| Column | Type | Constraints |
|--------|------|------------|
| id | VARCHAR(36) | PK, UUID |
| user_id | VARCHAR(36) | FK → users.id |
| platform | ENUM('facebook','twitter','instagram','youtube','linkedin','tumblr') | NOT NULL |
| platform_id | VARCHAR(255) | NOT NULL (FB page ID, etc.) |
| name | VARCHAR(255) | NOT NULL |
| handle | VARCHAR(255) | NULLABLE (@handle) |
| avatar_url | VARCHAR(512) | NULLABLE |
| access_token | TEXT | ENCRYPTED, NOT NULL |
| token_expires_at | DATETIME | NULLABLE |
| is_admin | BOOLEAN | DEFAULT true |
| status | ENUM('active','paused','disconnected','error') | DEFAULT 'active' |
| connected_at | DATETIME | DEFAULT NOW() |
| updated_at | DATETIME | ON UPDATE NOW() |

#### `messages`
| Column | Type | Constraints |
|--------|------|------------|
| id | VARCHAR(36) | PK, UUID |
| channel_id | VARCHAR(36) | FK → channels.id |
| platform_message_id | VARCHAR(255) | UNIQUE (dedup key) |
| type | ENUM('post','comment','reply','dm','review') | NOT NULL |
| author_name | VARCHAR(255) | NOT NULL |
| author_handle | VARCHAR(255) | NULLABLE |
| author_avatar_url | VARCHAR(512) | NULLABLE |
| content | TEXT | NOT NULL |
| sentiment | ENUM('positive','negative','neutral','unset') | DEFAULT 'unset' |
| status | ENUM('open','assigned','ongoing','resolved','closed') | DEFAULT 'open' |
| assigned_to | VARCHAR(36) | FK → users.id, NULLABLE |
| source_url | VARCHAR(1024) | NULLABLE |
| platform_created_at | DATETIME | NOT NULL (original post time) |
| created_at | DATETIME | DEFAULT NOW() |
| updated_at | DATETIME | ON UPDATE NOW() |

#### `settings`
| Column | Type | Constraints |
|--------|------|------------|
| id | VARCHAR(36) | PK, UUID |
| user_id | VARCHAR(36) | FK → users.id |
| key | VARCHAR(255) | NOT NULL |
| value | JSON | NOT NULL |
| created_at | DATETIME | DEFAULT NOW() |
| updated_at | DATETIME | ON UPDATE NOW() |
| | | UNIQUE(user_id, key) |

---

## ⚡ Caching Strategy

| Route | Strategy | Rationale |
|-------|----------|-----------|
| `/` (Dashboard) | `revalidate: 3600` | Dashboard data changes infrequently |
| `/inbox` | `revalidate: 0` (dynamic) | Messages must be real-time fresh |
| `/settings` | `revalidate: 3600` | Settings rarely change |
| `/settings/channels` | `revalidate: 0` | Channel status can change (token expiry) |
| `/api/messages` | `Cache-Control: no-store` | Always fresh data from DB |
| `/api/facebook/feed` | `revalidate: 60` via `fetch` cache | Rate-limit friendly, 60s stale OK |
| `/api/channels` | `revalidateTag('channels')` | Invalidated on connect/disconnect |

### Cache Invalidation Patterns
- **On channel connect/disconnect**: `revalidateTag('channels')` + `revalidatePath('/settings/channels')`
- **On new message ingested**: `revalidateTag('messages')` + `revalidatePath('/inbox')`
- **On message status change**: `revalidatePath('/inbox')` only

---

## 🔧 Environment Variables

```env
# .env.local
DATABASE_URL="mysql://root:password@localhost:3306/carapal360"
NEXTAUTH_SECRET="your-random-secret-min-32-chars"
NEXTAUTH_URL="http://localhost:3000"

# Facebook App Credentials
FACEBOOK_APP_ID="your-facebook-app-id"
FACEBOOK_APP_SECRET="your-facebook-app-secret"

# Node environment
NODE_ENV="development"
```

---

## 🧪 Testing Philosophy

> **Test-First**: Every feature has a `.test.md` spec written BEFORE implementation. Tests are written BEFORE code.

### Test Pyramid
```
        ╱  E2E  ╲          ← Few (Playwright, if needed later)
       ╱─────────╲
      ╱Integration ╲       ← API routes, page rendering
     ╱───────────────╲
    ╱   Unit Tests    ╲    ← DB layer, utils, components, FB client
   ╱───────────────────╲
```

### Test Coverage Targets
| Layer | Target | Tool |
|-------|--------|------|
| Utilities (`lib/utils/`) | **100%** | Jest |
| Database layer (`lib/db/`) | **95%** | Jest + Prisma mock |
| Facebook client (`lib/facebook/`) | **90%** | Jest + MSW mocks |
| API Routes (`app/api/`) | **90%** | Jest + supertest |
| Components | **85%** | React Testing Library |
| Pages (SSR) | **80%** | React Testing Library |

---

## 🚀 Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local with your MySQL and Facebook credentials

# 3. Set up database
npx prisma generate
npx prisma db push

# 4. Seed development data
npx prisma db seed

# 5. Run development server
npm run dev

# 6. Run tests
npm test
npm run test:coverage
```

---

## 📋 Feature Development Workflow

1. **Spec** → Write `docs/testing/XX-feature.test.md` with test cases
2. **Test** → Write failing tests in `__tests__/`
3. **Implement** → Write code to make tests pass
4. **Refactor** → Clean up while keeping tests green
5. **Review** → PR with test coverage report

---

## 🔑 Core Domain

**Social Media Management Platform** — Carapal360 enables businesses to:
- **Listen** to social media conversations (posts, comments, reviews)
- **Manage Channels** by connecting Facebook, Twitter, Instagram, etc.
- **Respond** to customer messages from a unified Social Inbox
- **Analyze** engagement metrics across platforms
- **Collaborate** with team members on case assignments

---

## License

Proprietary — Carapal360
