// Vercel Serverless Function: /api/platform-messages
// GET  — list stored platform messages
// POST — bulk upsert platform messages
const { getPool, ensureTables } = require('./_db');

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

    // ─── GET: Return all stored platform messages ───
    if (req.method === 'GET') {
      const channelId = req.query.channel_id;
      let query = `
        SELECT em.*, cc.account_email, cc.account_name, cc.platform
        FROM email_messages em
        LEFT JOIN connected_channels cc ON em.channel_id = cc.id
        ORDER BY em.received_at DESC
        LIMIT 100
      `;
      let params = [];

      if (channelId) {
        query = `
          SELECT em.*, cc.account_email, cc.account_name, cc.platform
          FROM email_messages em
          LEFT JOIN connected_channels cc ON em.channel_id = cc.id
          WHERE em.channel_id = $1
          ORDER BY em.received_at DESC
          LIMIT 100
        `;
        params = [channelId];
      }

      const result = await pool.query(query, params);
      return res.status(200).json({ success: true, data: result.rows });
    }

    // ─── POST: Bulk upsert platform messages ───
    if (req.method === 'POST') {
      const { channel_id, messages } = req.body;

      if (!channel_id || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'channel_id and messages array are required' });
      }

      let savedCount = 0;

      for (const msg of messages) {
        try {
          await pool.query(
            `INSERT INTO email_messages (channel_id, gmail_message_id, subject, sender_email, sender_name, recipient_email, body_text, received_at, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', NOW())
             ON CONFLICT (gmail_message_id)
             DO UPDATE SET
               subject = EXCLUDED.subject,
               sender_name = EXCLUDED.sender_name,
               body_text = EXCLUDED.body_text
            `,
            [
              channel_id,
              msg.gmail_message_id,
              msg.subject || '(No Subject)',
              msg.sender_email || '',
              msg.sender_name || '',
              msg.recipient_email || '',
              msg.body_text || '',
              msg.received_at ? new Date(msg.received_at) : new Date()
            ]
          );
          savedCount++;
        } catch (insertErr) {
          console.error('Failed to insert message:', msg.gmail_message_id, insertErr.message);
        }
      }

      return res.status(200).json({ success: true, saved: savedCount, total: messages.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('platform-messages error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
