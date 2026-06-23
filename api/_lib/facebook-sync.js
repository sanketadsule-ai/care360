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

  try {
    await ensureTables();
    const pool = getPool();

    // 1. Get all active Facebook channels from DB with their access tokens
    const channelsRes = await pool.query(
      "SELECT id, account_email, access_token, account_name FROM connected_channels WHERE platform = 'facebook' AND status = 'active'"
    );

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

      // Save to database
      for (const msg of cases) {
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
              channel.id,
              msg.id,
              msg.type,
              msg.author || '',
              msg.text || '',
              msg.createdTime ? new Date(msg.createdTime) : new Date()
            ]
          );
          totalSaved++;
        } catch (insertErr) {
          // Ignore unique conflict or DB errors on individual inserts
        }
      }
    }

    return res.status(200).json({ success: true, synced_count: totalSaved });

  } catch (error) {
    console.error('facebook-sync error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
