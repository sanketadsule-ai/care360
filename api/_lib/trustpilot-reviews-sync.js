const { getPool, ensureTables } = require('./db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const errors = [];

  try {
    await ensureTables();
    const pool = getPool();

    // Ensure a Trustpilot channel exists in connected_channels
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

    let totalSaved = 0;

    try {
      // In a real Vercel environment, this would call a real Trustpilot API.
      // For local testing, we hit the Python scraper running on port 8080.
      const fetch = require('node-fetch'); // Ensure node-fetch is available if needed in Vercel
      
      // Fallback url logic just in case it runs on Vercel vs Local
      const localScraperUrl = process.env.SCRAPER_URL || 'http://localhost:8080/api/trustpilot-reviews';
      
      const revRes = await fetch(localScraperUrl);
      
      if (!revRes.ok) {
        throw new Error(`Failed to fetch reviews: ${revRes.statusText}`);
      }

      const revData = await revRes.json();
      const reviews = revData.data || [];

      for (const mockRev of reviews) {
        let ratingInt = 5;
        if (mockRev.rating && !isNaN(parseInt(mockRev.rating))) {
          ratingInt = parseInt(mockRev.rating);
        }

        try {
          await pool.query(
            `INSERT INTO trustpilot_reviews (channel_id, review_id, rating, heading, author_name, comment, received_at, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW())
             ON CONFLICT (review_id)
             DO UPDATE SET
               rating = EXCLUDED.rating,
               heading = EXCLUDED.heading,
               author_name = EXCLUDED.author_name,
               comment = EXCLUDED.comment
            `,
            [
              channelId,
              mockRev.review_id,
              ratingInt,
              (mockRev.heading || '').substring(0, 1000),
              (mockRev.author_name || 'Anonymous User').substring(0, 255),
              mockRev.comment || '',
              mockRev.received_at ? new Date(mockRev.received_at) : new Date()
            ]
          );
          totalSaved++;
        } catch (insertErr) {
          // Ignore unique conflicts if ON CONFLICT fails for some reason
        }
      }
    } catch (err) {
      console.error('Error processing Trustpilot sync:', err);
      errors.push(err.message);
    }

    return res.status(200).json({ success: true, synced_count: totalSaved, errors: errors });

  } catch (error) {
    console.error('trustpilot-reviews-sync error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message, errors: errors });
  }
};
