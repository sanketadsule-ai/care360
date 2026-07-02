const { getPool, ensureTables } = require('./db');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    await ensureTables();
    const pool = getPool();

    const { id, status, reply_text, is_agent = true, author = 'System', isSystem = false } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Case ID (Conversation ID) is required' });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    
    // Set RLS bypass since we are in script/admin update context
    await client.query("SET LOCAL app.current_org_id = ''");

    // Try to find the conversation by UUID first, or by platform_thread_id
    const cleanedId = String(id).replace(/^(tp_|gp_|fb_|ig_|gmail-msg-|msg-|post-|fb_orphan_)/, '');

    // Because ID might be UUID or platform ID, we check both. 
    // In PostgreSQL, querying a UUID column with a non-UUID string will throw an error, 
    // so we handle UUID detection.
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    let convId = null;

    if (isUUID) {
       const selectResult = await client.query("SELECT id, status FROM conversations WHERE id = $1", [id]);
       if(selectResult.rows.length > 0) convId = selectResult.rows[0].id;
    } else {
       // Search by platform_thread_id
       const selectResult = await client.query("SELECT id, status FROM conversations WHERE platform_thread_id = $1 OR platform_thread_id = $2 LIMIT 1", [String(id), String(cleanedId)]);
       if(selectResult.rows.length > 0) convId = selectResult.rows[0].id;
    }

    if (convId) {
       if (status) {
         await client.query("UPDATE conversations SET status = $1, updated_at = NOW() WHERE id = $2", [status.toLowerCase(), convId]);
       }

       if (reply_text) {
          // Find system user if author matches, or fallback
          let authorId = null;
          const userRes = await client.query("SELECT id FROM users WHERE name = $1 LIMIT 1", [author]);
          if(userRes.rows.length > 0) {
            authorId = userRes.rows[0].id;
          }

          await client.query(`
             INSERT INTO messages (conversation_id, author_id, sender_type, visibility, content, platform_message_id, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'sent')
          `, [
             convId,
             authorId,
             isSystem ? 'system' : (is_agent ? 'agent' : 'customer'),
             'public',
             reply_text,
             'reply_' + Date.now()
          ]);
       }
       await client.query("COMMIT");
       return res.status(200).json({ success: true });
    }

    // Not found
    await client.query("COMMIT");
    return res.status(200).json({ success: false, message: 'Conversation not found' });
  } catch (error) {
    if (client) {
      try { await client.query("ROLLBACK"); } catch(e){}
    }
    console.error('update-case error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    if (client) client.release();
  }
};
