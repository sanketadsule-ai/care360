// Shared database connection for Vercel Serverless Functions
const { Pool } = require('pg');

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
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
  }
  return pool;
}

// Initialize tables if they don't exist
async function ensureTables() {
  const p = getPool();

  // 1. connected_channels (no foreign keys)
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
  `);

  // 2. email_messages (depends on connected_channels)
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
  `);

  // 3. facebook_messages (depends on connected_channels)
  await p.query(`
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
  `);

  // 4. users (no foreign keys — MUST come before notifications)
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         VARCHAR(255) UNIQUE NOT NULL,
      name          VARCHAR(255) NOT NULL,
      initials      VARCHAR(10),
      avatar_url    VARCHAR(512),
      role          VARCHAR(50) DEFAULT 'user',
      status        VARCHAR(50) DEFAULT 'pending',
      created_at    TIMESTAMP DEFAULT NOW()
    );
  `);
  
  // Migration for existing tables
  try {
    await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS initials VARCHAR(10);`);
    await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);`);
    await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';`);
    await p.query(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';`);
  } catch (err) {
    console.error('Migration error for users table:', err.message);
  }

  // 5. notifications (depends on users)
  // Wrapped in try/catch: if the FK constraint is broken from a prior
  // deployment, drop the table and recreate it so it doesn't block everything.
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

module.exports = { getPool, ensureTables };
