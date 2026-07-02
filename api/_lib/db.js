// Shared database connection for Vercel Serverless Functions
const { Pool } = require('pg');
const crypto = require('crypto');

// Initial admin credentials. The account is auto-provisioned once on startup
// (idempotently) so the system always has at least one administrator.
const INITIAL_ADMIN_EMAIL = 'admin@carepal360.com';
const INITIAL_ADMIN_PASSWORD = 'Admin@12345';
const INITIAL_ADMIN_NAME = 'Administrator';

// Shared password hashing — keep in sync with api/_lib/auth.js
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

let pool;

function getPool() {
  if (!pool) {
    let connString = process.env.DATABASE_URL || '';
    // Strip ?sslmode=... so it doesn't override our explicit ssl config below
    if (connString.includes('?')) {
      connString = connString.split('?')[0];
    }
    
    pool = new Pool({
      connectionString: connString,
      ssl: { rejectUnauthorized: false },
      // Serverless functions handle one request at a time, so a single
      // connection per warm instance is enough. Keeping this at 1 (and idling
      // out quickly) prevents exhausting the database's connection slots when
      // many Vercel instances are warm at once.
      max: 1,
      idleTimeoutMillis: 5000,
      // Fail fast (well under the function's maxDuration) so a saturated DB
      // surfaces a clean JSON error instead of a platform-level
      // FUNCTION_INVOCATION_TIMEOUT.
      connectionTimeoutMillis: 5000
    });

    pool.on('error', (err, client) => {
      console.error('Unexpected error on idle client', err);
    });
  }
  return pool;
}

// Close the pool at the end of a request. In serverless, an instance freezes
// between requests, so an idle connection would otherwise stay open on the DB
// (the idle timer can't fire while frozen). Closing here guarantees a frozen
// instance leaves no open connection, preventing slot exhaustion. The next
// request lazily creates a fresh pool. Schema-init memoization is preserved so
// we don't re-run migrations on the new pool.
async function closePool() {
  if (pool) {
    const p = pool;
    pool = null;
    try {
      // Don't let a hung connection drain block the invocation from finishing.
      await Promise.race([
        p.end(),
        new Promise((resolve) => setTimeout(resolve, 2000))
      ]);
    } catch (err) {
      console.error('Error closing pool:', err.message);
    }
  }
}

// Memoize schema initialization so it runs at most once per warm serverless
// instance instead of on every request. Concurrent callers share the same
// in-flight promise; a failure clears it so the next request can retry.
let ensureTablesPromise = null;
async function ensureTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = _ensureTables().catch((err) => {
      ensureTablesPromise = null; // allow retry on next request
      throw err;
    });
  }
  return ensureTablesPromise;
}

async function _ensureTables() {
  const p = getPool();

  // Run independent table creations in parallel where possible, or bundle them
  // 1. Core tables (no FK)
  await p.query(`
    CREATE TABLE IF NOT EXISTS connected_channels (
      id            SERIAL PRIMARY KEY,
      platform      VARCHAR(50) NOT NULL,
      account_email VARCHAR(255),
      account_name  VARCHAR(255),
      avatar_url    VARCHAR(512),
      access_token  TEXT,
      status        VARCHAR(50) DEFAULT 'active',
      connected_at  TIMESTAMP DEFAULT NOW(),
      updated_at    TIMESTAMP DEFAULT NOW(),
      UNIQUE(platform, account_email)
    );

    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         VARCHAR(255) UNIQUE NOT NULL,
      name          VARCHAR(255) NOT NULL,
      initials      VARCHAR(10),
      avatar_url    VARCHAR(512),
      role          VARCHAR(50) DEFAULT 'user',
      status        VARCHAR(50) DEFAULT 'pending',
      created_at    TIMESTAMP DEFAULT NOW(),
      updated_at    TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS salt VARCHAR(255);
  `);

  // 2. Dependent tables
  await p.query(`
    CREATE TABLE IF NOT EXISTS email_messages (
      id                SERIAL PRIMARY KEY,
      channel_id        INTEGER REFERENCES connected_channels(id),
      gmail_message_id  VARCHAR(255) UNIQUE,
      subject           VARCHAR(1000),
      sender_email      VARCHAR(255),
      sender_name       VARCHAR(255),
      recipient_email   VARCHAR(255),
      body_text         TEXT,
      body_html         TEXT,
      received_at       TIMESTAMP,
      status            VARCHAR(50) DEFAULT 'open',
      is_read           BOOLEAN DEFAULT FALSE,
      labels            TEXT,
      created_at        TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS facebook_messages (
      id                SERIAL PRIMARY KEY,
      channel_id        INTEGER REFERENCES connected_channels(id),
      fb_post_id        VARCHAR(255) UNIQUE,
      post_type         VARCHAR(50), 
      author_name       VARCHAR(255),
      message_text      TEXT,
      received_at       TIMESTAMP,
      status            VARCHAR(50) DEFAULT 'open',
      is_read           BOOLEAN DEFAULT FALSE,
      created_at        TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS google_reviews (
      id                SERIAL PRIMARY KEY,
      channel_id        INTEGER REFERENCES connected_channels(id),
      review_id         VARCHAR(255) UNIQUE,
      rating            INTEGER,
      author_name       VARCHAR(255),
      author_avatar     VARCHAR(512),
      comment           TEXT,
      received_at       TIMESTAMP,
      status            VARCHAR(50) DEFAULT 'open',
      is_read           BOOLEAN DEFAULT FALSE,
      priority          VARCHAR(50),
      next_action       TEXT,
      department        VARCHAR(100),
      user_type         VARCHAR(100),
      created_at        TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS trustpilot_reviews (
      id                SERIAL PRIMARY KEY,
      channel_id        INTEGER REFERENCES connected_channels(id),
      review_id         VARCHAR(255) UNIQUE,
      rating            INTEGER,
      heading           VARCHAR(1000),
      author_name       VARCHAR(255),
      author_avatar     VARCHAR(512),
      comment           TEXT,
      received_at       TIMESTAMP,
      status            VARCHAR(50) DEFAULT 'open',
      is_read           BOOLEAN DEFAULT FALSE,
      priority          VARCHAR(50),
      next_action       TEXT,
      department        VARCHAR(100),
      user_type         VARCHAR(100),
      created_at        TIMESTAMP DEFAULT NOW()
    );
  `);

  // 3. User Migrations (bundled)
  try {
    await p.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS initials VARCHAR(10);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';
      ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
      ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'email';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
    `);
  } catch (err) {
    console.error('Migration error for users table:', err.message);
  }

  // 3a. Seed the initial admin account (idempotent — runs effectively once).
  await ensureAdmin(p);

  try {
    await p.query(`
      ALTER TABLE trustpilot_reviews ADD COLUMN IF NOT EXISTS channel_id INTEGER;
      ALTER TABLE trustpilot_reviews ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'open';
      ALTER TABLE trustpilot_reviews ADD COLUMN IF NOT EXISTS heading TEXT;
      ALTER TABLE trustpilot_reviews ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
      ALTER TABLE trustpilot_reviews ADD COLUMN IF NOT EXISTS priority VARCHAR(50);
      ALTER TABLE trustpilot_reviews ADD COLUMN IF NOT EXISTS next_action TEXT;
      ALTER TABLE trustpilot_reviews ADD COLUMN IF NOT EXISTS department VARCHAR(100);
      ALTER TABLE trustpilot_reviews ADD COLUMN IF NOT EXISTS user_type VARCHAR(100);
    `);
  } catch (err) {
    console.error('Migration error for trustpilot_reviews table:', err.message);
  }

  // 3c. Add comments columns to all message tables to support audit logs and replies
  try {
    await p.query(`
      ALTER TABLE trustpilot_reviews ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE facebook_messages ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]'::jsonb;
    `);
  } catch (err) {
    console.error('Migration error for comments columns:', err.message);
  }

  // 3d. google_reviews escalation columns migration
  try {
    await p.query(`
      ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS priority VARCHAR(50);
      ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS next_action TEXT;
      ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS department VARCHAR(100);
      ALTER TABLE google_reviews ADD COLUMN IF NOT EXISTS user_type VARCHAR(100);
    `);
  } catch (err) {
    console.error('Migration error for google_reviews escalation columns:', err.message);
  }

  // 4. Notifications (depends on users)
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER REFERENCES users(id),
        message       TEXT,
        is_read       BOOLEAN DEFAULT FALSE,
        created_at    TIMESTAMP DEFAULT NOW()
      );
    `);
  } catch (err) {
    console.warn('notifications table creation failed, attempting to recreate:', err.message);
    try {
      await p.query('DROP TABLE IF EXISTS notifications CASCADE');
      await p.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id            SERIAL PRIMARY KEY,
          user_id       INTEGER REFERENCES users(id),
          message       TEXT,
          is_read       BOOLEAN DEFAULT FALSE,
          created_at    TIMESTAMP DEFAULT NOW()
        );
      `);
    } catch (retryErr) {
      console.error('Failed to recreate notifications table:', retryErr.message);
    }
  }
}

// Ensure an initial admin exists. Uses ON CONFLICT so concurrent serverless
// invocations never create duplicate admins and the password is only ever set
// on first insert. The password is always stored hashed (pbkdf2 + per-row salt).
async function ensureAdmin(p) {
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(INITIAL_ADMIN_PASSWORD, salt);
    const initials = INITIAL_ADMIN_NAME.substring(0, 2).toUpperCase();

    await p.query(
      `INSERT INTO users (email, name, initials, role, status, provider, password_hash, salt, updated_at)
         VALUES ($1, $2, $3, 'admin', 'approved', 'email', $4, $5, NOW())
       ON CONFLICT (email) DO NOTHING`,
      [INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_NAME, initials, passwordHash, salt]
    );
  } catch (err) {
    console.error('ensureAdmin error:', err.message);
  }
}

module.exports = { getPool, ensureTables, ensureAdmin, hashPassword, closePool };
