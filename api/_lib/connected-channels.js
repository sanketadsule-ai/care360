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

    // In a multi-tenant environment, req.orgId would be passed or derived from auth.
    // For now, we query the seed organization.
    const orgRes = await pool.query("SELECT id FROM organizations WHERE slug = 'carepal360'");
    if (orgRes.rows.length === 0) {
        return res.status(200).json({ success: true, data: [] });
    }
    const orgId = orgRes.rows[0].id;
    
    // Set RLS bypass
    await pool.query("SET LOCAL app.current_org_id = $1", [orgId]);

    // ─── GET: Return all active connected channels ───
    if (req.method === 'GET') {
      const result = await pool.query(`
        SELECT 
          c.id, 
          c.platform, 
          c.external_id AS account_email, 
          c.display_name AS account_name, 
          c.avatar_url, 
          c.status, 
          c.connected_at, 
          c.updated_at,
          cc.encrypted_value AS access_token
        FROM channels c
        LEFT JOIN channel_credentials cc ON cc.channel_id = c.id
        WHERE c.organization_id = $1 AND c.status = 'active' AND c.deleted_at IS NULL
        ORDER BY c.connected_at DESC
      `, [orgId]);
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
      let finalAccountId = null;

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
              finalAccountId = loc.name;
            }
          }
        } catch (e) {
          console.error('Failed to fetch GBP details:', e);
        }
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        const channelResult = await client.query(
          `INSERT INTO channels (organization_id, platform, external_id, display_name, avatar_url, account_id, status, connected_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW())
           ON CONFLICT (organization_id, platform, external_id)
           DO UPDATE SET
             display_name = EXCLUDED.display_name,
             avatar_url = EXCLUDED.avatar_url,
             account_id = EXCLUDED.account_id,
             status = 'active',
             updated_at = NOW()
           RETURNING id, platform, external_id AS account_email, display_name AS account_name, status, connected_at`,
          [orgId, platform, finalEmail, finalName, finalAvatar, finalAccountId]
        );

        const channel = channelResult.rows[0];

        if (access_token) {
          await client.query(
            `INSERT INTO channel_credentials (channel_id, credential_type, encrypted_value, updated_at)
             VALUES ($1, 'oauth_token', $2, NOW())
             ON CONFLICT (channel_id)
             DO UPDATE SET
               encrypted_value = EXCLUDED.encrypted_value,
               updated_at = NOW()`,
            [channel.id, access_token]
          );
        }

        await client.query('COMMIT');
        return res.status(200).json({ success: true, data: channel });
      } catch (txnErr) {
        await client.query('ROLLBACK');
        throw txnErr;
      } finally {
        client.release();
      }
    }

    // ─── DELETE: Remove a connected channel ───
    if (req.method === 'DELETE') {
      const id = req.query.id || (req.body && req.body.id);
      if (!id) {
        return res.status(400).json({ error: 'id is required to delete a channel' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Cascade delete is supported by references on channel_credentials, but conversation/messages have RESTRICT/CASCADE.
        // We will soft delete the channel first.
        await client.query('UPDATE channels SET deleted_at = NOW(), status = \'disconnected\' WHERE id = $1', [id]);
        await client.query('UPDATE conversations SET deleted_at = NOW() WHERE channel_id = $1', [id]);

        await client.query('COMMIT');
        return res.status(200).json({ success: true, message: 'Channel deleted successfully' });
      } catch (txnErr) {
        await client.query('ROLLBACK');
        throw txnErr;
      } finally {
        client.release();
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('connected-channels error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
