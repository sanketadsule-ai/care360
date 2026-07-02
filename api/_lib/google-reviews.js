const { getPool, ensureTables } = require('./db');
const { analyzeReview } = require('./llm');

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

    // ─── GET: Return all stored google reviews ───
    if (req.method === 'GET') {
      const channelId = req.query.channel_id;
      let query = `
        SELECT gr.*, cc.account_email, cc.account_name, cc.platform
        FROM google_reviews gr
        LEFT JOIN connected_channels cc ON gr.channel_id = cc.id
        ORDER BY gr.received_at DESC
        LIMIT 100
      `;
      let params = [];

      if (channelId) {
        query = `
          SELECT gr.*, cc.account_email, cc.account_name, cc.platform
          FROM google_reviews gr
          LEFT JOIN connected_channels cc ON gr.channel_id = cc.id
          WHERE gr.channel_id = $1
          ORDER BY gr.received_at DESC
          LIMIT 100
        `;
        params = [channelId];
      }

      const result = await pool.query(query, params);
      return res.status(200).json({ success: true, data: result.rows });
    }

    // ─── POST: Bulk upsert google reviews ───
    if (req.method === 'POST') {
      const { channel_id, messages } = req.body;

      if (!channel_id || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'channel_id and messages array are required' });
      }

      let savedCount = 0;

      for (const msg of messages) {
        try {
          const escalation = await analyzeReview(msg.comment || '');
          await pool.query(
            `INSERT INTO google_reviews (channel_id, review_id, rating, author_name, author_avatar, comment, received_at, status, priority, next_action, department, user_type, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $9, $10, $11, NOW())
             ON CONFLICT (review_id)
             DO UPDATE SET
               rating = EXCLUDED.rating,
               author_name = EXCLUDED.author_name,
               author_avatar = EXCLUDED.author_avatar,
               comment = EXCLUDED.comment,
               priority = EXCLUDED.priority,
               next_action = EXCLUDED.next_action,
               department = EXCLUDED.department,
               user_type = EXCLUDED.user_type
            `,
            [
              channel_id,
              msg.review_id,
              msg.rating || 5,
              msg.author_name || 'Anonymous User',
              msg.author_avatar || '',
              msg.comment || '',
              msg.received_at ? new Date(msg.received_at) : new Date(),
              escalation.priority,
              escalation.next_action,
              escalation.department,
              escalation.user_type
            ]
          );
          savedCount++;
        } catch (insertErr) {
          console.error('Failed to insert google review:', msg.review_id, insertErr.message);
        }
      }

      return res.status(200).json({ success: true, saved: savedCount, total: messages.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('google-reviews error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
