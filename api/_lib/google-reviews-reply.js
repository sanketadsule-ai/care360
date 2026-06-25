const { getPool, ensureTables } = require('./db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { channel_id, review_id, reply_text } = req.body;

    if (!review_id || !reply_text) {
      return res.status(400).json({ error: 'review_id and reply_text are required' });
    }

    await ensureTables();
    const pool = getPool();

    // 1. Fetch channel credentials
    let accountStr = '';
    let locationStr = '';
    let access_token = '';
    
    if (channel_id) {
      const channelRes = await pool.query(
        "SELECT account_email, avatar_url, access_token FROM connected_channels WHERE id = $1 AND status = 'active'",
        [channel_id]
      );
      
      if (channelRes.rows.length > 0) {
        accountStr = channelRes.rows[0].account_email; // "accounts/XYZ"
        locationStr = channelRes.rows[0].avatar_url;   // "locations/ABC"
        access_token = channelRes.rows[0].access_token;
      }
    }

    // Send actual reply to Google Business API
    const url = `https://mybusiness.googleapis.com/v4/${accountStr}/${locationStr}/reviews/${review_id}/reply`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ comment: reply_text })
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error('Google API Error:', errText);
      throw new Error('API failed: ' + response.statusText);
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Reply sent successfully!',
      reply: reply_text 
    });

  } catch (error) {
    console.error('google-reviews-reply error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
