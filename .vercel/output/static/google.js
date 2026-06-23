/**
 * Carapal360 — Google Play Store Integration (OAuth 2.0).
 *
 * Flow:
 *   1. User clicks "+ ADD PLAY STORE"
 *   2. Redirected to Google OAuth consent screen
 *   3. Redirects back with ?access_token=... in the URL fragment
 *   4. We send this to the backend
 */
(function () {
  'use strict';

  const cfg = window.CARAPAL_CONFIG || {};

  function isConfigured() {
    return typeof cfg.GOOGLE_CLIENT_ID === 'string' && cfg.GOOGLE_CLIENT_ID.includes('apps.googleusercontent.com');
  }

  function login() {
    if (!isConfigured()) {
      alert('No Google Client ID set. Open config.js and follow the instructions to set GOOGLE_CLIENT_ID.');
      return;
    }

    const redirectUri = cfg.GOOGLE_REDIRECT_URI || window.location.origin + '/';
    const scope = cfg.GOOGLE_SCOPES || 'https://www.googleapis.com/auth/androidpublisher';
    const state = 'carapal360_google_play_' + Date.now();
    sessionStorage.setItem('google_oauth_state', state);

    const authUrl =
      'https://accounts.google.com/o/oauth2/v2/auth' +
      '?client_id=' + encodeURIComponent(cfg.GOOGLE_CLIENT_ID) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&response_type=token' +
      '&scope=' + encodeURIComponent(scope) +
      '&state=' + encodeURIComponent(state) +
      '&prompt=consent' +
      '&include_granted_scopes=true';

    window.location.href = authUrl;
  }

  function handleCallback() {
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token')) return null;

    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const state = params.get('state');

    // Make sure this is actually a Google redirect (state starts with our prefix)
    if (!state || !state.startsWith('carapal360_google_play_')) return null;

    const savedState = sessionStorage.getItem('google_oauth_state');
    if (state !== savedState) {
      console.warn('Google OAuth state mismatch — possible CSRF.');
      return null;
    }
    sessionStorage.removeItem('google_oauth_state');

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    return accessToken;
  }

  window.CarapalGoogle = { isConfigured, login, handleCallback };
})();
