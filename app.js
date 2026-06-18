/**
 * Carapal360 — App Controller
 * Page routing, navigation, interactions, and the Facebook → Inbox data flow.
 *
 * Practices:
 *  - State via CSS classes (classList), never by reading rendered style strings.
 *  - Clickable non-buttons are keyboard-accessible (role + tabindex + Enter/Space).
 *  - User-supplied text from Facebook is inserted with textContent (never innerHTML)
 *    to avoid HTML/script injection.
 */

(function () {
  'use strict';

  // ── DOM References ──────────────────────────────────
  const sidebar = document.getElementById('sidebar');
  const allSidebarItems = sidebar.querySelectorAll('.sidebar-item');
  const pages = document.querySelectorAll('.page');
  const tabGroup = document.getElementById('tab-group');
  const actionCards = document.getElementById('action-cards');

  // ── Accessibility helper ────────────────────────────
  function makeActivatable(el, handler) {
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    el.addEventListener('click', handler);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler(e);
      }
    });
  }

  // ── Page Routing ────────────────────────────────────
  function navigateTo(pageId) {
    pages.forEach((p) => p.classList.remove('active'));
    const target = document.getElementById('page-' + pageId);
    if (target) target.classList.add('active');
  }

  function setActiveSidebar(item) {
    allSidebarItems.forEach((i) => i.classList.remove('active'));
    if (item) item.classList.add('active');
  }

  function activateSidebarFor(pageId) {
    const item = sidebar.querySelector('.sidebar-item[data-page="' + pageId + '"]');
    setActiveSidebar(item);
  }

  // Sidebar navigation
  allSidebarItems.forEach((item) => {
    makeActivatable(item, () => {
      setActiveSidebar(item);
      const page = item.getAttribute('data-page');
      if (page) navigateTo(page);
    });
  });

  // ── Tab Switching (Insight / Productivity) ──────────
  if (tabGroup) {
    const tabs = tabGroup.querySelectorAll('.tab-btn');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
      });
    });
  }

  // ── Action Card Selection ───────────────────────────
  if (actionCards) {
    const cards = actionCards.querySelectorAll('.action-card');
    cards.forEach((card) => {
      makeActivatable(card, () => {
        cards.forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });
  }

  // ── Toolbar Tab Switching (Inbox) ───────────────────
  const toolbarTabs = document.querySelectorAll('.toolbar-tab');
  toolbarTabs.forEach((tab) => {
    makeActivatable(tab, () => {
      toolbarTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // ── Case item / checkbox wiring (works for static + dynamic items) ──
  function wireCaseItem(item) {
    makeActivatable(item, () => {
      document.querySelectorAll('.case-item').forEach((c) => c.classList.remove('selected'));
      item.classList.add('selected');
    });
  }

  function wireCheckbox(cb) {
    cb.setAttribute('role', 'checkbox');
    cb.setAttribute('aria-checked', 'false');
    cb.setAttribute('tabindex', '0');
    function toggle(e) {
      e.stopPropagation();
      const checked = cb.classList.toggle('checked');
      cb.setAttribute('aria-checked', String(checked));
    }
    cb.addEventListener('click', toggle);
    cb.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle(e);
      }
    });
  }

  document.querySelectorAll('.case-item').forEach(wireCaseItem);
  document.querySelectorAll('.case-checkbox').forEach(wireCheckbox);

  // ── Pagination Controls ─────────────────────────────
  const paginationInput = document.querySelector('.pagination-input');
  const paginationArrows = document.querySelectorAll('.pagination-arrow');
  let totalPages = 19;

  function clampPage(value) {
    const n = parseInt(value, 10) || 1;
    return Math.max(1, Math.min(totalPages, n));
  }
  if (paginationArrows.length >= 2 && paginationInput) {
    paginationArrows[0].addEventListener('click', () => {
      paginationInput.value = clampPage(parseInt(paginationInput.value, 10) - 1);
    });
    paginationArrows[1].addEventListener('click', () => {
      paginationInput.value = clampPage(parseInt(paginationInput.value, 10) + 1);
    });
    paginationInput.addEventListener('change', () => {
      paginationInput.value = clampPage(paginationInput.value);
    });
  }

  // ── Settings Card Navigation ────────────────────────
  document.querySelectorAll('.settings-card').forEach((card) => {
    makeActivatable(card, () => {
      if (card.getAttribute('data-navigate') === 'channels') {
        navigateTo('channels');
        return;
      }
      card.classList.add('pressed');
      setTimeout(() => card.classList.remove('pressed'), 150);
    });
  });

  // ── Listening Cards ─────────────────────────────────
  document.querySelectorAll('.listening-card').forEach((card) => {
    makeActivatable(card, () => {
      card.classList.add('pressed');
      setTimeout(() => card.classList.remove('pressed'), 200);
    });
  });

  // ══════════════════════════════════════════════════════
  // MANAGE CHANNELS PAGE
  // ══════════════════════════════════════════════════════

  const channelsBackBtn = document.getElementById('channels-back-btn');
  if (channelsBackBtn) {
    channelsBackBtn.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('settings');
      activateSidebarFor('settings');
    });
  }

  // Source card selection
  const sourceCards = document.querySelectorAll('.source-card');
  const channelsPanel = document.getElementById('channels-panel');
  sourceCards.forEach((card) => {
    makeActivatable(card, () => {
      sourceCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      if (channelsPanel) channelsPanel.style.display = '';
    });
  });

  // Channel card selection — Facebook opens its detail panel
  const fbPanel = document.getElementById('fb-pages-panel');
  document.querySelectorAll('.channel-card').forEach((card) => {
    makeActivatable(card, () => {
      if (card.id === 'channel-facebook') {
        showFacebookPanel();
        return;
      }
      card.classList.toggle('selected');
    });
  });

  function showFacebookPanel() {
    if (channelsPanel) channelsPanel.style.display = 'none';
    if (fbPanel) fbPanel.style.display = '';
  }
  function hideFacebookPanel() {
    if (fbPanel) fbPanel.style.display = 'none';
    if (channelsPanel) channelsPanel.style.display = '';
  }

  const fbBackBtn = document.getElementById('fb-back-btn');
  if (fbBackBtn) fbBackBtn.addEventListener('click', hideFacebookPanel);

  // ══════════════════════════════════════════════════════
  // FACEBOOK INTEGRATION (Redirect-based OAuth)
  // ══════════════════════════════════════════════════════

  const fbStatus = document.getElementById('fb-status');
  const fbAddBtn = document.getElementById('fb-add-channel-btn');
  const fbAdminGrid = document.getElementById('fb-pages-admin');
  const fbNonAdminGrid = document.getElementById('fb-pages-non-admin');
  const fbTabs = document.querySelectorAll('.fb-tab');
  const inboxSourceLabel = document.getElementById('inbox-source-label');
  const FB = window.CarapalFB;

  // Store access token for the session
  let fbAccessToken = sessionStorage.getItem('fb_access_token') || null;

  function setStatus(message, kind) {
    if (!fbStatus) return;
    fbStatus.style.display = '';
    fbStatus.className = 'fb-status' + (kind ? ' ' + kind : '');
    fbStatus.textContent = message;
  }
  function clearStatus() {
    if (fbStatus) fbStatus.style.display = 'none';
  }

  // Tab switching (Admin / Non-Admin)
  fbTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      fbTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const showAdmin = tab.getAttribute('data-fbtab') === 'admin';
      if (fbAdminGrid) fbAdminGrid.style.display = showAdmin ? '' : 'none';
      if (fbNonAdminGrid) fbNonAdminGrid.style.display = showAdmin ? 'none' : '';
    });
  });

  // ── Handle Facebook OAuth callback on page load ─────
  if (FB) {
    const token = FB.handleCallback();
    if (token) {
      fbAccessToken = token;
      sessionStorage.setItem('fb_access_token', token);
      // Auto-navigate to the Facebook pages panel and load pages
      navigateTo('channels');
      activateSidebarFor('settings');
      setTimeout(async () => {
        showFacebookPanel();
        setStatus('Loading your pages…', 'loading');
        try {
          const fbPages = await FB.getPages(fbAccessToken);
          renderPages(fbPages);
        } catch (err) {
          setStatus(err.message || 'Could not load pages.', 'error');
        }
      }, 300);
    }
  }

  // Connect button → redirect to Facebook
  if (fbAddBtn) {
    fbAddBtn.addEventListener('click', () => {
      if (!FB) { setStatus('Facebook integration script failed to load.', 'error'); return; }
      if (!FB.isConfigured()) {
        setStatus('No Facebook App ID set. Open config.js and paste your App ID.', 'error');
        return;
      }
      // If we already have a token, just load pages
      if (fbAccessToken) {
        setStatus('Loading your pages…', 'loading');
        FB.getPages(fbAccessToken)
          .then(renderPages)
          .catch((err) => setStatus(err.message || 'Could not load pages.', 'error'));
        return;
      }
      // Otherwise, redirect to Facebook OAuth
      FB.login();
    });
  }

  function renderPages(allPages) {
    if (!allPages || allPages.length === 0) {
      setStatus('No Facebook pages found on this account. Make sure you manage at least one page and granted the requested permissions.', null);
      return;
    }
    clearStatus();
    if (fbAdminGrid) fbAdminGrid.innerHTML = '';
    if (fbNonAdminGrid) fbNonAdminGrid.innerHTML = '';

    let adminCount = 0;
    let nonAdminCount = 0;
    allPages.forEach((page) => {
      const card = buildPageCard(page);
      if (page.isAdmin) { fbAdminGrid.appendChild(card); adminCount++; }
      else { fbNonAdminGrid.appendChild(card); nonAdminCount++; }
    });

    if (adminCount === 0 && fbAdminGrid) {
      fbAdminGrid.innerHTML = '<div class="fb-status">No admin pages.</div>';
    }
    if (nonAdminCount === 0 && fbNonAdminGrid) {
      fbNonAdminGrid.innerHTML = '<div class="fb-status">No non-admin pages.</div>';
    }
  }

  function buildPageCard(page) {
    const card = document.createElement('div');
    card.className = 'fb-page-card';

    const avatar = document.createElement('img');
    avatar.className = 'fb-page-avatar';
    avatar.alt = '';
    if (page.pictureUrl) avatar.src = page.pictureUrl;

    const info = document.createElement('div');
    info.className = 'fb-page-info';

    const name = document.createElement('div');
    name.className = 'fb-page-name';
    name.textContent = page.name;

    const handle = document.createElement('div');
    handle.className = 'fb-page-handle';
    handle.textContent = '@' + page.name.replace(/\s+/g, '');

    const status = document.createElement('div');
    status.className = 'fb-page-status';
    status.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20,6 9,17 4,12"/></svg>';
    status.appendChild(document.createTextNode('Connected'));

    const view = document.createElement('div');
    view.className = 'fb-view-msgs';
    view.textContent = 'View messages →';

    info.appendChild(name);
    info.appendChild(handle);
    info.appendChild(status);
    info.appendChild(view);
    card.appendChild(avatar);
    card.appendChild(info);

    makeActivatable(card, () => loadPageIntoInbox(page, card));
    return card;
  }

  async function loadPageIntoInbox(page, card) {
    const view = card.querySelector('.fb-view-msgs');
    const original = view ? view.textContent : '';
    try {
      if (view) view.textContent = 'Loading…';
      const cases = await FB.getPageCases(page);
      renderCases(cases, page.name);
      navigateTo('inbox');
      activateSidebarFor('inbox');
    } catch (err) {
      setStatus(err.message || 'Could not load messages for this page.', 'error');
    } finally {
      if (view) view.textContent = original;
    }
  }

  // ── Render fetched cases into the inbox list ─────────
  const AVATAR_GRADIENTS = [
    'linear-gradient(135deg, #6366f1, #8b5cf6)',
    'linear-gradient(135deg, #f97316, #ef4444)',
    'linear-gradient(135deg, #06b6d4, #3b82f6)',
    'linear-gradient(135deg, #ec4899, #f43f5e)',
    'linear-gradient(135deg, #10b981, #059669)',
  ];

  function initials(name) {
    return name.split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
  }

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true,
      weekday: 'short', month: 'short', day: 'numeric',
    });
  }

  const FB_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>';

  function renderCases(cases, sourceName) {
    const list = document.getElementById('case-list');
    if (!list) return;
    list.innerHTML = '';

    if (!cases || cases.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'fb-status';
      empty.textContent = 'No posts or comments found for this page yet.';
      list.appendChild(empty);
    } else {
      cases.forEach((c, idx) => list.appendChild(buildCaseItem(c, idx)));
    }

    if (inboxSourceLabel && sourceName) inboxSourceLabel.textContent = sourceName;

    // Update pagination footer to reflect the new count.
    totalPages = Math.max(1, Math.ceil((cases ? cases.length : 0) / 25));
    if (paginationInput) paginationInput.value = 1;
    const navSpans = document.querySelectorAll('.pagination-nav span');
    navSpans.forEach((s) => {
      if (/^of\b/.test(s.textContent.trim())) s.textContent = 'of ' + totalPages;
    });
  }

  function buildCaseItem(c, idx) {
    const item = document.createElement('div');
    item.className = 'case-item';

    const avatar = document.createElement('div');
    avatar.className = 'case-avatar';
    avatar.style.background = AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length];
    avatar.textContent = initials(c.author);

    const content = document.createElement('div');
    content.className = 'case-content';

    const sourceLabel = document.createElement('div');
    sourceLabel.className = 'case-source-label';
    sourceLabel.textContent = c.source || '';

    const author = document.createElement('div');
    author.className = 'case-author';
    author.innerHTML = FB_ICON;
    author.appendChild(document.createTextNode(' ' + c.author));

    const text = document.createElement('div');
    text.className = 'case-text';
    text.textContent = c.text;

    const meta = document.createElement('div');
    meta.className = 'case-meta';
    const actions = document.createElement('div');
    actions.className = 'case-actions';
    const ts = document.createElement('div');
    ts.className = 'case-timestamp';
    ts.textContent = formatTime(c.createdTime) + ' | ' + (c.type || 'Comment');
    meta.appendChild(actions);
    meta.appendChild(ts);

    content.appendChild(sourceLabel);
    content.appendChild(author);
    content.appendChild(text);
    content.appendChild(meta);

    const cb = document.createElement('div');
    cb.className = 'case-checkbox';

    item.appendChild(avatar);
    item.appendChild(content);
    item.appendChild(cb);

    wireCaseItem(item);
    wireCheckbox(cb);
    return item;
  }

})();
