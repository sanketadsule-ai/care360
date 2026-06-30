// Public runtime config for the static frontend.
// The Google OAuth Client ID is not a secret (it ships in browser code), so it
// is safe to expose here. The value is sourced from the environment so it can
// be managed in Vercel rather than hardcoded in config.js.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Allow the browser to cache briefly to avoid a request on every page load.
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const googleClientId =
    process.env.Google_Client_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    '';

  return res.status(200).json({ GOOGLE_CLIENT_ID: googleClientId });
};
