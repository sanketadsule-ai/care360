/**
 * Carapal360 — Twitter (X) Integration
 * Uses server-side tokens from .env to connect directly.
 */
(function () {
  'use strict';

  const cfg = window.CARAPAL_CONFIG || {};

  // Connect to Twitter using server-stored tokens (bypasses OAuth popup)
  async function connect() {
    try {
      const res = await fetch('/api/twitter/connect');
      const data = await res.json();

      if (data.success && data.user) {
        alert('✅ Twitter connected! Welcome, @' + data.user.username);
        if (window.addTwitterAccount) {
          window.addTwitterAccount(data.user);
        }
      } else {
        alert('Twitter connection failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Twitter connect error:', err);
      alert('Could not reach the server. Make sure server.py is running.');
    }
  }

  // Sync Twitter mentions and tweets
  async function sync() {
    try {
      const res = await fetch('/api/twitter/sync');
      const data = await res.json();

      if (data.success) {
        return {
          tweets: data.tweets || [],
          mentions: data.mentions || []
        };
      } else {
        console.error('Twitter sync error:', data.error);
        return { tweets: [], mentions: [] };
      }
    } catch (err) {
      console.error('Twitter sync fetch error:', err);
      return { tweets: [], mentions: [] };
    }
  }

  window.CarapalTwitter = { connect, sync };
})();
