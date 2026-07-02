const { getPool, ensureTables } = require('./db');

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
        return res.status(200).json({ success: true, synced_count: 0, gr_errors: errors });
    }
    const orgId = orgRes.rows[0].id;
    
    // Set RLS bypass
    await pool.query("SET LOCAL app.current_org_id = ''");

    // 1. Get all active Google Business channels
    const channelsRes = await pool.query(`
      SELECT 
        c.id, 
        c.external_id AS account_email, 
        c.avatar_url, 
        cc.encrypted_value AS access_token, 
        c.display_name AS account_name 
      FROM channels c 
      LEFT JOIN channel_credentials cc ON cc.channel_id = c.id 
      WHERE c.organization_id = $1 AND c.platform = 'google_business' AND c.status = 'active' AND c.deleted_at IS NULL
    `, [orgId]);

    let totalSaved = 0;

    for (const channel of channelsRes.rows) {
      try {
        const acc = channel.account_email; // accounts/XYZ
        const loc = channel.avatar_url; // locations/ABC
        
        if (!acc || !loc || !acc.startsWith('accounts/') || !loc.startsWith('locations/')) {
          console.warn('Invalid account or location for channel:', channel.id);
          continue;
        }

        const url = `https://mybusiness.googleapis.com/v4/${acc}/${loc}/reviews`;
        const revRes = await fetch(url, {
          headers: { 'Authorization': `Bearer ${channel.access_token}` }
        });
        
        if (!revRes.ok) {
          console.error(`Failed to fetch reviews for ${channel.id}: ${revRes.statusText}`);
          continue;
        }

        const revData = await revRes.json();
        const reviews = revData.reviews || [];

        for (const mockRev of reviews) {
          const uniqueId = mockRev.reviewId;
          const rating = mockRev.starRating === 'ONE' ? 1 :
                         mockRev.starRating === 'TWO' ? 2 :
                         mockRev.starRating === 'THREE' ? 3 :
                         mockRev.starRating === 'FOUR' ? 4 :
                         mockRev.starRating === 'FIVE' ? 5 : 0;
          
          const authorName = mockRev.reviewer ? mockRev.reviewer.displayName : 'Unknown';
          const authorAvatar = mockRev.reviewer ? mockRev.reviewer.profilePhotoUrl : '';
          const comment = mockRev.comment || '';
          const receivedAt = mockRev.createTime || new Date().toISOString();
          
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            
            const platformUserId = authorName.toLowerCase().replace(/ /g, '_') + '_' + uniqueId;
            
            // Insert Contact
            const contactRes = await client.query(`
              INSERT INTO contacts (channel_id, platform_user_id, name, avatar_url)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (channel_id, platform_user_id) DO UPDATE SET updated_at = NOW()
              RETURNING id
            `, [channel.id, platformUserId, authorName, authorAvatar]);
            const contactId = contactRes.rows[0].id;

            // Insert Conversation
            const convRes = await client.query(`
              INSERT INTO conversations (organization_id, channel_id, platform_thread_id, title, platform, type, status, platform_created_at, created_at)
              VALUES ($1, $2, $3, $4, 'google_business', 'Review', 'open', $5, NOW())
              ON CONFLICT (channel_id, platform_thread_id) DO UPDATE SET updated_at = NOW()
              RETURNING id
            `, [orgId, channel.id, uniqueId, authorName, receivedAt]);
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
            totalSaved++;
          } catch (insertErr) {
            await client.query('ROLLBACK');
            errors.push({ review_id: uniqueId, error: insertErr.message });
          } finally {
            client.release();
          }
        }
      } catch (err) {
        console.error('Error processing channel', channel.id, err);
        errors.push({ channel_id: channel.id, error: err.message });
      }
    }

    return res.status(200).json({ success: true, synced_count: totalSaved, gr_errors: errors });

  } catch (error) {
    console.error('google-reviews-sync error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message, gr_errors: errors });
  }
};
