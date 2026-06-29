require('dotenv').config();
const { Pool } = require('pg');
const { ensureTables } = require('./api/_lib/db');

// Fallback to the Neon database URL if not in .env
let connString = process.env.DATABASE_URL || 'postgres://default:A6jPoxKqIe8c@ep-holy-snow-a1bshx41-pooler.ap-southeast-1.aws.neon.tech:5432/verceldb?sslmode=require';
if (connString.includes('?')) {
  connString = connString.split('?')[0];
}

const pool = new Pool({
  connectionString: connString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log("Initializing database tables if they don't exist...");
    await ensureTables();
    console.log("Tables ensured.");

    console.log("Fetching Trustpilot reviews from local server...");
    const response = await fetch('http://localhost:8080/api/trustpilot-reviews');
    if (!response.ok) {
      throw new Error(`Failed to fetch reviews: ${response.statusText}`);
    }
    const result = await response.json();
    
    if (!result.success || !result.data) {
      throw new Error("Invalid response format from server");
    }

    const reviews = result.data;
    console.log(`Fetched ${reviews.length} reviews. Seeding into database...`);

    // Ensure a Trustpilot channel exists
    let channelId;
    const channelRes = await pool.query("SELECT id FROM connected_channels WHERE platform='trustpilot' LIMIT 1");
    if (channelRes.rows.length > 0) {
      channelId = channelRes.rows[0].id;
    } else {
      const insertChannel = await pool.query(
        "INSERT INTO connected_channels (platform, account_name) VALUES ('trustpilot', 'Trustpilot') RETURNING id"
      );
      channelId = insertChannel.rows[0].id;
    }

    let insertedCount = 0;
    for (const review of reviews) {
      // Clean up rating to integer
      let ratingInt = 5;
      if (review.rating && !isNaN(parseInt(review.rating))) {
        ratingInt = parseInt(review.rating);
      }
      
      const insertQuery = `
        INSERT INTO trustpilot_reviews (channel_id, review_id, rating, heading, author_name, comment, received_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (review_id) DO NOTHING
      `;
      
      const res = await pool.query(insertQuery, [
        channelId,
        review.review_id,
        ratingInt,
        (review.heading || '').substring(0, 1000),
        (review.author_name || 'Anonymous').substring(0, 255),
        review.comment || ''
      ]);
      
      if (res.rowCount > 0) {
        insertedCount++;
      }
    }

    console.log(`Successfully inserted ${insertedCount} new reviews into 'trustpilot_reviews' table!`);

  } catch (err) {
    console.error("Error during seeding:", err.message);
  } finally {
    pool.end();
  }
}

run();
