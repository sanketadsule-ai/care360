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

    // In a multi-tenant environment, req.orgId would be passed or derived from auth.
    // For now, we query the seed organization.
    const orgRes = await pool.query("SELECT id FROM organizations WHERE slug = 'carepal360'");
    if (orgRes.rows.length === 0) {
        return res.status(200).json({ success: true, data: [] });
    }
    const orgId = orgRes.rows[0].id;
    
    // Set RLS bypass
    await pool.query("SET LOCAL app.current_org_id = ''");

    // ─── GET: Return all stored platform messages ───
    if (req.method === 'GET') {
      const channelId = req.query.channel_id;
      let query = `
        SELECT 
          c.id,
          c.channel_id,
          m.platform_message_id AS gmail_message_id,
          c.title AS subject,
          co.email AS sender_email,
          co.name AS sender_name,
          ch.external_id AS recipient_email,
          m.content AS body_text,
          c.platform_created_at AS received_at,
          c.status,
          c.created_at,
          ch.external_id AS account_email,
          ch.display_name AS account_name,
          ch.platform
        FROM conversations c
        LEFT JOIN channels ch ON c.channel_id = ch.id
        LEFT JOIN LATERAL (
          SELECT content, platform_message_id, contact_id
          FROM messages
          WHERE conversation_id = c.id AND sender_type = 'customer' AND deleted_at IS NULL
          ORDER BY created_at ASC
          LIMIT 1
        ) m ON TRUE
        LEFT JOIN contacts co ON co.id = m.contact_id
        WHERE c.organization_id = $1 AND c.platform = 'gmail' AND c.deleted_at IS NULL
      `;
      let params = [orgId];

      if (channelId) {
        query += ` AND c.channel_id = $2`;
        params.push(channelId);
      }

      query += ` ORDER BY c.platform_created_at DESC LIMIT 100`;

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
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const uniqueId = msg.gmail_message_id;
          const subject = msg.subject || '(No Subject)';
          const senderEmail = msg.sender_email || '';
          const senderName = msg.sender_name || '';
          const bodyText = msg.body_text || '';
          const receivedAt = msg.received_at ? new Date(msg.received_at) : new Date();
          const platformUserId = senderEmail || (senderName.toLowerCase().replace(/ /g, '_') + '_' + uniqueId);

          // Insert Contact
          const contactRes = await client.query(`
            INSERT INTO contacts (channel_id, platform_user_id, name, email)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (channel_id, platform_user_id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW()
            RETURNING id
          `, [channel_id, platformUserId, senderName, senderEmail]);
          const contactId = contactRes.rows[0].id;

          // Insert Conversation
          const convRes = await client.query(`
            INSERT INTO conversations (organization_id, channel_id, platform_thread_id, title, platform, type, status, platform_created_at, created_at)
            VALUES ($1, $2, $3, $4, 'gmail', 'Email', 'open', $5, NOW())
            ON CONFLICT (channel_id, platform_thread_id) DO UPDATE SET
              title = EXCLUDED.title,
              updated_at = NOW()
            RETURNING id
          `, [orgId, channel_id, uniqueId, subject, receivedAt]);
          const convId = convRes.rows[0].id;

          // Insert Message
          await client.query(`
            INSERT INTO messages (conversation_id, contact_id, sender_type, visibility, content, platform_message_id, status, platform_created_at, created_at)
            VALUES ($1, $2, 'customer', 'public', $3, $4, 'received', $5, NOW())
            ON CONFLICT (conversation_id, platform_message_id) DO UPDATE SET
              content = EXCLUDED.content
          `, [convId, contactId, bodyText, uniqueId, receivedAt]);

          await client.query('COMMIT');
          savedCount++;
        } catch (insertErr) {
          await client.query('ROLLBACK');
          console.error('Failed to insert message:', msg.gmail_message_id, insertErr.message);
        } finally {
          client.release();
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
