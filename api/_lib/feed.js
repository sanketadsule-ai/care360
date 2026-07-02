// Vercel Serverless Function: /api/feed
// Reads unified conversations and messages from the new omnichannel schema.
const { getPool, ensureTables } = require('./db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let client;
  try {
    await ensureTables();
    const pool = getPool();
    
    // In a multi-tenant environment, req.orgId would be passed or derived from auth.
    // For now, we query the seed organization.
    const orgRes = await pool.query("SELECT id FROM organizations WHERE slug = 'carepal360'");
    if (orgRes.rows.length === 0) {
        return res.status(200).json({ success: true, threads: [], counts: {} });
    }
    const orgId = orgRes.rows[0].id;
    
    client = await pool.connect();
    await client.query("BEGIN");
    // Set RLS bypass for the query since we haven't implemented full tenant auth yet
    await client.query("SET LOCAL app.current_org_id = $1", [orgId]);

    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;

    // Fetch unified feed
    const query = `
      SELECT
          c.id as conv_id,
          c.platform,
          c.type,
          c.title,
          c.status,
          c.priority,
          c.department,
          c.user_type,
          c.next_action,
          c.updated_at                    AS created_time,
          co.name                         AS author,
          co.avatar_url,
          first_msg.content               AS text,
          first_msg.rating,
          first_msg.platform_created_at
      FROM conversations c
      LEFT JOIN LATERAL (
          SELECT content, rating, contact_id, platform_created_at
          FROM   messages
          WHERE  conversation_id = c.id
            AND  sender_type     = 'customer'
            AND  deleted_at      IS NULL
          ORDER BY created_at ASC
          LIMIT 1
      ) first_msg ON TRUE
      LEFT JOIN contacts co  ON co.id = first_msg.contact_id
      WHERE  c.organization_id = $1
        AND  c.deleted_at       IS NULL
      ORDER BY c.updated_at DESC
      LIMIT $2 OFFSET $3;
    `;
    const result = await client.query(query, [orgId, limit, offset]);

    // Fetch all comments (messages where sender_type = 'agent')
    // and attach them to the threads.
    // To do this efficiently, we grab all agent replies for the returned conversations.
    let threads = result.rows.map(r => ({
      id: r.conv_id,
      platform: r.platform,
      type: r.type,
      author: r.author || 'Unknown User',
      text: (r.rating ? '★'.repeat(r.rating) + ' ' : '') + (r.text || ''),
      createdTime: r.created_time,
      priority: r.priority,
      next_action: r.next_action,
      department: r.department,
      user_type: r.user_type,
      comments: []
    }));

    if (threads.length > 0) {
      const convIds = threads.map(t => t.id);
      const commentsQuery = `
        SELECT m.conversation_id, m.id, u.name as author, m.content as text, m.created_at
        FROM messages m
        LEFT JOIN users u ON u.id = m.author_id
        WHERE m.conversation_id = ANY($1)
          AND m.sender_type = 'agent'
          AND m.deleted_at IS NULL
        ORDER BY m.created_at ASC
      `;
      const commentsRes = await client.query(commentsQuery, [convIds]);
      
      for (const row of commentsRes.rows) {
        const thread = threads.find(t => t.id === row.conversation_id);
        if (thread) {
          thread.comments.push({
            id: row.id,
            author: row.author || 'Agent',
            text: row.text,
            createdTime: row.created_at
          });
        }
      }
    }

    // Counts by platform
    const countsQuery = `
      SELECT platform, COUNT(*) as count
      FROM conversations
      WHERE organization_id = $1 AND deleted_at IS NULL
      GROUP BY platform
    `;
    const countsRes = await client.query(countsQuery, [orgId]);
    const counts = {};
    for (const row of countsRes.rows) {
      counts[row.platform] = parseInt(row.count, 10);
    }

    await client.query("COMMIT");
    return res.status(200).json({ success: true, threads, counts });
  } catch (error) {
    if (client) {
      try { await client.query("ROLLBACK"); } catch(e){}
    }
    console.error('feed error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    if (client) client.release();
  }
};
