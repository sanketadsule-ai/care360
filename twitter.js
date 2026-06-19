/**
 * Carapal360 — Twitter (X) Integration
 */
(function () {
  'use strict';

  const cfg = window.CARAPAL_CONFIG || {};

  function isConfigured() {
    return typeof cfg.TWITTER_CLIENT_ID === 'string' && cfg.TWITTER_CLIENT_ID !== 'YOUR_TWITTER_CLIENT_ID_HERE';
  }

  // Generate a random string for PKCE
  function generateRandomString(length) {
    const array = new Uint32Array(length / 2);
    window.crypto.getRandomValues(array);
    return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('');
  }

  // Hash the string using SHA-256
  async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    const base64Url = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return base64Url;
  }

  async function connect() {
    if (!isConfigured()) {
      alert('Twitter Client ID is not configured. Please open config.js and add your Twitter Client ID.');
      return;
    }

    const state = generateRandomString(16);
    const codeVerifier = generateRandomString(64);
    
    // Save state and verifier in localStorage so we can use them later
    localStorage.setItem('twitter_oauth_state', state);
    localStorage.setItem('twitter_code_verifier', codeVerifier);

    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const redirectUri = window.location.origin + '/twitter_auth.html';

    const authUrl = 'https://twitter.com/i/oauth2/authorize' +
      '?response_type=code' +
      '&client_id=' + encodeURIComponent(cfg.TWITTER_CLIENT_ID) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&scope=' + encodeURIComponent(cfg.TWITTER_SCOPES) +
      '&state=' + encodeURIComponent(state) +
      '&code_challenge=' + encodeURIComponent(codeChallenge) +
      '&code_challenge_method=S256';

    // Open popup
    const width = 600, height = 700;
    const left = (window.innerWidth / 2) - (width / 2);
    const top = (window.innerHeight / 2) - (height / 2);
    
    window.open(authUrl, 'TwitterAuth', `width=${width},height=${height},top=${top},left=${left}`);
  }

  // Listen for the postMessage from twitter_auth.html
  window.addEventListener('message', async (event) => {
    // Basic security check: ensure it came from the same origin
    if (event.origin !== window.location.origin) return;

    if (event.data.type === 'TWITTER_AUTH_SUCCESS') {
      const { code, state } = event.data;
      const savedState = localStorage.getItem('twitter_oauth_state');
      const codeVerifier = localStorage.getItem('twitter_code_verifier');

      if (state !== savedState) {
        alert('Twitter OAuth state mismatch. Possible CSRF attack.');
        return;
      }

      // We have the code! Send it to our backend to exchange for tokens.
      try {
        const redirectUri = window.location.origin + '/twitter_auth.html';
        const response = await fetch('/api/twitter-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code,
            code_verifier: codeVerifier,
            redirect_uri: redirectUri,
            client_id: cfg.TWITTER_CLIENT_ID
          })
        });
        const result = await response.json();
        if (result.success) {
          // Tell app.js to update state
          if (window.addTwitterAccount) {
            window.addTwitterAccount(result.user);
          }
        } else {
          alert('Failed to authenticate with Twitter: ' + result.error);
        }
      } catch (err) {
        console.error(err);
        alert('Error connecting to Twitter.');
      }
    } else if (event.data.type === 'TWITTER_AUTH_ERROR') {
      alert('Twitter Authentication Failed: ' + event.data.error);
    }
  });

  window.CarapalTwitter = { connect };
})();
