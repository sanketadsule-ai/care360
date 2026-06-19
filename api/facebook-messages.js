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

    // ─── GET: Return all stored facebook messages ───
    if (req.method === 'GET') {
      const channelId = req.query.channel_id;
      let query = `
        SELECT fm.*, cc.account_email, cc.account_name, cc.platform
        FROM facebook_messages fm
        LEFT JOIN connected_channels cc ON fm.channel_id = cc.id
        ORDER BY fm.received_at DESC
        LIMIT 100
      `;
      let params = [];

      if (channelId) {
        query = `
          SELECT fm.*, cc.account_email, cc.account_name, cc.platform
          FROM facebook_messages fm
          LEFT JOIN connected_channels cc ON fm.channel_id = cc.id
          WHERE fm.channel_id = $1
          ORDER BY fm.received_at DESC
          LIMIT 100
        `;
        params = [channelId];
      }

      const result = await pool.query(query, params);
      return res.status(200).json({ success: true, data: result.rows });
    }

    // ─── POST: Bulk upsert facebook messages ───
    if (req.method === 'POST') {
      const { channel_id, messages } = req.body;

      if (!channel_id || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'channel_id and messages array are required' });
      }

      let savedCount = 0;

      for (const msg of messages) {
        try {
          await pool.query(
            `INSERT INTO facebook_messages (channel_id, fb_post_id, post_type, author_name, message_text, received_at, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'open', NOW())
             ON CONFLICT (fb_post_id)
             DO UPDATE SET
               post_type = EXCLUDED.post_type,
               author_name = EXCLUDED.author_name,
               message_text = EXCLUDED.message_text
            `,
            [
              channel_id,
              msg.fb_post_id,
              msg.post_type || 'Comment',
              msg.author_name || '',
              msg.message_text || '',
              msg.received_at ? new Date(msg.received_at) : new Date()
            ]
          );
          savedCount++;
        } catch (insertErr) {
          console.error('Failed to insert facebook message:', msg.fb_post_id, insertErr.message);
        }
      }

      return res.status(200).json({ success: true, saved: savedCount, total: messages.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('facebook-messages error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
