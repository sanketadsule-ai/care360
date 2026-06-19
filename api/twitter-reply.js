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
    const { access_token, tweet_id, text } = req.body;

    if (!access_token || !tweet_id || !text) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const payload = {
      text: text,
      reply: {
        in_reply_to_tweet_id: tweet_id
      }
    };

    const replyRes = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const replyData = await replyRes.json();

    if (!replyRes.ok) {
      return res.status(replyRes.status).json({ error: replyData.detail || 'Failed to send reply' });
    }

    return res.status(200).json({ success: true, data: replyData.data });

  } catch (err) {
    console.error('Twitter reply error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};
