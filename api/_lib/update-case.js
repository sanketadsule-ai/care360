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

  try {
    await ensureTables();
    const pool = getPool();

    const { id, status, reply_text, is_agent = true, author = 'System', isSystem = false } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Case ID is required' });
    }

    // Since the ID on the frontend can come from multiple sources, we search through our tables
    const tables = [
      { name: 'trustpilot_reviews', idCol: 'review_id' },
      { name: 'google_reviews', idCol: 'review_id' },
      { name: 'facebook_messages', idCol: 'fb_post_id' },
      { name: 'email_messages', idCol: 'gmail_message_id' }
    ];

    const cleanedId = String(id).replace(/^(tp_|gp_|fb_|ig_|gmail-msg-|msg-|post-|fb_orphan_)/, '');
    let found = false;

    for (const table of tables) {
      // Find the record matching either the raw ID or the cleaned ID
      const selectQuery = `
        SELECT * FROM ${table.name} 
        WHERE ${table.idCol} = $1 OR id::text = $1 OR ${table.idCol} = $2 OR id::text = $2
      `;
      const selectResult = await pool.query(selectQuery, [String(id), String(cleanedId)]);

      if (selectResult.rows.length > 0) {
        const record = selectResult.rows[0];
        found = true;

        let newStatus = record.status;
        if (status) {
          newStatus = status.toLowerCase();
        }

        let newComments = record.comments || [];
        if (reply_text) {
          newComments.push({
            id: 'reply_' + Date.now(),
            author: author,
            text: reply_text,
            createdTime: new Date().toISOString(),
            isAgent: is_agent,
            isSystem: isSystem
          });
        }

        // Update the record using both keys
        const updateQuery = `
          UPDATE ${table.name} 
          SET status = $1, comments = $2::jsonb 
          WHERE ${table.idCol} = $3 OR id::text = $3 OR ${table.idCol} = $4 OR id::text = $4
        `;
        await pool.query(updateQuery, [newStatus, JSON.stringify(newComments), String(id), String(cleanedId)]);
        
        break; // Stop searching once we found and updated the record
      }
    }

    return res.status(200).json({ success: found });
  } catch (error) {
    console.error('update-case error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
