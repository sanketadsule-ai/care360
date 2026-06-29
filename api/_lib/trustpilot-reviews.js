const { getPool, ensureTables } = require('./db');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    await ensureTables();
    const pool = getPool();

    // ─── GET: Return all stored trustpilot reviews ───
    if (req.method === 'GET') {
      const channelId = req.query.channel_id;
      let query = `
        SELECT tr.*, cc.account_email, cc.account_name, cc.platform
        FROM trustpilot_reviews tr
        LEFT JOIN connected_channels cc ON tr.channel_id = cc.id
        ORDER BY tr.received_at DESC
        LIMIT 100
      `;
      let params = [];

      if (channelId) {
        query = `
          SELECT tr.*, cc.account_email, cc.account_name, cc.platform
          FROM trustpilot_reviews tr
          LEFT JOIN connected_channels cc ON tr.channel_id = cc.id
          WHERE tr.channel_id = $1
          ORDER BY tr.received_at DESC
          LIMIT 100
        `;
        params = [channelId];
      }

      const result = await pool.query(query, params);
      return res.status(200).json({ success: true, data: result.rows });
    }

    // ─── POST: Bulk upsert trustpilot reviews ───
    if (req.method === 'POST') {
      const { channel_id, messages } = req.body;

      if (!channel_id || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'channel_id and messages array are required' });
      }

      let savedCount = 0;

      for (const msg of messages) {
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
              channel_id,
              msg.review_id,
              msg.rating || 5,
              msg.heading || '',
              msg.author_name || 'Anonymous User',
              msg.comment || '',
              msg.received_at ? new Date(msg.received_at) : new Date()
            ]
          );
          savedCount++;
        } catch (insertErr) {
          console.error('Failed to insert trustpilot review:', msg.review_id, insertErr.message);
        }
      }

      return res.status(200).json({ success: true, saved: savedCount, total: messages.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('trustpilot-reviews error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
