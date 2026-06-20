module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const bearerToken = process.env.TWITTER_BEARER_TOKEN || '';
    let accessToken = process.env.TWITTER_ACCESS_TOKEN || '';
    
    let userId = null;
    let username = null;
    let usingBearer = false;

    // 1. Try to get user via OAuth
    if (accessToken) {
      try {
        const uRes = await fetch('https://api.twitter.com/2/users/me', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (uRes.ok) {
          const uData = await uRes.json();
          userId = uData.data.id;
          username = uData.data.username || '';
        }
      } catch (e) { console.error('OAuth user lookup failed', e); }
    }

    // 2. Fallback to Bearer token if OAuth failed
    if (!userId && bearerToken) {
      usingBearer = true;
      try {
        const uRes = await fetch('https://api.twitter.com/2/users/by/username/TwitterDev', {
          headers: { 'Authorization': `Bearer ${bearerToken}` }
        });
        if (uRes.ok) {
          const uData = await uRes.json();
          userId = uData.data.id;
          username = uData.data.username || 'TwitterDev';
        }
      } catch (e) { console.error('Bearer user lookup failed', e); }
    }

    const token = usingBearer ? bearerToken : (accessToken || bearerToken);
    if (!token) {
      return res.status(200).json({ success: false, error: 'No Twitter tokens available in Vercel env.' });
    }

    // 3. Fetch Timeline
    let tweets = [];
    try {
      const tRes = await fetch(`https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at,text,author_id`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (tRes.ok) {
        tweets = (await tRes.json()).data || [];
      }
    } catch (e) { console.error('Timeline fetch failed', e); }

    // 4. Fetch Mentions (try standard mentions first)
    let mentions = [];
    let mentionsSuccess = false;
    try {
      const mRes = await fetch(`https://api.twitter.com/2/users/${userId}/mentions?max_results=10&tweet.fields=created_at,author_id,text`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (mRes.ok) {
        mentions = (await mRes.json()).data || [];
        mentionsSuccess = true;
      }
    } catch (e) { console.error('Standard mentions failed', e); }

    // 5. Fallback for Mentions (search/recent works with Bearer)
    if (!mentionsSuccess && username && bearerToken) {
      try {
        const sRes = await fetch(`https://api.twitter.com/2/tweets/search/recent?query=%40${username}&max_results=10&tweet.fields=created_at,author_id,text`, {
          headers: { 'Authorization': `Bearer ${bearerToken}` }
        });
        if (sRes.ok) {
          mentions = (await sRes.json()).data || [];
        }
      } catch (e) { console.error('Search recent fallback failed', e); }
    }

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
