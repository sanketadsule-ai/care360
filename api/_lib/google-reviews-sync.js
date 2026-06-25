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

    // 1. Get all active Google Business channels
    const channelsRes = await pool.query(
      "SELECT id, account_email, avatar_url, access_token, account_name FROM connected_channels WHERE platform = 'google_business' AND status = 'active'"
    );

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
          
          try {
            await pool.query(
              `INSERT INTO google_reviews (channel_id, review_id, rating, author_name, author_avatar, comment, received_at, status, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW())
               ON CONFLICT (review_id)
               DO UPDATE SET
                 rating = EXCLUDED.rating,
                 author_name = EXCLUDED.author_name,
                 author_avatar = EXCLUDED.author_avatar,
                 comment = EXCLUDED.comment
              `,
              [
                channel.id,
                uniqueId,
                rating,
                authorName,
                authorAvatar,
                mockRev.comment || '',
                mockRev.createTime || new Date().toISOString()
              ]
            );
            totalSaved++;
          } catch (insertErr) {
            // Ignore unique conflicts
          }
        }
      } catch (err) {
        console.error('Error processing channel', channel.id, err);
      }
    }

    return res.status(200).json({ success: true, synced_count: totalSaved, gr_errors: errors });

  } catch (error) {
    console.error('google-reviews-sync error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message, gr_errors: errors });
  }
};
