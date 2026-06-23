// Central Router for Care360 API
// This file acts as the single Serverless Function for Vercel Hobby limits.

const adminUsers = require('./_lib/admin-users');
const auth = require('./_lib/auth');
const connectedChannels = require('./_lib/connected-channels');
const facebookMessages = require('./_lib/facebook-messages');
const facebookSync = require('./_lib/facebook-sync');
const platformMessages = require('./_lib/platform-messages');
const twitterConnect = require('./_lib/twitter-connect');
const twitterReply = require('./_lib/twitter-reply');
const twitterSync = require('./_lib/twitter-sync');
const twitterToken = require('./_lib/twitter-token');
const userProfile = require('./_lib/user-profile');

module.exports = async function handler(req, res) {
  // Extract path without query parameters
  const urlPath = req.url.split('?')[0];

  // Route based on exact path matches (Vercel routes /api/xxx)
  switch (urlPath) {
    case '/api/admin-users':
      return adminUsers(req, res);
    case '/api/auth':
      return auth(req, res);
    case '/api/connected-channels':
      return connectedChannels(req, res);
    case '/api/facebook-messages':
      return facebookMessages(req, res);
    case '/api/facebook-sync':
      return facebookSync(req, res);
    case '/api/platform-messages':
      return platformMessages(req, res);
    case '/api/twitter-connect':
      return twitterConnect(req, res);
    case '/api/twitter-reply':
      return twitterReply(req, res);
    case '/api/twitter-sync':
      return twitterSync(req, res);
    case '/api/twitter-token':
      return twitterToken(req, res);
    case '/api/user-profile':
      return userProfile(req, res);
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
};
