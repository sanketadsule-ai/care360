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
    const { access_token } = req.body;

    if (!access_token) {
      return res.status(400).json({ error: 'Missing access token' });
    }

    // Fetch user ID first to get mentions
    const userRes = await fetch('https://api.twitter.com/2/users/me', {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    if (!userRes.ok) {
      const err = await userRes.text();
      return res.status(userRes.status).json({ error: 'Failed to fetch user ID', details: err });
    }

    const userData = await userRes.json();
    const userId = userData.data.id;

    // Fetch mentions
    const mentionsUrl = `https://api.twitter.com/2/users/${userId}/mentions?max_results=10&tweet.fields=created_at,author_id`;
    const mentionsRes = await fetch(mentionsUrl, {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    if (!mentionsRes.ok) {
      if (mentionsRes.status === 404) {
        return res.status(200).json({ success: true, mentions: [] });
      }
      const err = await mentionsRes.text();
      return res.status(mentionsRes.status).json({ error: 'Failed to fetch mentions', details: err });
    }

    const mentionsData = await mentionsRes.json();
    const mentions = mentionsData.data || [];

    return res.status(200).json({ success: true, mentions });

  } catch (err) {
    console.error('Twitter sync error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};
