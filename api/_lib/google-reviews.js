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

    // In a multi-tenant environment, req.orgId would be passed or derived from auth.
    // For now, we query the seed organization.
    const orgRes = await pool.query("SELECT id FROM organizations WHERE slug = 'carepal360'");
    if (orgRes.rows.length === 0) {
        return res.status(200).json({ success: true, data: [] });
    }
    const orgId = orgRes.rows[0].id;
    
    // Set RLS bypass
    await pool.query("SET LOCAL app.current_org_id = ''");

    // ─── GET: Return all stored google reviews ───
    if (req.method === 'GET') {
      const channelId = req.query.channel_id;
      
      let query = `
        SELECT 
          c.id,
          c.channel_id,
          c.platform_thread_id AS review_id,
          m.rating,
          c.title AS heading,
          co.name AS author_name,
          co.avatar_url AS author_avatar,
          m.content AS comment,
          c.platform_created_at AS received_at,
          c.status,
          c.priority,
          c.next_action,
          c.department,
          c.user_type,
          c.created_at,
          ch.external_id AS account_email,
          ch.display_name AS account_name,
          ch.platform
        FROM conversations c
        LEFT JOIN channels ch ON c.channel_id = ch.id
        LEFT JOIN LATERAL (
          SELECT content, rating, contact_id
          FROM messages
          WHERE conversation_id = c.id AND sender_type = 'customer' AND deleted_at IS NULL
          ORDER BY created_at ASC
          LIMIT 1
        ) m ON TRUE
        LEFT JOIN contacts co ON co.id = m.contact_id
        WHERE c.organization_id = $1 AND c.platform = 'google_business' AND c.deleted_at IS NULL
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

    // ─── POST: Bulk upsert google reviews ───
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
          
          const uniqueId = msg.review_id;
          const rating = msg.rating || 5;
          const authorName = msg.author_name || 'Anonymous User';
          const authorAvatar = msg.author_avatar || '';
          const comment = msg.comment || '';
          const receivedAt = msg.received_at ? new Date(msg.received_at) : new Date();

          const escalation = await analyzeReview(comment);
          const platformUserId = authorName.toLowerCase().replace(/ /g, '_') + '_' + uniqueId;

          // Insert Contact
          const contactRes = await client.query(`
            INSERT INTO contacts (channel_id, platform_user_id, name, avatar_url)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (channel_id, platform_user_id) DO UPDATE SET updated_at = NOW()
            RETURNING id
          `, [channel_id, platformUserId, authorName, authorAvatar]);
          const contactId = contactRes.rows[0].id;

          // Insert Conversation
          const convRes = await client.query(`
            INSERT INTO conversations (organization_id, channel_id, platform_thread_id, title, platform, type, status, priority, next_action, department, user_type, platform_created_at, created_at)
            VALUES ($1, $2, $3, $4, 'google_business', 'Review', 'open', $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (channel_id, platform_thread_id) DO UPDATE SET
              title = EXCLUDED.title,
              priority = EXCLUDED.priority,
              next_action = EXCLUDED.next_action,
              department = EXCLUDED.department,
              user_type = EXCLUDED.user_type,
              updated_at = NOW()
            RETURNING id
          `, [orgId, channel_id, uniqueId, authorName, escalation.priority, escalation.next_action, escalation.department, escalation.user_type, receivedAt]);
          const convId = convRes.rows[0].id;

          // Insert Message
          await client.query(`
            INSERT INTO messages (conversation_id, contact_id, sender_type, visibility, content, platform_message_id, rating, status, platform_created_at, created_at)
            VALUES ($1, $2, 'customer', 'public', $3, $4, $5, 'received', $6, NOW())
            ON CONFLICT (conversation_id, platform_message_id) DO UPDATE SET
              content = EXCLUDED.content,
              rating = EXCLUDED.rating
          `, [convId, contactId, comment, uniqueId, rating, receivedAt]);

          await client.query('COMMIT');
          savedCount++;
        } catch (insertErr) {
          await client.query('ROLLBACK');
          console.error('Failed to insert google review:', msg.review_id, insertErr.message);
        } finally {
          client.release();
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
