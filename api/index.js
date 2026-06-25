// Central Router for Care360 API
// This file acts as the single Serverless Function for Vercel Hobby limits.

const adminUsers = require('./_lib/admin-users');
const auth = require('./_lib/auth');
const connectedChannels = require('./_lib/connected-channels');
const facebookMessages = require('./_lib/facebook-messages');
const facebookSync = require('./_lib/facebook-sync');
const googleReviews = require('./_lib/google-reviews');
const googleReviewsReply = require('./_lib/google-reviews-reply');
const googleReviewsSync = require('./_lib/google-reviews-sync');
const platformMessages = require('./_lib/platform-messages');
const twitterConnect = require('./_lib/twitter-connect');
const twitterReply = require('./_lib/twitter-reply');
const twitterSync = require('./_lib/twitter-sync');
const twitterToken = require('./_lib/twitter-token');
const userProfile = require('./_lib/user-profile');
const testGbp = require('./_lib/test-gbp');

module.exports = async function handler(req, res) {
  // Extract path without query parameters
  const urlPath = req.url.split('?')[0];

  try {
    switch (urlPath) {
      case '/api/test-deploy':
        return res.status(200).json({ message: 'Deployment is updating!' });
      case '/api/admin-users':
        return await adminUsers(req, res);
      case '/api/auth':
        return await auth(req, res);
      case '/api/connected-channels':
        return await connectedChannels(req, res);
      case '/api/facebook-messages':
        return await facebookMessages(req, res);
      case '/api/facebook-sync':
        return await facebookSync(req, res);
      case '/api/google-reviews':
        return await googleReviews(req, res);
      case '/api/google-reviews-reply':
        return await googleReviewsReply(req, res);
      case '/api/google-reviews-sync':
        return await googleReviewsSync(req, res);
      case '/api/test-gbp':
        return await testGbp(req, res);
      case '/api/platform-messages':
        return await platformMessages(req, res);
      case '/api/twitter-connect':
        return await twitterConnect(req, res);
      case '/api/twitter-reply':
        return await twitterReply(req, res);
      case '/api/twitter-sync':
        return await twitterSync(req, res);
      case '/api/twitter-token':
        return await twitterToken(req, res);
      case '/api/user-profile':
        return await userProfile(req, res);
      default:
        // Handle unknown routes
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
          return res.status(200).end();
        }
        return res.status(404).json({ error: 'API route not found: ' + urlPath });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Global Catch Error', message: err.message, stack: err.stack });
  }
};
