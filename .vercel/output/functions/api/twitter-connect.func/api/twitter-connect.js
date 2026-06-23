module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let accessToken = process.env.TWITTER_ACCESS_TOKEN || '';
    const refreshToken = process.env.TWITTER_REFRESH_TOKEN || '';
    const clientId = process.env.TWITTER_CLIENT_ID || '';
    const clientSecret = process.env.TWITTER_CLIENT_SECRET || '';

    if (!accessToken) {
      return res.status(200).json({ success: false, error: 'No TWITTER_ACCESS_TOKEN environment variable set.' });
    }

    // Try to get user info with current access token
    let userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,description', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    // If token expired, try refreshing
    if (userRes.status === 401 && refreshToken && clientId) {
      const tokenParams = new URLSearchParams();
      tokenParams.append('grant_type', 'refresh_token');
      tokenParams.append('refresh_token', refreshToken);
      tokenParams.append('client_id', clientId);

      const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      if (clientSecret) {
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }

      const refreshRes = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers,
        body: tokenParams.toString()
      });

      if (refreshRes.ok) {
        const newTokens = await refreshRes.json();
        accessToken = newTokens.access_token;

        // Retry with new token
        userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,description', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
      }
    }

    if (!userRes.ok) {
      const bearerToken = process.env.TWITTER_BEARER_TOKEN || '';
      if (bearerToken) {
        console.log("OAuth failed, falling back to Bearer token in Vercel API...");
        userRes = await fetch('https://api.twitter.com/2/users/by/username/TwitterDev?user.fields=profile_image_url,description', {
          headers: { 'Authorization': `Bearer ${bearerToken}` }
        });
      }
    }

    if (!userRes.ok) {
      const errData = await userRes.text();
      return res.status(200).json({ success: false, error: `Twitter API error (${userRes.status}): ${errData}` });
    }

    const userData = await userRes.json();
    const userInfo = userData.data;

    return res.status(200).json({
      success: true,
      user: {
        name: userInfo.name,
        username: userInfo.username,
        id: userInfo.id,
        profile_image_url: userInfo.profile_image_url || '',
        description: userInfo.description || ''
      }
    });

  } catch (err) {
    console.error('Twitter connect error:', err);
    return res.status(200).json({ success: false, error: err.message });
  }
};
