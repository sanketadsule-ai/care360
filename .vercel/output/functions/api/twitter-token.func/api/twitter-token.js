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
    const { code, code_verifier, redirect_uri, client_id } = req.body;

    if (!code || !code_verifier || !redirect_uri || !client_id) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Exchange code for token
    const tokenParams = new URLSearchParams();
    tokenParams.append('code', code);
    tokenParams.append('grant_type', 'authorization_code');
    tokenParams.append('client_id', client_id);
    tokenParams.append('redirect_uri', redirect_uri);
    tokenParams.append('code_verifier', code_verifier);

    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams.toString()
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      return res.status(tokenRes.status).json({ error: tokenData.error_description || tokenData.error || 'Failed to fetch token' });
    }

    const access_token = tokenData.access_token;
    const refresh_token = tokenData.refresh_token;

    // Get user info
    const userRes = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const userData = await userRes.json();

    if (!userRes.ok) {
      return res.status(userRes.status).json({ error: userData.detail || 'Failed to fetch user info' });
    }

    const userInfo = userData.data;

    return res.status(200).json({
      success: true,
      user: {
        name: userInfo.name,
        username: userInfo.username,
        id: userInfo.id,
        accessToken: access_token,
        refreshToken: refresh_token
      }
    });

  } catch (err) {
    console.error('Twitter OAuth error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};
