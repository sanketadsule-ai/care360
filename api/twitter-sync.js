module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const accessToken = process.env.TWITTER_ACCESS_TOKEN || '';

    if (!accessToken) {
      return res.status(200).json({ success: false, error: 'No TWITTER_ACCESS_TOKEN environment variable set.' });
    }

    // Fetch user ID
    const userRes = await fetch('https://api.twitter.com/2/users/me', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!userRes.ok) {
      const errText = await userRes.text();
      return res.status(200).json({ success: false, error: `User lookup failed: ${errText}` });
    }

    const userId = (await userRes.json()).data.id;

    // Fetch recent tweets
    let tweets = [];
    try {
      const tweetsRes = await fetch(
        `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at,text`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      if (tweetsRes.ok) {
        const tweetsData = await tweetsRes.json();
        tweets = tweetsData.data || [];
      }
    } catch (e) { /* ignore */ }

    // Fetch mentions
    let mentions = [];
    try {
      const mentionsRes = await fetch(
        `https://api.twitter.com/2/users/${userId}/mentions?max_results=10&tweet.fields=created_at,author_id,text`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      if (mentionsRes.ok) {
        const mentionsData = await mentionsRes.json();
        mentions = mentionsData.data || [];
      }
    } catch (e) { /* ignore */ }

    return res.status(200).json({
      success: true,
      tweets,
      mentions
    });

  } catch (err) {
    console.error('Twitter sync error:', err);
    return res.status(200).json({ success: false, error: err.message });
  }
};
