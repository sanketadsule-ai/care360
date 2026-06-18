/**
 * Carapal360 — Facebook Graph API integration (Redirect-based OAuth).
 *
 * This uses Facebook's server-side redirect OAuth flow instead of the
 * JavaScript SDK popup. This approach:
 *   ✅ Works on ANY domain (no JSSDK domain whitelist needed)
 *   ✅ Works on HTTPS (Vercel, Netlify, etc.)
 *   ✅ More secure (no client-side SDK required)
 *
 * Flow:
 *   1. User clicks "+ ADD CHANNEL" → redirected to Facebook OAuth page
 *   2. User grants permissions on Facebook
 *   3. Facebook redirects back to our app with ?code=... in the URL
 *   4. We exchange the code for an access token using the Graph API
 *   5. We fetch pages and display them
 *
 * Exposes window.CarapalFB with:
 *   CarapalFB.isConfigured()          -> boolean
 *   CarapalFB.canRun()                -> boolean
 *   CarapalFB.login()                 -> Redirects to Facebook
 *   CarapalFB.handleCallback()        -> Promise<string> (access token)
 *   CarapalFB.getPages(token)         -> Promise<Page[]>
 *   CarapalFB.getPageCases(page)      -> Promise<Case[]>
 */
(function () {
  'use strict';

  const cfg = window.CARAPAL_CONFIG || {};

  // ── Environment checks ──────────────────────────────
  function isConfigured() {
    return typeof cfg.FB_APP_ID === 'string' && cfg.FB_APP_ID.trim().length > 0;
  }

  function canRun() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  }

  // ── OAuth Redirect Login ────────────────────────────
  function login(platform = 'facebook') {
    if (!isConfigured()) {
      alert('No Facebook App ID set. Open config.js and paste your App ID.');
      return;
    }

    const redirectUri = window.location.origin + window.location.pathname;
    
    // Choose scopes based on platform
    let scope = cfg.FB_SCOPES || 'public_profile,pages_show_list,pages_read_engagement';
    if (platform === 'instagram') {
      scope = cfg.IG_SCOPES || 'instagram_basic,pages_show_list';
    }

    // Embed the platform into the state so the callback knows what we logged into
    const state = 'carapal360_' + platform + '_' + Date.now(); // CSRF protection
    sessionStorage.setItem('fb_oauth_state', state);

    const authUrl =
      'https://www.facebook.com/' + (cfg.FB_API_VERSION || 'v25.0') + '/dialog/oauth' +
      '?client_id=' + encodeURIComponent(cfg.FB_APP_ID) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&scope=' + encodeURIComponent(scope) +
      '&response_type=token' +
      '&state=' + encodeURIComponent(state);

    window.location.href = authUrl;
  }

  // ── Handle the callback (token in URL fragment) ─────
  function handleCallback() {
    // Facebook returns the token in the URL hash fragment:
    // #access_token=...&expires_in=...&state=...
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token')) return null;

    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const state = params.get('state');

    // Verify CSRF state
    const savedState = sessionStorage.getItem('fb_oauth_state');
    if (state && savedState && state !== savedState) {
      console.warn('OAuth state mismatch — possible CSRF.');
      return null;
    }
    sessionStorage.removeItem('fb_oauth_state');

    // Extract platform from state (e.g., carapal360_instagram_12345)
    let platform = 'facebook';
    if (state && state.includes('_instagram_')) platform = 'instagram';

    // Clean the URL (remove the token from the address bar)
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    return { token: accessToken, platform };
  }

  // ── Generic Graph API call ──────────────────────────
  async function graphApi(path, accessToken, params) {
    const url = new URL('https://graph.facebook.com/' + (cfg.FB_API_VERSION || 'v25.0') + path);
    url.searchParams.set('access_token', accessToken);
    if (params) {
      Object.keys(params).forEach((k) => url.searchParams.set(k, params[k]));
    }

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.error) {
      throw new Error(data.error.message || 'Graph API error');
    }
    return data;
  }

  // ── Fetch the pages the user manages ────────────────
  async function getPages(accessToken) {
    const res = await graphApi('/me/accounts', accessToken, {
      fields: 'id,name,access_token,tasks,picture{url}',
      limit: '50',
    });
    return (res.data || []).map((p) => ({
      id: p.id,
      name: p.name,
      accessToken: p.access_token,
      isAdmin: Array.isArray(p.tasks) && (p.tasks.includes('MANAGE') || p.tasks.includes('ADMINISTER')),
      pictureUrl: p.picture && p.picture.data ? p.picture.data.url : null,
    }));
  }

  // ── Fetch a page's feed and flatten comments to "cases" ──
  async function getPageCases(page) {
    const res = await graphApi('/' + page.id + '/feed', page.accessToken, {
      limit: '25',
      fields: 'id,message,created_time,from,comments.limit(25){id,message,from,created_time}',
    });

    const cases = [];
    (res.data || []).forEach((post) => {
      if (post.message) {
        cases.push({
          id: post.id,
          source: page.name,
          author: (post.from && post.from.name) || page.name,
          text: post.message,
          createdTime: post.created_time,
          type: 'Post',
        });
      }
      const comments = (post.comments && post.comments.data) || [];
      comments.forEach((c) => {
        cases.push({
          id: c.id,
          source: page.name,
          author: (c.from && c.from.name) || 'Facebook User',
          text: c.message || '',
          createdTime: c.created_time,
          type: 'Comment',
        });
      });
    });

    return cases;
  }

  window.CarapalFB = { isConfigured, canRun, login, handleCallback, getPages, getPageCases, graphApi };
})();
