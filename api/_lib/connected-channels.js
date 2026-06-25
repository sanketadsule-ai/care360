// Vercel Serverless Function: /api/connected-channels
// GET  — list all connected channels
// POST — save a new connected channel
const { getPool, ensureTables } = require('./db');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    await ensureTables();
    const pool = getPool();

    // ─── GET: Return all active connected channels ───
    if (req.method === 'GET') {
      const result = await pool.query(
        'SELECT id, platform, account_email, account_name, avatar_url, status, connected_at, updated_at FROM connected_channels WHERE status = $1 ORDER BY connected_at DESC',
        ['active']
      );
      return res.status(200).json({ success: true, data: result.rows });
    }

    // ─── POST: Save a connected channel ───
    if (req.method === 'POST') {
      const { platform, account_email, account_name, avatar_url, access_token } = req.body;

      if (!platform || !access_token && platform === 'google_business') {
        return res.status(400).json({ error: 'platform and access_token are required' });
      }

      let finalEmail = account_email || 'unknown';
      let finalName = account_name || '';
      let finalAvatar = avatar_url || '';

      if (platform === 'google_business') {
        try {
          // Fetch real GBP account and location
          const accRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
            headers: { 'Authorization': `Bearer ${access_token}` }
          });
          const accData = await accRes.json();
          if (accData.accounts && accData.accounts.length > 0) {
            const accName = accData.accounts[0].name; // accounts/XYZ
            
            const locRes = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${accName}/locations?readMask=name,title`, {
              headers: { 'Authorization': `Bearer ${access_token}` }
            });
            const locData = await locRes.json();
            
            if (locData.locations && locData.locations.length > 0) {
              const loc = locData.locations[0];
              finalEmail = accName; // Store account string here
              finalName = loc.title || 'Google Business';
              finalAvatar = loc.name; // Use avatar_url to store location string (locations/ABC)
            }
          }
        } catch (e) {
          console.error('Failed to fetch GBP details:', e);
        }
      }

      const result = await pool.query(
        `INSERT INTO connected_channels (platform, account_email, account_name, avatar_url, access_token, status, connected_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW())
         ON CONFLICT (platform, account_email)
         DO UPDATE SET
           account_name = EXCLUDED.account_name,
           avatar_url = EXCLUDED.avatar_url,
           access_token = EXCLUDED.access_token,
           status = 'active',
           updated_at = NOW()
         RETURNING id, platform, account_email, account_name, status, connected_at`,
        [platform, finalEmail, finalName, finalAvatar, access_token || '']
      );

      return res.status(200).json({ success: true, data: result.rows[0] });
    }

    // ─── DELETE: Remove a connected channel ───
    if (req.method === 'DELETE') {
      const id = req.query.id || (req.body && req.body.id);
      if (!id) {
        return res.status(400).json({ error: 'id is required to delete a channel' });
      }

      await pool.query('DELETE FROM email_messages WHERE channel_id = $1', [id]);
      await pool.query('DELETE FROM facebook_messages WHERE channel_id = $1', [id]);
      await pool.query(
        'DELETE FROM connected_channels WHERE id = $1',
        [id]
      );
      
      return res.status(200).json({ success: true, message: 'Channel deleted successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('connected-channels error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
