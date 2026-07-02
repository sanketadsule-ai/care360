const { getPool, ensureTables } = require('./db');

async function graphApi(path, accessToken, params) {
  const url = new URL('https://graph.facebook.com/v20.0' + path);
  url.searchParams.set('access_token', accessToken);
  if (params) {
    Object.keys(params).forEach((k) => url.searchParams.set(k, params[k]));
  }
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Graph API error');
  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const errors = [];

  try {
    await ensureTables();
    const pool = getPool();

    // In a multi-tenant environment, req.orgId would be passed or derived from auth.
    // For now, we query the seed organization.
    const orgRes = await pool.query("SELECT id FROM organizations WHERE slug = 'carepal360'");
    if (orgRes.rows.length === 0) {
        return res.status(200).json({ success: true, synced_count: 0, fb_errors: errors });
    }
    const orgId = orgRes.rows[0].id;
    
    // Set RLS bypass
    await pool.query("SET LOCAL app.current_org_id = ''");

    // 1. Get all active Facebook channels from DB with their access tokens
    const channelsRes = await pool.query(`
      SELECT 
        c.id, 
        c.external_id AS account_email, 
        cc.encrypted_value AS access_token, 
        c.display_name AS account_name 
      FROM channels c 
      LEFT JOIN channel_credentials cc ON cc.channel_id = c.id 
      WHERE c.organization_id = $1 AND c.platform = 'facebook' AND c.status = 'active' AND c.deleted_at IS NULL
    `, [orgId]);

    let totalSaved = 0;

    // 2. Sync cases for each connected Facebook Page
    for (const channel of channelsRes.rows) {
      const pageId = channel.account_email; // The Page ID is stored in account_email
      const accessToken = channel.access_token;
      
      if (!accessToken) continue;

      const cases = [];

      try {
        // Fetch Feed
        const feedRes = await graphApi('/' + pageId + '/feed', accessToken, {
          limit: '10',
          fields: 'id,message,story,created_time,from,comments.limit(10){id,message,from,created_time}'
        });

        (feedRes.data || []).forEach(post => {
          cases.push({
            id: post.id,
            type: 'Post',
            author: (post.from && post.from.name) || channel.account_name,
            text: post.message || post.story || 'Facebook Post',
            createdTime: post.created_time
          });

          const comments = (post.comments && post.comments.data) || [];
          comments.forEach(c => {
            cases.push({
              id: c.id,
              type: 'Comment',
              author: (c.from && c.from.name) || 'Facebook User',
              text: c.message || '',
              createdTime: c.created_time
            });
          });
        });
      } catch (err) {
        console.error(`FB Sync Feed Error for page ${pageId}:`, err.message);
        errors.push(`Feed Error for page ${pageId}: ${err.message}`);
      }

      try {
        // Fetch Reels
        const reelsRes = await graphApi('/' + pageId + '/video_reels', accessToken, {
          limit: '10',
          fields: 'id,description,updated_time,comments.limit(10){id,message,from,created_time}'
        });

        (reelsRes.data || []).forEach(reel => {
          cases.push({
            id: reel.id,
            type: 'Reel',
            author: channel.account_name,
            text: reel.description || 'Facebook Reel',
            createdTime: reel.updated_time
          });

          const comments = (reel.comments && reel.comments.data) || [];
          comments.forEach(c => {
            cases.push({
              id: c.id,
              type: 'Comment',
              author: (c.from && c.from.name) || 'Facebook User',
              text: c.message || '',
              createdTime: c.created_time
            });
          });
        });
      } catch (err) {
        console.error(`FB Sync Reels Error for page ${pageId}:`, err.message);
      }

      try {
        // Fetch Direct Messages (Conversations)
        const convRes = await graphApi('/' + pageId + '/conversations', accessToken, {
          limit: '10',
          fields: 'id,updated_time,messages.limit(5){id,message,from,created_time}'
        });

        (convRes.data || []).forEach(conv => {
          const messages = (conv.messages && conv.messages.data) || [];
          messages.forEach(msg => {
            // Skip messages sent by the page itself
            if (msg.from && msg.from.name === channel.account_name) return;
            
            cases.push({
              id: msg.id,
              type: 'Direct Message',
              author: (msg.from && msg.from.name) || 'Facebook User',
              text: msg.message || '',
              createdTime: msg.created_time
            });
          });
        });
      } catch (err) {
        console.error(`FB Sync DM Error for page ${pageId}:`, err.message);
        errors.push(`DM Error for page ${pageId}: ${err.message}`);
      }

      try {
        // Fetch Mentions (Tagged)
        const taggedRes = await graphApi('/' + pageId + '/tagged', accessToken, {
          limit: '10',
          fields: 'id,message,story,created_time,from'
        });

        (taggedRes.data || []).forEach(post => {
          cases.push({
            id: post.id,
            type: 'Mention',
            author: (post.from && post.from.name) || 'Facebook User',
            text: post.message || post.story || 'Mentioned your Page',
            createdTime: post.created_time
          });
        });
      } catch (err) {
        console.error(`FB Sync Tagged Error for page ${pageId}:`, err.message);
        errors.push(`Tagged Error for page ${pageId}: ${err.message}`);
      }

      // Save to database
      for (const msg of cases) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const uniqueId = msg.id;
          const authorName = msg.author || '';
          const messageText = msg.text || '';
          const receivedAt = msg.createdTime ? new Date(msg.createdTime) : new Date();
          const platformUserId = authorName.toLowerCase().replace(/ /g, '_') + '_' + uniqueId;

          // Insert Contact
          const contactRes = await client.query(`
            INSERT INTO contacts (channel_id, platform_user_id, name)
            VALUES ($1, $2, $3)
            ON CONFLICT (channel_id, platform_user_id) DO UPDATE SET updated_at = NOW()
            RETURNING id
          `, [channel.id, platformUserId, authorName]);
          const contactId = contactRes.rows[0].id;

          // Insert Conversation
          const convRes = await client.query(`
            INSERT INTO conversations (organization_id, channel_id, platform_thread_id, title, platform, type, status, platform_created_at, created_at)
            VALUES ($1, $2, $3, $4, 'facebook', $5, 'open', $6, NOW())
            ON CONFLICT (channel_id, platform_thread_id) DO UPDATE SET
              type = EXCLUDED.type,
              updated_at = NOW()
            RETURNING id
          `, [orgId, channel.id, uniqueId, messageText.substring(0, 1000), msg.type, receivedAt]);
          const convId = convRes.rows[0].id;

          // Insert Message
          await client.query(`
            INSERT INTO messages (conversation_id, contact_id, sender_type, visibility, content, platform_message_id, status, platform_created_at, created_at)
            VALUES ($1, $2, 'customer', 'public', $3, $4, 'received', $5, NOW())
            ON CONFLICT (conversation_id, platform_message_id) DO UPDATE SET
              content = EXCLUDED.content
          `, [convId, contactId, messageText, uniqueId, receivedAt]);

          await client.query('COMMIT');
          totalSaved++;
        } catch (insertErr) {
          await client.query('ROLLBACK');
          errors.push({ msg_id: msg.id, error: insertErr.message });
        } finally {
          client.release();
        }
      }
    }

    return res.status(200).json({ success: true, synced_count: totalSaved, fb_errors: errors });

  } catch (error) {
    console.error('facebook-sync error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message, fb_errors: errors });
  }
};
