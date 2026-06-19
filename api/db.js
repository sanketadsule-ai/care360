// Shared database connection for Vercel Serverless Functions
const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
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
}

module.exports = { getPool, ensureTables };
