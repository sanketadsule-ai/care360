/**
 * Carapal360 — Facebook Graph API integration (client-side, JS SDK).
 *
 * Exposes window.CarapalFB with promise-based helpers:
 *   CarapalFB.isConfigured()          -> boolean (App ID present?)
 *   CarapalFB.canRun()                -> boolean (served over http/https, not file://)
 *   CarapalFB.login()                 -> Promise<authResponse>
 *   CarapalFB.getPages()              -> Promise<Page[]>
 *   CarapalFB.getPageCases(page)      -> Promise<Case[]>  (comments flattened from feed)
 *
 * No App Secret is used (and none should ever be put in client code).
 */
(function () {
  'use strict';

  const cfg = window.CARAPAL_CONFIG || {};
  let sdkReady = null; // memoised Promise

  // ── Environment checks ──────────────────────────────
  function isConfigured() {
    return typeof cfg.FB_APP_ID === 'string' && cfg.FB_APP_ID.trim().length > 0;
  }

  function canRun() {
    // Facebook Login does not work from the file:// protocol.
    return location.protocol === 'http:' || location.protocol === 'https:';
  }

  // ── SDK loader ──────────────────────────────────────
  function loadSdk() {
    if (sdkReady) return sdkReady;

    sdkReady = new Promise((resolve, reject) => {
      if (!isConfigured()) {
        reject(new Error('Facebook App ID is not set. Add it in config.js.'));
        return;
      }
      if (!canRun()) {
        reject(new Error('Open this app over http://localhost — Facebook Login does not work from a file:// page.'));
        return;
      }

      window.fbAsyncInit = function () {
        window.FB.init({
          appId: cfg.FB_APP_ID,
          cookie: true,
          xfbml: false,
          version: cfg.FB_API_VERSION || 'v21.0',
        });
        resolve(window.FB);
      };

      // Inject the SDK script once.
      if (document.getElementById('facebook-jssdk')) return;
      const js = document.createElement('script');
      js.id = 'facebook-jssdk';
      js.src = 'https://connect.facebook.net/en_US/sdk.js';
      js.async = true;
      js.defer = true;
      js.onerror = () => reject(new Error('Failed to load the Facebook SDK (check your internet connection).'));
      document.head.appendChild(js);
    });

    return sdkReady;
  }

  // ── Login ───────────────────────────────────────────
  async function login() {
    const FB = await loadSdk();
    return new Promise((resolve, reject) => {
      FB.login((response) => {
        if (response.status === 'connected' && response.authResponse) {
          resolve(response.authResponse);
        } else {
          reject(new Error('Facebook login was cancelled or not authorized.'));
        }
      }, { scope: cfg.FB_SCOPES });
    });
  }

  // ── Generic Graph API call ──────────────────────────
  async function api(path, params) {
    const FB = await loadSdk();
    return new Promise((resolve, reject) => {
      FB.api(path, params || {}, (response) => {
        if (!response || response.error) {
          reject(new Error(response && response.error ? response.error.message : 'Unknown Graph API error.'));
        } else {
          resolve(response);
        }
      });
    });
  }

  // ── Fetch the pages the user manages ────────────────
  async function getPages() {
    const res = await api('/me/accounts', {
      fields: 'id,name,access_token,tasks,picture{url}',
      limit: 50,
    });
    return (res.data || []).map((p) => ({
      id: p.id,
      name: p.name,
      accessToken: p.access_token,
      // "ADMINISTER"/"MANAGE" task means full admin; otherwise treat as non-admin.
      isAdmin: Array.isArray(p.tasks) && (p.tasks.includes('MANAGE') || p.tasks.includes('ADMINISTER')),
      pictureUrl: p.picture && p.picture.data ? p.picture.data.url : null,
    }));
  }

  // ── Fetch a page's feed and flatten comments to "cases" ──
  async function getPageCases(page) {
    const res = await api('/' + page.id + '/feed', {
      access_token: page.accessToken,
      limit: 25,
      fields: 'id,message,created_time,from,comments.limit(25){id,message,from,created_time}',
    });

    const cases = [];
    (res.data || []).forEach((post) => {
      // The post itself becomes a case (type "Post").
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
      // Each comment becomes a case (type "Comment").
      const comments = (post.comments && post.comments.data) || [];
      comments.forEach((c) => {
        cases.push({
          id: c.id,
          source: page.name,
          // `from` is often null for non-admin commenters without App Review.
          author: (c.from && c.from.name) || 'Facebook User',
          text: c.message || '',
          createdTime: c.created_time,
          type: 'Comment',
        });
      });
    });

    return cases;
  }

  window.CarapalFB = { isConfigured, canRun, login, getPages, getPageCases, api };
})();
