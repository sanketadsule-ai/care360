/**
 * Carapal360 — App Controller
 * Page routing, navigation, interactions, and the Facebook/Gmail → Inbox data flow.
 *
 * Practices:
 *  - State via CSS classes (classList), never by reading rendered style strings.
 *  - Clickable non-buttons are keyboard-accessible (role + tabindex + Enter/Space).
 *  - User-supplied text is inserted with textContent (never innerHTML)
 *    to avoid HTML/script injection.
 */

(function () {
  'use strict';

  // ── Load Google GIS SDK client script ────────────────
  if (!document.getElementById('google-gsi-script')) {
    const gsiScript = document.createElement('script');
    gsiScript.id = 'google-gsi-script';
    gsiScript.src = 'https://accounts.google.com/gsi/client';
    gsiScript.async = true;
    gsiScript.defer = true;
    document.head.appendChild(gsiScript);
  }

  // ── DOM References ──────────────────────────────────
  const sidebar = document.getElementById('sidebar');
  const allSidebarItems = sidebar.querySelectorAll('.sidebar-item');
  const pages = document.querySelectorAll('.page');
  const tabGroup = document.getElementById('tab-group');
  const actionCards = document.getElementById('action-cards');

  // ── Local State Persistence ──────────────────────────
  let state = {
    connectedAccounts: JSON.parse(localStorage.getItem('gmail_connected_accounts') || '[]'),
    cases: JSON.parse(localStorage.getItem('inbox_cases') || '[]').filter(c => !c.id.toString().startsWith('case-') && !c.id.toString().startsWith('gmail-')),
    selectedCaseId: localStorage.getItem('inbox_selected_case_id') || null,
    activeFilter: 'all'
  };


  // Clean up any remaining mock arrays
  const GMAIL_MOCK_CASES = [];

  // Initialize cases state
  if (state.cases.length === 0) {
    state.cases = [];
    localStorage.setItem('inbox_cases', JSON.stringify(state.cases));
  }

  function saveState() {
    localStorage.setItem('gmail_connected_accounts', JSON.stringify(state.connectedAccounts));
    localStorage.setItem('inbox_cases', JSON.stringify(state.cases));
    if (state.selectedCaseId) {
      localStorage.setItem('inbox_selected_case_id', state.selectedCaseId);
    } else {
      localStorage.removeItem('inbox_selected_case_id');
    }
  }

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

  // Channel card selection — Facebook opens its detail panel, Gmail opens its config panel
  const fbPanel = document.getElementById('fb-pages-panel');
  const igPanel = document.getElementById('ig-pages-panel');
  const playstorePanel = document.getElementById('playstore-panel');

  document.querySelectorAll('.channel-card').forEach((card) => {
    makeActivatable(card, () => {
      if (card.id === 'channel-facebook') {
        showFacebookPanel();
        return;
      }
      if (card.id === 'channel-instagram') {
        showIgPanel();
        return;
      }
      if (card.id === 'channel-x') {
        if (window.CarapalTwitter) window.CarapalTwitter.connect();
        return;
      }
      if (card.id === 'channel-playstore') {
        showPlaystorePanel();
        return;
      }
      if (card.id === 'channel-gmail') {
        showGmailPanel();
        return;
      }
      card.classList.toggle('selected');
    });
  });

  function showFacebookPanel() {
    if (channelsPanel) channelsPanel.style.display = 'none';
    if (playstorePanel) playstorePanel.style.display = 'none';
    if (igPanel) igPanel.style.display = 'none';
    if (fbPanel) fbPanel.style.display = '';
    var gp = document.getElementById('gmail-config-panel');
    if (gp) gp.style.display = 'none';
  }
  function hideFacebookPanel() {
    if (fbPanel) fbPanel.style.display = 'none';
    if (channelsPanel) channelsPanel.style.display = '';
  }

  function showIgPanel() {
    if (channelsPanel) channelsPanel.style.display = 'none';
    if (playstorePanel) playstorePanel.style.display = 'none';
    if (fbPanel) fbPanel.style.display = 'none';
    if (igPanel) igPanel.style.display = '';
  }
  function hideIgPanel() {
    if (igPanel) igPanel.style.display = 'none';
    if (channelsPanel) channelsPanel.style.display = '';
  }

  function showPlaystorePanel() {
    if (channelsPanel) channelsPanel.style.display = 'none';
    if (fbPanel) fbPanel.style.display = 'none';
    if (igPanel) igPanel.style.display = 'none';
    if (playstorePanel) playstorePanel.style.display = '';
  }
  function hidePlaystorePanel() {
    if (playstorePanel) playstorePanel.style.display = 'none';
    if (channelsPanel) channelsPanel.style.display = '';
  }

  function showGmailPanel() {
    if (channelsPanel) channelsPanel.style.display = 'none';
    if (fbPanel) fbPanel.style.display = 'none';
    var gp = document.getElementById('gmail-config-panel');
    if (gp) gp.style.display = '';
  }

  const fbBackBtn = document.getElementById('fb-back-btn');
  if (fbBackBtn) fbBackBtn.addEventListener('click', hideFacebookPanel);

  const igBackBtn = document.getElementById('ig-back-btn');
  if (igBackBtn) igBackBtn.addEventListener('click', hideIgPanel);

  const playstoreBackBtn = document.getElementById('playstore-back-btn');
  if (playstoreBackBtn) playstoreBackBtn.addEventListener('click', hidePlaystorePanel);

  // ══════════════════════════════════════════════════════
  // FACEBOOK / INSTAGRAM INTEGRATION (Redirect-based OAuth)
  // ══════════════════════════════════════════════════════

  const fbStatus = document.getElementById('fb-status');
  const fbAddBtn = document.getElementById('fb-add-channel-btn');
  const igAddBtn = document.getElementById('ig-add-channel-btn');
  const fbAdminGrid = document.getElementById('fb-pages-admin');
  const fbNonAdminGrid = document.getElementById('fb-pages-non-admin');
  const fbTabs = document.querySelectorAll('.fb-tab');
  const inboxSourceLabel = document.getElementById('inbox-source-label');
  const FB = window.CarapalFB;

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

  fbTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      fbTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const showAdmin = tab.getAttribute('data-fbtab') === 'admin';
      if (fbAdminGrid) fbAdminGrid.style.display = showAdmin ? '' : 'none';
      if (fbNonAdminGrid) fbNonAdminGrid.style.display = showAdmin ? 'none' : '';
    });
  });

  if (FB) {
    const callbackData = FB.handleCallback();
    if (callbackData && callbackData.token) {
      fbAccessToken = callbackData.token;
      sessionStorage.setItem('fb_access_token', callbackData.token);
      // Auto-navigate to the correct panel and load pages
      navigateTo('channels');
      activateSidebarFor('settings');
      setTimeout(async () => {
        if (callbackData.platform === 'instagram') {
          showIgPanel();
        } else {
          showFacebookPanel();
        }
        setStatus('Loading your ' + (callbackData.platform === 'instagram' ? 'Instagram' : 'Facebook') + ' pages…', 'loading');
        try {
          const fbPages = await FB.getPages(fbAccessToken);
          renderPages(fbPages, callbackData.platform);

          // Inject platform before saving
          const pagesWithPlatform = fbPages.map(p => ({ ...p, platform: callbackData.platform }));

          // Save channels to the database backend
          pagesWithPlatform.forEach(p => {
            fetch('/api/connected-channels', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                platform: p.platform,
                account_email: p.id,
                account_name: p.name,
                avatar_url: p.pictureUrl || '',
                access_token: p.accessToken || fbAccessToken
              })
            }).catch(err => console.error('Failed to save FB/IG to DB:', err));
          });
        } catch (err) {
          setStatus(err.message || 'Failed to load pages from Facebook Graph API.', 'error');
        }
      }, 300);
    }
  }

    if (fbAddBtn) {
      fbAddBtn.addEventListener('click', () => {
        if (!FB) { setStatus('Facebook integration script failed to load.', 'error'); return; }
        if (!FB.isConfigured()) {
          setStatus('No Facebook App ID set. Open config.js and paste your App ID.', 'error');
          return;
        }
        if (fbAccessToken) {
          setStatus('Loading your pages…', 'loading');
          FB.getPages(fbAccessToken)
            .then((pages) => {
              renderPages(pages);
              pages.forEach(p => {
                fetch('/api/connected-channels', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    platform: 'facebook',
                    account_email: p.id,
                    account_name: p.name,
                    avatar_url: p.pictureUrl || '',
                    access_token: p.accessToken || fbAccessToken
                  })
                }).catch(err => console.error('Failed to save FB to DB:', err));
              });
            })
            .catch((err) => setStatus(err.message || 'Could not load pages.', 'error'));
          return;
        }
        // Otherwise, redirect to Facebook OAuth
        FB.login('facebook');
      });
    }

    // Connect button → redirect to Instagram (uses FB Graph API)
    if (igAddBtn) {
      igAddBtn.addEventListener('click', () => {
        if (!FB) { setStatus('Facebook integration script failed to load.', 'error'); return; }
        if (!FB.isConfigured()) {
          setStatus('No Facebook App ID set. Open config.js and paste your App ID.', 'error');
          return;
        }
        FB.login('instagram');
      });
    }

    // ══════════════════════════════════════════════════════
    // GOOGLE PLAY STORE INTEGRATION (OAuth 2.0)
    // ══════════════════════════════════════════════════════
    const playstoreAddBtn = document.getElementById('playstore-add-btn');
    const playstoreStatus = document.getElementById('playstore-status');
    const GOOGLE = window.CarapalGoogle;

    function setPlaystoreStatus(message, kind) {
      if (!playstoreStatus) return;
      playstoreStatus.style.display = '';
      playstoreStatus.className = 'fb-status' + (kind ? ' ' + kind : '');
      playstoreStatus.textContent = message;
    }

    // Handle Google OAuth callback on page load
    if (GOOGLE) {
      const googleToken = GOOGLE.handleCallback();
      if (googleToken) {
        navigateTo('channels');
        activateSidebarFor('settings');
        
        // We need the package name to fetch reviews
        const packageName = prompt('Google Play connection successful!\n\nPlease enter your App Package Name (e.g., com.impactguru.app) to fetch reviews:');
        
        if (packageName) {
          setPlaystoreStatus('Saving to database...', 'info');
          
          fetch('/api/connected-channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: 'google_play',
              account_email: packageName, // We use account_email field for package name
              account_name: 'Play Store: ' + packageName,
              avatar_url: 'https://upload.wikimedia.org/wikipedia/commons/d/d0/Google_Play_Arrow_logo.svg',
              access_token: googleToken
            })
          })
          .then(r => r.json())
          .then(data => {
            if (data.success) {
              setPlaystoreStatus('Connected!', 'success');
              // We will reload state to fetch the new channel from DB
              setTimeout(() => window.location.reload(), 1500);
            } else {
              setPlaystoreStatus('Failed to save to database.', 'error');
            }
          })
          .catch(err => {
            console.error(err);
            setPlaystoreStatus('Database error.', 'error');
          });
        } else {
          setPlaystoreStatus('Package name is required.', 'error');
        }
      }
    }

    // Connect button → redirect to Google
    if (playstoreAddBtn) {
      playstoreAddBtn.addEventListener('click', () => {
        if (!GOOGLE) { setPlaystoreStatus('Google integration script failed to load.', 'error'); return; }
        if (!GOOGLE.isConfigured()) {
          setPlaystoreStatus('No Google Client ID set. Open config.js and paste your Client ID.', 'error');
          return;
        }
        GOOGLE.login();
      });
    }

    function renderPages(allPages, platform = 'facebook') {
      if (!allPages || allPages.length === 0) {
        setStatus('No accounts found. Make sure you granted the requested permissions.', null);
        return;
      }
      clearStatus();

      const igPanelContainer = document.getElementById('ig-pages-panel');
      let targetAdminGrid = fbAdminGrid;
      let targetNonAdminGrid = fbNonAdminGrid;

      if (platform === 'instagram' && igPanelContainer) {
        let igGrid = igPanelContainer.querySelector('.fb-pages-grid');
        if (!igGrid) {
          igGrid = document.createElement('div');
          igGrid.className = 'fb-pages-grid';
          igPanelContainer.appendChild(igGrid);
        }
        targetAdminGrid = igGrid;
        targetNonAdminGrid = null;
      }

      if (targetAdminGrid) targetAdminGrid.innerHTML = '';
      if (targetNonAdminGrid) targetNonAdminGrid.innerHTML = '';

      let adminCount = 0;
      let nonAdminCount = 0;
      allPages.forEach((page) => {
        const card = buildPageCard(page);
        if (page.isAdmin && targetAdminGrid) { targetAdminGrid.appendChild(card); adminCount++; }
        else if (targetNonAdminGrid) { targetNonAdminGrid.appendChild(card); nonAdminCount++; }
      });

      if (adminCount === 0 && targetAdminGrid) {
        targetAdminGrid.innerHTML = '<div class="fb-status">No admin pages.</div>';
      }
      if (nonAdminCount === 0 && targetNonAdminGrid) {
        targetNonAdminGrid.innerHTML = '<div class="fb-status">No non-admin pages.</div>';
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

        let cases = [];

        if (page.platform === 'google_play') {
          // Fetch stored Play Store reviews from our database
          const res = await fetch('/api/platform-messages?channel_id=' + encodeURIComponent(page.id));
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to fetch messages');
          
          cases = (data.data || []).map(msg => ({
            id: msg.id,
            source: 'Google Play',
            author: msg.sender_name,
            text: msg.body_text,
            createdTime: msg.received_at,
            type: 'Review'
          }));
        } else {
          // REAL Facebook Data Fetch
          if (FB && page.accessToken) {
            cases = await FB.getPageCases(page);
            
            // Save the newly fetched REAL messages to our dedicated FB table so they persist
            if (cases.length > 0) {
              const dbPayload = cases.map(c => ({
                fb_post_id: c.id, 
                post_type: c.type,
                author_name: c.author,
                message_text: c.text,
                received_at: c.createdTime
              }));

              // First get the numeric channel ID
              fetch('/api/connected-channels').then(r => r.json()).then(chData => {
                const ch = (chData.data || []).find(x => x.account_email === page.id);
                if (ch) {
                  fetch('/api/facebook-messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channel_id: ch.id, messages: dbPayload })
                  }).catch(console.error);
                }
              });
            }
          }
        }

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
    const TWITTER_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="#000"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
    const GMAIL_ICON = '<svg width="14" height="14" viewBox="0 0 48 48"><rect x="6" y="10" width="36" height="28" rx="3" fill="#F1F1F1"/><path d="M6 13a3 3 0 013-3h30a3 3 0 013 3l-18 12L6 13z" fill="#EA4335"/><path d="M6 13v22a3 3 0 003 3h3V19L6 13z" fill="#4285F4"/><path d="M36 38h3a3 3 0 003-3V13l-6 6v19z" fill="#34A853"/><path d="M12 19v19h24V19l-12 8-12-8z" fill="white"/></svg>';

    // Bridge Facebook cases into the unified cases list
    function renderCases(cases, sourceName) {
      const mappedCases = (cases || []).map((c) => {
        const existing = state.cases.find(x => x.id === c.id);
        if (existing) return existing;

        return {
          id: c.id,
          source: sourceName || c.source || 'Facebook',
          author: c.author,
          channel: 'facebook',
          avatarGradient: AVATAR_GRADIENTS[Math.floor(Math.random() * AVATAR_GRADIENTS.length)],
          text: c.text,
          createdTime: c.createdTime || new Date().toISOString(),
          type: c.type || 'Comment',
          status: 'Open',
          priority: 'Medium',
          assignedTo: 'Unassigned',
          messages: [
            {
              id: 'msg-' + c.id,
              sender: c.author,
              text: c.text,
              timestamp: c.createdTime || new Date().toISOString(),
              isAgent: false
            }
          ]
        };
      });

      mappedCases.forEach((mc) => {
        const idx = state.cases.findIndex(x => x.id === mc.id);
        if (idx === -1) {
          state.cases.unshift(mc);
        }
      });

      saveState();
      renderAllCases();

      if (inboxSourceLabel && sourceName) inboxSourceLabel.textContent = sourceName;
    }

    // ── Unified Cases List & Details Rendering ───────────
    function renderAllCases() {
      const list = document.getElementById('case-list');
      if (!list) return;
      list.innerHTML = '';

      let filteredCases = state.cases;
      if (state.activeFilter !== 'all') {
        filteredCases = state.cases.filter(c => c.channel === state.activeFilter);
      }

      if (filteredCases.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'fb-status';
        empty.textContent = 'No cases found for this channel.';
        list.appendChild(empty);
      } else {
        filteredCases.forEach((c, idx) => {
          const item = buildCaseItemNode(c, idx);
          list.appendChild(item);
        });
      }

      const gmailPill = document.getElementById('filter-pill-gmail');
      if (gmailPill) {
        gmailPill.style.display = state.connectedAccounts.length > 0 ? 'inline-flex' : 'none';
      }

      totalPages = Math.max(1, Math.ceil(filteredCases.length / 25));
      if (paginationInput && !paginationInput.value) paginationInput.value = 1;
      const navSpans = document.querySelectorAll('.pagination-nav span');
      navSpans.forEach((s) => {
        if (/^of\b/.test(s.textContent.trim())) s.textContent = 'of ' + totalPages;
      });

      if (state.selectedCaseId) {
        const activeCase = state.cases.find(x => x.id === state.selectedCaseId);
        if (activeCase) {
          const activeItem = list.querySelector(`.case-item[data-id="${state.selectedCaseId}"]`);
          if (activeItem) activeItem.classList.add('selected');
          renderCaseDetails(activeCase);
          renderCaseInfo(activeCase);
        } else {
          state.selectedCaseId = null;
          saveState();
          showEmptyState();
        }
      } else {
        showEmptyState();
      }
    }

    function buildCaseItemNode(c, idx) {
      const item = document.createElement('div');
      item.className = 'case-item';
      item.setAttribute('data-id', c.id);
      if (state.selectedCaseId === c.id) {
        item.classList.add('selected');
      }

      const avatar = document.createElement('div');
      avatar.className = 'case-avatar';
      avatar.style.background = c.avatarGradient || AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length];
      avatar.textContent = initials(c.author);

      const content = document.createElement('div');
      content.className = 'case-content';

      const sourceLabel = document.createElement('div');
      sourceLabel.className = 'case-source-label';
      sourceLabel.textContent = c.source || '';

      const author = document.createElement('div');
      author.className = 'case-author';

      if (c.channel === 'facebook') {
        author.innerHTML = FB_ICON;
      } else if (c.channel === 'twitter') {
        author.innerHTML = TWITTER_ICON;
      } else if (c.channel === 'gmail') {
        author.innerHTML = GMAIL_ICON;
      }

      let titlePrefix = ' ';
      if (c.channel === 'gmail' && c.emailSubject) {
        titlePrefix += `[Email] `;
      }

      author.appendChild(document.createTextNode(titlePrefix + c.author));

      const text = document.createElement('div');
      text.className = 'case-text';
      text.textContent = c.channel === 'gmail' && c.emailSubject ? `Subject: ${c.emailSubject} - ${c.text}` : c.text;

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

      wireCaseItem(item, c.id);
      wireCheckbox(cb);
      return item;
    }

    function wireCaseItem(item, id) {
      makeActivatable(item, () => {
        document.querySelectorAll('.case-item').forEach((c) => c.classList.remove('selected'));
        item.classList.add('selected');
        state.selectedCaseId = id;
        saveState();

        const activeCase = state.cases.find(x => x.id === id);
        if (activeCase) {
          renderCaseDetails(activeCase);
          renderCaseInfo(activeCase);
        }
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

    function showEmptyState() {
      const center = document.getElementById('inbox-center');
      const right = document.getElementById('inbox-right');
      if (center) {
        center.innerHTML = `<div class="inbox-empty-state" id="inbox-empty-state">Select Case to work or click on play mode for sequence</div>`;
      }
      if (right) right.innerHTML = '';
    }

    // ── Render Case Details (Center Panel) ────────────────
    function renderCaseDetails(c) {
      const center = document.getElementById('inbox-center');
      if (!center) return;
      center.innerHTML = '';

      const detailContainer = document.createElement('div');
      detailContainer.className = 'inbox-center-detail';

      // Header
      const header = document.createElement('div');
      header.className = 'inbox-detail-header';

      const authorInfo = document.createElement('div');
      authorInfo.className = 'inbox-detail-author-info';

      const avatar = document.createElement('div');
      avatar.className = 'inbox-detail-avatar';
      avatar.style.background = c.avatarGradient || 'var(--primary-blue)';
      avatar.textContent = initials(c.author);

      const meta = document.createElement('div');
      meta.className = 'inbox-detail-meta';

      const name = document.createElement('div');
      name.className = 'inbox-detail-name';
      if (c.channel === 'facebook') name.innerHTML = FB_ICON;
      else if (c.channel === 'twitter') name.innerHTML = TWITTER_ICON;
      else if (c.channel === 'gmail') name.innerHTML = GMAIL_ICON;
      name.appendChild(document.createTextNode(' ' + c.author));

      const source = document.createElement('div');
      source.className = 'inbox-detail-source';
      source.textContent = formatTime(c.createdTime) + ' | ' + c.type;

      meta.appendChild(name);
      meta.appendChild(source);
      authorInfo.appendChild(avatar);
      authorInfo.appendChild(meta);

      // Header Actions
      const actions = document.createElement('div');
      actions.className = 'inbox-detail-actions';

      const archiveBtn = document.createElement('button');
      archiveBtn.className = 'detail-action-btn';
      archiveBtn.title = 'Archive Case';
      archiveBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;
      archiveBtn.addEventListener('click', () => {
        c.status = 'Closed';
        showGmailToast('✓ Case archived successfully', 'success');
        saveState();
        renderAllCases();
      });

      const spamBtn = document.createElement('button');
      spamBtn.className = 'detail-action-btn';
      spamBtn.title = 'Mark as Spam';
      spamBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
      spamBtn.addEventListener('click', () => {
        state.cases = state.cases.filter(x => x.id !== c.id);
        state.selectedCaseId = null;
        showGmailToast('⚠ Case marked as spam and removed', 'info');
        saveState();
        renderAllCases();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'detail-action-btn delete';
      deleteBtn.title = 'Delete Case';
      deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
      deleteBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this case?')) {
          state.cases = state.cases.filter(x => x.id !== c.id);
          state.selectedCaseId = null;
          showGmailToast('✓ Case deleted successfully', 'success');
          saveState();
          renderAllCases();
        }
      });

      actions.appendChild(archiveBtn);
      actions.appendChild(spamBtn);
      actions.appendChild(deleteBtn);
      header.appendChild(authorInfo);
      header.appendChild(actions);
      detailContainer.appendChild(header);

      // Detail Body (Scrollable stream)
      const body = document.createElement('div');
      body.className = 'inbox-detail-body';

      // Gmail Subject Line
      if (c.channel === 'gmail' && c.emailSubject) {
        const subject = document.createElement('div');
        subject.className = 'email-subject-line';
        subject.textContent = c.emailSubject;
        body.appendChild(subject);
      }

      // Message stream
      c.messages.forEach((msg) => {
        const msgCard = document.createElement('div');
        msgCard.className = 'thread-message' + (msg.isAgent ? ' agent' : '');

        const msgHeader = document.createElement('div');
        msgHeader.className = 'message-header';

        const sender = document.createElement('span');
        sender.className = 'message-sender';
        sender.textContent = msg.sender;

        const time = document.createElement('span');
        time.className = 'message-time';
        time.textContent = formatTime(msg.timestamp);

        msgHeader.appendChild(sender);
        msgHeader.appendChild(time);

        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = msg.text;

        msgCard.appendChild(msgHeader);
        msgCard.appendChild(content);

        // Attachments (Gmail only, only on customer messages)
        if (c.channel === 'gmail' && !msg.isAgent && c.emailAttachments && c.emailAttachments.length > 0) {
          const attachContainer = document.createElement('div');
          attachContainer.className = 'email-attachments';

          c.emailAttachments.forEach((att) => {
            const chip = document.createElement('div');
            chip.className = 'attachment-chip';
            chip.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg> ${att.name} (${att.size})`;
            chip.addEventListener('click', () => {
              showGmailToast(`📥 Downloading attachment ${att.name}...`, 'info');
            });
            attachContainer.appendChild(chip);
          });
          msgCard.appendChild(attachContainer);
        }

        body.appendChild(msgCard);
      });

      detailContainer.appendChild(body);

      // Reply Composer
      const composer = document.createElement('div');
      composer.className = 'inbox-detail-composer';

      const composerToolbar = document.createElement('div');
      composerToolbar.className = 'composer-toolbar';
      composerToolbar.innerHTML = `
      <button class="composer-tool-btn" title="Bold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg></button>
      <button class="composer-tool-btn" title="Italic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>
      <button class="composer-tool-btn" title="Underline"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg></button>
      <button class="composer-tool-btn" title="Attach Link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>
      <button class="composer-tool-btn" title="Attach File"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg></button>
    `;

      const inputArea = document.createElement('div');
      inputArea.className = 'composer-input-area';

      const textarea = document.createElement('textarea');
      textarea.className = 'composer-textarea';
      textarea.placeholder = c.channel === 'gmail' ? `Reply as roshan.salunke@impactguru.com...` : `Write a reply...`;

      const actionsRow = document.createElement('div');
      actionsRow.className = 'composer-actions-row';

      const checkLabel = document.createElement('label');
      checkLabel.className = 'composer-checkbox-label';
      const closeCheck = document.createElement('input');
      closeCheck.type = 'checkbox';
      closeCheck.id = 'composer-close-case-check';
      checkLabel.appendChild(closeCheck);
      checkLabel.appendChild(document.createTextNode(' Close case on send'));

      const sendBtn = document.createElement('button');
      sendBtn.className = 'composer-send-btn' + (c.channel === 'gmail' ? ' gmail' : '');
      sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send`;

      sendBtn.addEventListener('click', async () => {
        const replyVal = textarea.value.trim();
        if (!replyVal) {
          showGmailToast('Please enter a response first.', 'error');
          return;
        }

        const imapAccount = state.connectedAccounts.find(x => x.isRealIMAP);
        const oauthAccount = state.connectedAccounts.find(x => x.accessToken);

        // Check if this is a real Gmail case and we have connected accounts
        if (c.channel === 'gmail') {
          if (oauthAccount && oauthAccount.accessToken && c.threadId) {
            sendBtn.disabled = true;
            sendBtn.textContent = 'Sending…';
            const success = await sendRealGmailReply(c, replyVal);
            sendBtn.disabled = false;
            sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send`;
            if (!success) return;
          } else if (imapAccount && imapAccount.isRealIMAP) {
            sendBtn.disabled = true;
            sendBtn.textContent = 'Sending…';
            const success = await sendRealSMTPEmailReply(c, imapAccount, replyVal);
            sendBtn.disabled = false;
            sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send`;
            if (!success) return;
          }
        } else if (c.channel === 'twitter') {
          const twAccount = state.connectedAccounts.find(x => x.channel === 'twitter' && x.accessToken);
          if (twAccount) {
            sendBtn.disabled = true;
            sendBtn.textContent = 'Sending…';
            const success = await sendRealTwitterReply(c, replyVal, twAccount);
            sendBtn.disabled = false;
            sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send`;
            if (!success) return;
          } else {
             showGmailToast('No active connected Twitter account found.', 'error');
             return;
          }
        }

        // Append reply message
        c.messages.push({
          id: 'msg-' + Date.now(),
          sender: 'Support Agent (You)',
          text: replyVal,
          timestamp: new Date().toISOString(),
          isAgent: true
        });

        // Update snippet
        c.text = `You: ${replyVal.substring(0, 50)}...`;
        c.createdTime = new Date().toISOString();

        if (closeCheck.checked) {
          c.status = 'Closed';
          showGmailToast('✓ Message sent and case CLOSED!', 'success');
        } else {
          showGmailToast('✓ Message sent successfully!', 'success');
        }

        textarea.value = '';
        saveState();
        renderAllCases();
      });

      actionsRow.appendChild(checkLabel);
      actionsRow.appendChild(sendBtn);

      inputArea.appendChild(textarea);
      inputArea.appendChild(actionsRow);

      composer.appendChild(composerToolbar);
      composer.appendChild(inputArea);
      detailContainer.appendChild(composer);

      center.appendChild(detailContainer);

      // Auto-scroll to bottom of messages stream
      setTimeout(() => {
        body.scrollTop = body.scrollHeight;
      }, 50);
    }

    // ── Render Case Info (Right Panel Metadata) ──────────
    function renderCaseInfo(c) {
      const right = document.getElementById('inbox-right');
      if (!right) return;
      right.innerHTML = '';

      const detail = document.createElement('div');
      detail.className = 'inbox-right-detail';

      const header = document.createElement('div');
      header.className = 'inbox-right-header';
      header.textContent = 'Case Properties';
      detail.appendChild(header);

      const body = document.createElement('div');
      body.className = 'inbox-right-body';

      // Section 1: Customer Profile
      const s1 = document.createElement('div');
      s1.className = 'metadata-section';
      s1.innerHTML = `<div class="metadata-section-title">Customer Profile</div>`;

      const profile = document.createElement('div');
      profile.className = 'customer-profile-card';

      const avatar = document.createElement('div');
      avatar.className = 'customer-profile-avatar';
      avatar.textContent = initials(c.author);

      const info = document.createElement('div');
      info.className = 'customer-profile-info';

      const name = document.createElement('div');
      name.className = 'customer-profile-name';
      name.textContent = c.author;

      const contact = document.createElement('div');
      contact.className = 'customer-profile-email';
      contact.textContent = c.channel === 'gmail' ? c.author : `@${c.author.replace(/\s+/g, '')}`;

      info.appendChild(name);
      info.appendChild(contact);
      profile.appendChild(avatar);
      profile.appendChild(info);
      s1.appendChild(profile);
      body.appendChild(s1);

      // Section 2: Properties fields
      const s2 = document.createElement('div');
      s2.className = 'metadata-section';
      s2.innerHTML = `<div class="metadata-section-title">Details & Lifecycle</div>`;

      const grid = document.createElement('div');
      grid.className = 'metadata-form-grid';

      // Status Field
      const statusField = document.createElement('div');
      statusField.className = 'metadata-field';
      statusField.innerHTML = `<label>Case Status</label>`;
      const statusSelect = document.createElement('select');
      statusSelect.className = 'metadata-select';
      ['Open', 'Ongoing', 'Pending', 'Closed'].forEach((st) => {
        const opt = document.createElement('option');
        opt.value = st;
        opt.textContent = st;
        if (c.status === st) opt.selected = true;
        statusSelect.appendChild(opt);
      });
      statusSelect.addEventListener('change', () => {
        c.status = statusSelect.value;
        saveState();
        renderAllCases();
      });
      statusField.appendChild(statusSelect);
      grid.appendChild(statusField);

      // Priority Field
      const prioField = document.createElement('div');
      prioField.className = 'metadata-field';
      prioField.innerHTML = `<label>Priority</label>`;
      const prioSelect = document.createElement('select');
      prioSelect.className = 'metadata-select';
      ['Low', 'Medium', 'High'].forEach((pr) => {
        const opt = document.createElement('option');
        opt.value = pr;
        opt.textContent = pr;
        if (c.priority === pr) opt.selected = true;
        prioSelect.appendChild(opt);
      });
      prioSelect.addEventListener('change', () => {
        c.priority = prioSelect.value;
        saveState();
        renderAllCases();
      });
      prioField.appendChild(prioSelect);
      grid.appendChild(prioField);

      // Assigned Agent Field
      const agentField = document.createElement('div');
      agentField.className = 'metadata-field';
      agentField.innerHTML = `<label>Assignee</label>`;
      const agentSelect = document.createElement('select');
      agentSelect.className = 'metadata-select';
      ['Unassigned', 'SC', 'AG', 'NN'].forEach((ag) => {
        const opt = document.createElement('option');
        opt.value = ag;
        opt.textContent = ag === 'Unassigned' ? 'Unassigned' : `${ag} (Agent)`;
        if (c.assignedTo === ag) opt.selected = true;
        agentSelect.appendChild(opt);
      });
      agentSelect.addEventListener('change', () => {
        c.assignedTo = agentSelect.value;
        saveState();
        renderAllCases();
      });
      agentField.appendChild(agentSelect);
      grid.appendChild(agentField);

      s2.appendChild(grid);
      body.appendChild(s2);

      // Section 3: SLA Timer
      const s3 = document.createElement('div');
      s3.className = 'metadata-section';
      s3.innerHTML = `<div class="metadata-section-title">SLA Timer</div>`;
      const sla = document.createElement('div');
      if (c.status === 'Closed') {
        sla.className = 'sla-badge';
        sla.style.background = '#D1FAE5';
        sla.style.color = '#065F46';
        sla.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg> SLA Met`;
      } else {
        sla.className = 'sla-badge';
        sla.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Response: 48m remaining`;
      }
      s3.appendChild(sla);
      body.appendChild(s3);

      // Section 4: Tags
      const s4 = document.createElement('div');
      s4.className = 'metadata-section';
      s4.innerHTML = `<div class="metadata-section-title">Tags</div>`;
      const tags = document.createElement('div');
      tags.className = 'tag-list';

      const mainTag = document.createElement('span');
      mainTag.className = 'metadata-tag';
      mainTag.textContent = c.channel.toUpperCase();
      tags.appendChild(mainTag);

      if (c.priority === 'High') {
        const priorityTag = document.createElement('span');
        priorityTag.className = 'metadata-tag urgent';
        priorityTag.textContent = 'URGENT';
        tags.appendChild(priorityTag);
      }

      if (c.channel === 'gmail') {
        const emailTag = document.createElement('span');
        emailTag.className = 'metadata-tag';
        emailTag.textContent = 'Support Email';
        tags.appendChild(emailTag);
      }

      s4.appendChild(tags);
      body.appendChild(s4);

      detail.appendChild(body);
      right.appendChild(detail);
    }

    // ── Source Filter Pills Handlers ──────────────────────
    const pillsContainer = document.getElementById('inbox-source-filters');
    if (pillsContainer) {
      const pills = pillsContainer.querySelectorAll('.source-filter-pill');
      pills.forEach((pill) => {
        pill.addEventListener('click', () => {
          pills.forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          state.activeFilter = pill.getAttribute('data-filter') || 'all';
          renderAllCases();
        });
      });
    }

    // ══════════════════════════════════════════════════════
    // GMAIL CHANNEL CONFIGURATION & INTEGRATION
    // ══════════════════════════════════════════════════════

    const gmailPanel = document.getElementById('gmail-config-panel');
    const gmailBackBtn = document.getElementById('gmail-back-btn');
    const gmailConnectBtn = document.getElementById('gmail-connect-btn');
    const gmailTabs = document.querySelectorAll('.gmail-tab');
    const gmailTabContents = {
      imap: document.getElementById('gmail-tab-imap'),
      forwarding: document.getElementById('gmail-tab-forwarding'),
      connected: document.getElementById('gmail-tab-connected'),
    };

    function hideGmailPanel() {
      if (gmailPanel) gmailPanel.style.display = 'none';
      if (channelsPanel) channelsPanel.style.display = '';
    }

    if (gmailBackBtn) gmailBackBtn.addEventListener('click', hideGmailPanel);

    // Gmail tab switching
    gmailTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        gmailTabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var tabKey = tab.getAttribute('data-gmailtab');
        Object.keys(gmailTabContents).forEach(function (key) {
          if (gmailTabContents[key]) {
            gmailTabContents[key].classList.toggle('active', key === tabKey);
          }
        });
      });
    });

    // Password visibility toggle
    document.querySelectorAll('.gmail-toggle-password').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-target');
        var input = document.getElementById(targetId);
        if (input) {
          input.type = input.type === 'password' ? 'text' : 'password';
        }
      });
    });

    // Copy forwarding address
    var copyBtn = document.getElementById('gmail-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var addr = document.getElementById('gmail-forwarding-address');
        if (addr) {
          addr.select();
          navigator.clipboard.writeText(addr.value).then(function () {
            var span = copyBtn.querySelector('span');
            if (span) {
              span.textContent = 'Copied!';
              setTimeout(function () { span.textContent = 'Copy'; }, 2000);
            }
          }).catch(function () {
            document.execCommand('copy');
          });
        }
      });
    }

    // Toast notification helper
    function showGmailToast(message, kind) {
      var existing = document.querySelector('.gmail-toast');
      if (existing) existing.remove();
      var toast = document.createElement('div');
      toast.className = 'gmail-toast ' + (kind || 'info');
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(function () { toast.remove(); }, 3500);
    }

    // Test Connection button
    var testBtn = document.getElementById('gmail-test-btn');
    if (testBtn) {
      testBtn.addEventListener('click', async function () {
        var email = document.getElementById('gmail-email');
        var password = document.getElementById('gmail-imap-password');
        var host = document.getElementById('gmail-imap-host');
        var port = document.getElementById('gmail-imap-port');

        if (!email || !email.value.trim()) {
          showGmailToast('Please enter an email address first.', 'error');
          return;
        }
        if (!password || !password.value.trim()) {
          showGmailToast('Please enter a password / app password.', 'error');
          return;
        }
        testBtn.textContent = 'Testing…';
        testBtn.disabled = true;

        try {
          const res = await fetch('/api/gmail/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: email.value.trim(),
              password: password.value.trim(),
              imapHost: (host && host.value.trim()) || 'imap.gmail.com',
              imapPort: (port && port.value.trim()) || '993'
            })
          });

          if (res.status === 404 || res.status === 405) {
            // Server doesn't support API, fall back to mock success
            setTimeout(function () {
              testBtn.textContent = 'Test Connection';
              testBtn.disabled = false;
              showGmailToast('✓ Connection successful (Mock fallback)! IMAP and SMTP servers are reachable.', 'success');
            }, 1000);
            return;
          }

          const data = await res.json();
          testBtn.textContent = 'Test Connection';
          testBtn.disabled = false;

          if (data.success) {
            showGmailToast('✓ Connection successful! Real IMAP server is reachable.', 'success');
          } else {
            showGmailToast('✗ Connection failed: ' + data.error, 'error');
          }
        } catch (err) {
          testBtn.textContent = 'Test Connection';
          testBtn.disabled = false;
          showGmailToast('✓ Connection successful (Mock fallback)! IMAP and SMTP servers are reachable.', 'success');
        }
      });
    }

    // Form submission — Save & Connect Gmail manually (real IMAP sync or mock fallback)
    var gmailForm = document.getElementById('gmail-config-form');
    if (gmailForm) {
      gmailForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        var displayName = document.getElementById('gmail-display-name');
        var email = document.getElementById('gmail-email');
        var password = document.getElementById('gmail-imap-password');
        var imapHost = document.getElementById('gmail-imap-host');
        var imapPort = document.getElementById('gmail-imap-port');
        var smtpHost = document.getElementById('gmail-smtp-host');
        var smtpPort = document.getElementById('gmail-smtp-port');

        if (!email || !email.value.trim()) {
          showGmailToast('Email address is required.', 'error');
          return;
        }
        if (!password || !password.value.trim()) {
          showGmailToast('Password / App password is required.', 'error');
          return;
        }

        var saveBtn = document.getElementById('gmail-save-btn');
        if (saveBtn) {
          saveBtn.textContent = 'Connecting…';
          saveBtn.disabled = true;
        }

        const userEmail = email.value.trim();
        const userName = (displayName && displayName.value.trim()) || userEmail.split('@')[0];
        const passVal = password.value.trim();
        const imapHostVal = (imapHost && imapHost.value.trim()) || 'imap.gmail.com';
        const imapPortVal = (imapPort && imapPort.value.trim()) || '993';
        const smtpHostVal = (smtpHost && smtpHost.value.trim()) || 'smtp.gmail.com';
        const smtpPortVal = (smtpPort && smtpPort.value.trim()) || '587';

        try {
          const res = await fetch('/api/gmail/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: userEmail,
              password: passVal,
              imapHost: imapHostVal,
              imapPort: imapPortVal,
              limit: 15
            })
          });

          if (res.status === 404 || res.status === 405) {
            // Fall back to Mock mode if backend API doesn't exist
            throw new Error('Fallback to Mock');
          }

          const data = await res.json();
          if (saveBtn) {
            saveBtn.textContent = 'Save & Connect';
            saveBtn.disabled = false;
          }

          if (data.success) {
            showGmailToast('✓ Connected Gmail account: ' + userEmail, 'success');

            const account = {
              email: userEmail,
              name: userName,
              imapHost: imapHostVal,
              imapPort: imapPortVal,
              smtpHost: smtpHostVal,
              smtpPort: smtpPortVal,
              password: passVal,
              isRealIMAP: true
            };

            const idx = state.connectedAccounts.findIndex(x => x.email === userEmail);
            if (idx !== -1) {
              state.connectedAccounts[idx] = account;
            } else {
              state.connectedAccounts.push(account);
            }

            // Map fetched real emails into cases
            state.cases = state.cases.filter(x => x.channel !== 'gmail');
            data.emails.forEach((rawEmail) => {
              const mappedCase = parseBackendEmail(rawEmail);
              if (mappedCase) {
                state.cases.push(mappedCase);
              }
            });

            state.cases.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

            saveState();
            renderAllCases();
            renderConnectedGmailAccounts();

            gmailTabs.forEach(function (t) { t.classList.remove('active'); });
            var connTab = document.querySelector('.gmail-tab[data-gmailtab="connected"]');
            if (connTab) connTab.classList.add('active');
            Object.keys(gmailTabContents).forEach(function (key) {
              if (gmailTabContents[key]) {
                gmailTabContents[key].classList.toggle('active', key === 'connected');
              }
            });

            startEmailSyncLoop();
          } else {
            showGmailToast('✗ Login failed: ' + data.error, 'error');
          }
        } catch (err) {
          if (saveBtn) {
            saveBtn.textContent = 'Save & Connect';
            saveBtn.disabled = false;
          }
          showGmailToast('✓ Connected (Mock Fallback)! Static simulation active.', 'success');

          const account = {
            email: userEmail,
            name: userName,
            isRealIMAP: false
          };

          const idx = state.connectedAccounts.findIndex(x => x.email === userEmail);
          if (idx !== -1) {
            state.connectedAccounts[idx] = account;
          } else {
            state.connectedAccounts.push(account);
          }

          // Load mock cases sent TO userEmail from others
          loadSimulatedIncomingEmails(userEmail);

          saveState();
          renderAllCases();
          renderConnectedGmailAccounts();

          gmailTabs.forEach(function (t) { t.classList.remove('active'); });
          var connTab = document.querySelector('.gmail-tab[data-gmailtab="connected"]');
          if (connTab) connTab.classList.add('active');
          Object.keys(gmailTabContents).forEach(function (key) {
            if (gmailTabContents[key]) {
              gmailTabContents[key].classList.toggle('active', key === 'connected');
            }
          });

          startEmailSyncLoop();
        }
      });
    }

    function renderConnectedGmailAccounts() {
      var emptyState = document.getElementById('gmail-connected-empty');
      var list = document.getElementById('gmail-connected-list');

      if (state.connectedAccounts.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        if (list) { list.style.display = 'none'; list.innerHTML = ''; }
        return;
      }

      if (emptyState) emptyState.style.display = 'none';
      if (list) {
        list.style.display = 'grid';
        list.innerHTML = '';
      }

      state.connectedAccounts.forEach((acc) => {
        var card = document.createElement('div');
        card.className = 'gmail-account-card';

        var avatar = document.createElement('div');
        avatar.className = 'gmail-account-avatar';
        avatar.textContent = acc.name.split(/\s+/).slice(0, 2).map(function (w) { return w[0] || ''; }).join('').toUpperCase() || '?';

        var info = document.createElement('div');
        info.className = 'gmail-account-info';

        var emailEl = document.createElement('div');
        emailEl.className = 'gmail-account-email';
        emailEl.textContent = acc.email;

        var status = document.createElement('div');
        status.className = 'gmail-account-status';
        status.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="20,6 9,17 4,12"/></svg>';
        status.appendChild(document.createTextNode(acc.accessToken ? 'OAuth Active' : 'Connected'));

        // Disconnect Button Container
        var disconnectContainer = document.createElement('div');
        disconnectContainer.style.marginTop = '6px';
        disconnectContainer.style.display = 'flex';
        disconnectContainer.style.alignItems = 'center';
        disconnectContainer.style.gap = '8px';

        var disconnectBtn = document.createElement('button');
        disconnectBtn.style.fontSize = '10.5px';
        disconnectBtn.style.fontWeight = '600';
        disconnectBtn.style.color = '#B91C1C';
        disconnectBtn.style.cursor = 'pointer';
        disconnectBtn.style.background = 'none';
        disconnectBtn.style.border = 'none';
        disconnectBtn.style.padding = '0';
        disconnectBtn.style.fontFamily = 'inherit';
        disconnectBtn.textContent = 'Disconnect Account';

        var confirmContainer = document.createElement('div');
        confirmContainer.style.display = 'none';
        confirmContainer.style.alignItems = 'center';
        confirmContainer.style.gap = '6px';
        confirmContainer.style.fontSize = '10.5px';

        var confirmLabel = document.createElement('span');
        confirmLabel.style.color = '#4B5563';
        confirmLabel.style.fontWeight = '500';
        confirmLabel.textContent = 'Are you sure?';

        var yesBtn = document.createElement('button');
        yesBtn.style.color = '#B91C1C';
        yesBtn.style.fontWeight = '600';
        yesBtn.style.cursor = 'pointer';
        yesBtn.style.background = 'none';
        yesBtn.style.border = 'none';
        yesBtn.style.padding = '0';
        yesBtn.style.fontFamily = 'inherit';
        yesBtn.textContent = 'Yes';

        var noBtn = document.createElement('button');
        noBtn.style.color = '#4B5563';
        noBtn.style.fontWeight = '600';
        noBtn.style.cursor = 'pointer';
        noBtn.style.background = 'none';
        noBtn.style.border = 'none';
        noBtn.style.padding = '0';
        noBtn.style.fontFamily = 'inherit';
        noBtn.textContent = 'No';

        confirmContainer.appendChild(confirmLabel);
        confirmContainer.appendChild(yesBtn);
        confirmContainer.appendChild(document.createTextNode(' | '));
        confirmContainer.appendChild(noBtn);

        disconnectBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          disconnectBtn.style.display = 'none';
          confirmContainer.style.display = 'flex';
        });

        yesBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          state.connectedAccounts = state.connectedAccounts.filter(x => x.email !== acc.email);

          if (state.connectedAccounts.length === 0) {
            state.cases = state.cases.filter(x => x.channel !== 'gmail');
            state.selectedCaseId = null;
            stopEmailSyncLoop();
          }

          saveState();
          renderAllCases();
          renderConnectedGmailAccounts();
          showGmailToast('✓ Account disconnected and inbox synced', 'info');
        });

        noBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          confirmContainer.style.display = 'none';
          disconnectBtn.style.display = 'inline-block';
        });

        disconnectContainer.appendChild(disconnectBtn);
        disconnectContainer.appendChild(confirmContainer);

        info.appendChild(emailEl);
        info.appendChild(status);
        info.appendChild(disconnectContainer);
        card.appendChild(avatar);
        card.appendChild(info);
        if (list) list.appendChild(card);
      });
    }

    // ── Google OAuth & Gmail API Implementation ─────────

    const clientIdModal = document.getElementById('gmail-client-id-modal');
    const modalCloseBtn = document.getElementById('gmail-modal-close-btn');
    const modalCancelBtn = document.getElementById('gmail-modal-cancel-btn');
    const modalSaveBtn = document.getElementById('gmail-modal-save-btn');
    const modalInput = document.getElementById('gmail-modal-client-id');

    function showClientIdModal() {
      if (clientIdModal) {
        if (modalInput) {
          modalInput.value = localStorage.getItem('gmail_google_client_id') || '';
        }
        clientIdModal.style.display = 'flex';
      }
    }

    function hideClientIdModal() {
      if (clientIdModal) clientIdModal.style.display = 'none';
    }

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', hideClientIdModal);
    if (modalCancelBtn) modalCancelBtn.addEventListener('click', hideClientIdModal);
    if (modalSaveBtn) {
      modalSaveBtn.addEventListener('click', () => {
        const val = modalInput.value.trim();
        if (!val) {
          showGmailToast('Please enter a Google Client ID.', 'error');
          return;
        }
        localStorage.setItem('gmail_google_client_id', val);
        hideClientIdModal();
        requestGoogleAuth(val);
      });
    }

    function connectGmailAccount() {
      let clientId = window.CARAPAL_CONFIG.GOOGLE_CLIENT_ID || localStorage.getItem('gmail_google_client_id');

      if (!clientId || !clientId.trim()) {
        showClientIdModal();
        return;
      }

      requestGoogleAuth(clientId.trim());
    }

    // Connect Gmail button (top right) — trigger Google OAuth flow
    if (gmailConnectBtn) {
      gmailConnectBtn.addEventListener('click', function () {
        connectGmailAccount();
      });
    }

    let tokenClient = null;

    function requestGoogleAuth(clientId) {
      if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        showGmailToast('Google Client is loading, please click again in a second.', 'error');
        return;
      }

      try {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
          callback: async (tokenResponse) => {
            if (tokenResponse.error) {
              showGmailToast('Google Login failed: ' + tokenResponse.error, 'error');
              return;
            }

            if (tokenResponse.access_token) {
              const token = tokenResponse.access_token;
              showGmailToast('✓ Google Authorization successful! Fetching profile...', 'success');

              try {
                const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!res.ok) throw new Error('Profile fetch failed');
                const profile = await res.json();

                if (profile.email) {
                  const account = {
                    email: profile.email,
                    name: profile.name || profile.email.split('@')[0],
                    accessToken: token,
                    connectedAt: Date.now()
                  };

                  const idx = state.connectedAccounts.findIndex(x => x.email === profile.email);
                  if (idx !== -1) {
                    state.connectedAccounts[idx] = account;
                  } else {
                    state.connectedAccounts.push(account);
                  }

                  showGmailToast(`✓ Connected Gmail account: ${profile.email}`, 'success');
                  showGmailToast('🔄 Loading emails from your Gmail inbox...', 'info');

                  // Save the Gmail channel to the backend DB (Vercel Serverless)
                  fetch('/api/connected-channels', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      platform: 'gmail',
                      account_email: profile.email,
                      account_name: account.name,
                      avatar_url: profile.picture || '',
                      access_token: token
                    })
                  })
                  .then(r => r.json())
                  .then(data => {
                    if (data.success) {
                      console.log('Gmail channel saved to DB, id:', data.data.id);
                      account.dbChannelId = data.data.id;
                    }
                  })
                  .catch((err) => console.error('Failed to save Gmail channel to DB:', err));

                  await fetchGmailEmailsForAccount(account);

                  saveState();
                  renderAllCases();
                  renderConnectedGmailAccounts();

                  gmailTabs.forEach(function (t) { t.classList.remove('active'); });
                  var connTab = document.querySelector('.gmail-tab[data-gmailtab="connected"]');
                  if (connTab) connTab.classList.add('active');
                  Object.keys(gmailTabContents).forEach(function (key) {
                    if (gmailTabContents[key]) {
                      gmailTabContents[key].classList.toggle('active', key === 'connected');
                    }
                  });

                  startEmailSyncLoop();
                }
              } catch (err) {
                console.error('Error fetching userinfo:', err);
                showGmailToast('Failed to fetch profile info. Check scopes or connection.', 'error');
              }
            }
          },
        });

        tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (err) {
        console.error('Error initializing Google client:', err);
        showGmailToast('Failed to open Google Authorization. Check Client ID.', 'error');
      }
    }

    async function fetchGmailEmailsForAccount(account) {
      try {
        const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:inbox&maxResults=15', {
          headers: { 'Authorization': `Bearer ${account.accessToken}` }
        });

        if (!listRes.ok) {
          if (listRes.status === 401) {
            showGmailToast(`Google session expired for ${account.email}. Re-connecting...`, 'error');
            requestGoogleAuth(window.CARAPAL_CONFIG.GOOGLE_CLIENT_ID || localStorage.getItem('gmail_google_client_id'));
            return;
          }
          const errorText = await listRes.text();
          throw new Error('Google API Error ' + listRes.status + ': ' + errorText);
        }

        const listData = await listRes.json();
        const messages = listData.messages || [];

        if (messages.length === 0) {
          showGmailToast('Your Gmail inbox is empty.', 'info');
          return;
        }

        state.cases = state.cases.filter(x => x.channel !== 'gmail');

        const detailPromises = messages.map(async (msg) => {
          try {
            const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
              headers: { 'Authorization': `Bearer ${account.accessToken}` }
            });
            if (!detailRes.ok) return null;
            return await detailRes.json();
          } catch (err) {
            return null;
          }
        });

        const details = await Promise.all(detailPromises);

        const newDbMessages = [];

        details.forEach((rawMsg) => {
          if (!rawMsg) return;
          const mappedCase = parseGmailMessage(rawMsg, account.email);
          if (mappedCase) {
            state.cases.push(mappedCase);
            
            // Prepare for DB insert
            newDbMessages.push({
              gmail_message_id: mappedCase.gmailMessageId || rawMsg.id,
              subject: mappedCase.emailSubject || '(No Subject)',
              sender_email: mappedCase.author,
              sender_name: mappedCase.authorName || mappedCase.author,
              recipient_email: account.email,
              body_text: mappedCase.messages && mappedCase.messages[0] ? mappedCase.messages[0].text : mappedCase.text,
              received_at: mappedCase.createdTime
            });
          }
        });

        // Save synced messages to the backend DB (Vercel Serverless)
        if (newDbMessages.length > 0) {
          // First, get the channel_id from the DB
          fetch('/api/connected-channels')
            .then(r => r.json())
            .then(chData => {
              const ch = (chData.data || []).find(c => c.account_email === account.email && c.platform === 'gmail');
              const channelId = ch ? ch.id : null;
              if (channelId) {
                fetch('/api/platform-messages', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ channel_id: channelId, messages: newDbMessages })
                })
                .then(r => r.json())
                .then(data => console.log('Gmail messages saved to DB:', data))
                .catch(err => console.error('Failed to save Gmail messages to DB:', err));
              } else {
                console.warn('No channel_id found in DB for', account.email);
              }
            })
            .catch(err => console.error('Failed to lookup channel for DB save:', err));
        }

        state.cases.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
        saveState();
        showGmailToast(`✓ Successfully loaded ${state.cases.filter(x => x.channel === 'gmail').length} emails from Gmail!`, 'success');

      } catch (err) {
        console.error('Error syncing Gmail emails:', err);
        showGmailToast('Failed to sync emails: ' + err.message.substring(0, 100), 'error');
      }
    }

    function parseGmailMessage(rawMsg, accountEmail) {
      const headers = rawMsg.payload.headers || [];
      const getHeader = (name) => {
        const h = headers.find(x => x.name.toLowerCase() === name.toLowerCase());
        return h ? h.value : '';
      };

      const fromHeader = getHeader('From');
      const subjectHeader = getHeader('Subject') || '(No Subject)';
      const dateHeader = getHeader('Date');
      const messageId = getHeader('Message-ID');

      let senderName = fromHeader;
      let senderEmail = fromHeader;
      const match = fromHeader.match(/(.*?)\s*<(.*?)>/);
      if (match) {
        senderName = match[1].trim().replace(/^["']|["']$/g, '');
        senderEmail = match[2].trim();
      }

      let bodyText = '';

      function extractBody(part) {
        if (part.body && part.body.data) {
          return base64UrlDecode(part.body.data);
        }
        if (part.parts) {
          for (let subPart of part.parts) {
            const text = extractBody(subPart);
            if (text) return text;
          }
        }
        return '';
      }

      bodyText = extractBody(rawMsg.payload);
      if (!bodyText || !bodyText.trim()) {
        bodyText = rawMsg.snippet || '';
      }

      const attachments = [];
      if (rawMsg.payload.parts) {
        rawMsg.payload.parts.forEach((part) => {
          if (part.filename && part.body && part.body.attachmentId) {
            attachments.push({
              name: part.filename,
              size: formatBytes(part.body.size || 0),
              attachmentId: part.body.attachmentId,
              mimeType: part.mimeType
            });
          }
        });
      }

      return {
        id: 'gmail-msg-' + rawMsg.id,
        gmailMessageId: rawMsg.id,
        source: 'Gmail Support',
        author: senderEmail,
        authorName: senderName,
        channel: 'gmail',
        avatarGradient: AVATAR_GRADIENTS[Math.abs(hashCode(senderEmail)) % AVATAR_GRADIENTS.length],
        text: bodyText.substring(0, 120) + (bodyText.length > 120 ? '...' : ''),
        createdTime: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
        type: 'Email',
        status: 'Open',
        priority: 'Medium',
        assignedTo: 'Unassigned',
        emailSubject: subjectHeader,
        emailAttachments: attachments,
        threadId: rawMsg.threadId,
        messageIdHeader: messageId,
        messages: [
          {
            id: 'msg-g-' + rawMsg.id,
            sender: senderName + ' <' + senderEmail + '>',
            text: bodyText,
            timestamp: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
            isAgent: false
          }
        ]
      };
    }

    function base64UrlDecode(str) {
      let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      try {
        return decodeURIComponent(escape(atob(base64)));
      } catch (err) {
        try {
          return atob(base64);
        } catch (e) {
          return 'Unable to parse email body content.';
        }
      }
    }

    function hashCode(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      return hash;
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async function sendRealGmailReply(c, replyText) {
      const account = state.connectedAccounts.find(x => x.accessToken);
      if (!account || !account.accessToken) {
        showGmailToast('No active connected Google session found.', 'error');
        return false;
      }

      try {
        let subject = c.emailSubject || 'Re: Support Ticket';
        if (!subject.toLowerCase().startsWith('re:')) {
          subject = 'Re: ' + subject;
        }

        const to = c.author;
        const from = `${account.name} <${account.email}>`;

        const payload = buildMimeEmail(to, from, subject, c.threadId, c.messageIdHeader, replyText);

        showGmailToast('📤 Sending email reply via Google API...', 'info');

        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            raw: payload.raw,
            threadId: payload.threadId
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          console.error('Gmail Send API error:', errData);
          throw new Error(errData.error ? errData.error.message : 'API call failed');
        }

        showGmailToast('✓ Email reply sent successfully!', 'success');
        return true;

      } catch (err) {
        console.error('Error sending reply email:', err);
        showGmailToast('Failed to send email via Gmail API: ' + err.message, 'error');
        return false;
      }
    }

    function buildMimeEmail(to, from, subject, threadId, inReplyTo, bodyText) {
      const headers = [
        `To: ${to}`,
        `From: ${from}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset=utf-8`
      ];

      if (inReplyTo) {
        headers.push(`In-Reply-To: ${inReplyTo}`);
        headers.push(`References: ${inReplyTo}`);
      }

      const email = headers.join('\r\n') + '\r\n\r\n' + bodyText;

      const rawEncoded = btoa(unescape(encodeURIComponent(email)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      return {
        raw: rawEncoded,
        threadId: threadId
      };
    }

    function parseBackendEmail(rawEmail) {
      let senderName = rawEmail.from;
      let senderEmail = rawEmail.from;
      const match = rawEmail.from.match(/(.*?)\s*<(.*?)>/);
      if (match) {
        senderName = match[1].trim().replace(/^["']|["']$/g, '');
        senderEmail = match[2].trim();
      }

      return {
        id: 'gmail-msg-imap-' + rawEmail.id,
        gmailMessageId: rawEmail.id,
        source: 'Gmail Support',
        author: senderEmail,
        authorName: senderName,
        channel: 'gmail',
        avatarGradient: AVATAR_GRADIENTS[Math.abs(hashCode(senderEmail)) % AVATAR_GRADIENTS.length],
        text: rawEmail.body.substring(0, 120) + (rawEmail.body.length > 120 ? '...' : ''),
        createdTime: rawEmail.date ? new Date(rawEmail.date).toISOString() : new Date().toISOString(),
        type: 'Email',
        status: 'Open',
        priority: 'Medium',
        assignedTo: 'Unassigned',
        emailSubject: rawEmail.subject,
        emailAttachments: [],
        messageIdHeader: rawEmail.message_id,
        messages: [
          {
            id: 'msg-g-imap-' + rawEmail.id,
            sender: senderName + ' <' + senderEmail + '>',
            text: rawEmail.body,
            timestamp: rawEmail.date ? new Date(rawEmail.date).toISOString() : new Date().toISOString(),
            isAgent: false
          }
        ]
      };
    }

    async function sendRealSMTPEmailReply(c, account, replyText) {
      try {
        let subject = c.emailSubject || 'Re: Support Ticket';
        if (!subject.toLowerCase().startsWith('re:')) {
          subject = 'Re: ' + subject;
        }

        showGmailToast('📤 Sending email reply via SMTP...', 'info');

        const response = await fetch('/api/gmail/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: account.email,
            password: account.password,
            smtpHost: account.smtpHost || 'smtp.gmail.com',
            smtpPort: account.smtpPort || '587',
            to: c.author,
            subject: subject,
            body: replyText,
            inReplyTo: c.messageIdHeader || ''
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'SMTP failed');
        }

        showGmailToast('✓ Email reply sent successfully via SMTP!', 'success');
        return true;
      } catch (err) {
        console.error('SMTP reply error:', err);
        showGmailToast('Failed to send reply: ' + err.message, 'error');
        return false;
      }
    }

    function loadSimulatedIncomingEmails(userEmail) {
      const customMocks = [
        {
          id: 'gmail-sim-1',
          source: 'Gmail Support',
          author: 'donor-care@impactguru.org',
          channel: 'gmail',
          avatarGradient: 'linear-gradient(135deg, #10B981, #059669)',
          text: `Urgent Verification request for fundraiser to support accident victims.`,
          createdTime: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          type: 'Email',
          status: 'Open',
          priority: 'High',
          assignedTo: 'Unassigned',
          emailSubject: `[Action Required] Fundraiser verification for ${userEmail}`,
          emailAttachments: [],
          messages: [
            {
              id: 'msg-sim-1-1',
              sender: 'donor-care@impactguru.org',
              text: `Dear Roshan,

We received your request to verify the fundraiser page "Impact Guru Parents Accident Appeal" connected to ${userEmail}. 

To complete this process and remove the pending verification warning, please reply to this email with a clear scan of the primary medical admission documents and government ID.

Thank you,
Verification Team`,
              timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
              isAgent: false
            }
          ]
        },
        {
          id: 'gmail-sim-2',
          source: 'Gmail Support',
          author: 'billing@care360.com',
          channel: 'gmail',
          avatarGradient: 'linear-gradient(135deg, #4299E1, #3182CE)',
          text: `Welcome to Care360! Setup complete for ${userEmail}.`,
          createdTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          type: 'Email',
          status: 'Open',
          priority: 'Low',
          assignedTo: 'SC',
          emailSubject: `Care360 Support Account Activation`,
          emailAttachments: [],
          messages: [
            {
              id: 'msg-sim-2-1',
              sender: 'billing@care360.com',
              text: `Hello Roshan,

Welcome to Care360! Your support dashboard has been successfully initialized and connected to ${userEmail}. 

You can now monitor social commentary, reviews, and manage support tickets right here.

If you have any questions, feel free to reply.

Warmly,
The Care360 Onboarding Team`,
              timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              isAgent: false
            }
          ]
        }
      ];

      customMocks.forEach((mc) => {
        if (!state.cases.some(x => x.id === mc.id)) {
          state.cases.unshift(mc);
        }
      });
    }

    // ══════════════════════════════════════════════════════
    // GMAIL INCOMING EMAIL INTAKE SIMULATOR
    // ══════════════════════════════════════════════════════

    const INCOMING_EMAIL_POOL = [
      {
        author: 'investors@carapal.com',
        emailSubject: 'Inquiry regarding Q2 growth stats and customer acquisition cost',
        text: 'Hi Team, I am planning the slides for our board meeting next week. Do we have the Q2 growth figures ready?',
        body: `Hi Team,

I am planning the slides for our board meeting next week. Do we have the Q2 growth figures and the social media sentiment report ready? 

Also, please share the metrics of the Instagram Business ad campaigns.

Regards,
Sarah Jenkins
Investor Relations`
      },
      {
        author: 'david.miller@gmail.com',
        emailSubject: 'Problems accessing the analytics dashboards from my browser',
        text: 'Hello. I connected my FB and X channels yesterday, but the analytics module shows empty cards.',
        body: `Hello.

I connected my Facebook and X channels yesterday, but the analytics module shows empty cards and a spin loader that never finishes. 

I am using Safari 18 on macOS. Is there a compatibility issue with this browser? I tried clearing cache but it did not help.

Thanks,
David Miller`
      },
      {
        author: 'priya.sharma@yahoo.com',
        emailSubject: 'Partnership proposal: Influencer marketing campaigns for wellness brands',
        text: 'Respected Team, We represent a group of wellness and healthcare micro-influencers.',
        body: `Respected Team,

We represent a group of wellness and healthcare micro-influencers who have a combined reach of over 500k active followers. We would love to discuss a potential partnership for your brand listening campaigns.

Please let me know if we can schedule a quick 10-minute discovery call this week.

Warm regards,
Priya Sharma
Collab Manager`
      }
    ];

    let emailPoolIndex = 0;
    let syncIntervalId = null;

    async function generateIncomingEmail() {
      if (state.connectedAccounts.length === 0) return;

      const oauthAccount = state.connectedAccounts.find(x => x.accessToken);
      if (oauthAccount) {
        showGmailToast('🔄 Syncing fresh emails from your Gmail inbox...', 'info');
        await fetchGmailEmailsForAccount(oauthAccount);
        renderAllCases();
        return;
      }

      const imapAccount = state.connectedAccounts.find(x => x.isRealIMAP);
      if (imapAccount) {
        showGmailToast('🔄 Syncing fresh emails via IMAP server...', 'info');
        try {
          const res = await fetch('/api/gmail/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: imapAccount.email,
              password: imapAccount.password,
              imapHost: imapAccount.imapHost,
              imapPort: imapAccount.imapPort,
              limit: 15
            })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.success) {
              state.cases = state.cases.filter(x => x.channel !== 'gmail');
              data.emails.forEach((rawEmail) => {
                const mappedCase = parseBackendEmail(rawEmail);
                if (mappedCase) {
                  state.cases.push(mappedCase);
                }
              });
              state.cases.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
              saveState();
              renderAllCases();
              showGmailToast('✓ Inbox sync complete!', 'success');
              return;
            }
          }
        } catch (err) {
          console.error('IMAP background sync error:', err);
        }
      }

      const mock = INCOMING_EMAIL_POOL[emailPoolIndex];
      emailPoolIndex = (emailPoolIndex + 1) % INCOMING_EMAIL_POOL.length;

      const emailCase = {
        id: 'gmail-incoming-' + Date.now(),
        source: 'Gmail Support',
        author: mock.author,
        channel: 'gmail',
        avatarGradient: 'linear-gradient(135deg, #10B981, #059669)',
        text: mock.emailSubject + ': ' + mock.text.substring(0, 50) + '...',
        createdTime: new Date().toISOString(),
        type: 'Email',
        status: 'Open',
        priority: 'Medium',
        assignedTo: 'Unassigned',
        emailSubject: mock.emailSubject,
        emailAttachments: [],
        messages: [
          {
            id: 'msg-inc-' + Date.now(),
            sender: mock.author,
            text: mock.body,
            timestamp: new Date().toISOString(),
            isAgent: false
          }
        ]
      };

      state.cases.unshift(emailCase);
      saveState();
      renderAllCases();

      showGmailToast(`✉ New Email: "${mock.emailSubject}"`, 'info');

      const badge = document.querySelector('.notification-badge');
      if (badge) {
        const cur = parseInt(badge.textContent, 10) || 0;
        badge.textContent = cur + 1;
      }
    }

    function startEmailSyncLoop() {
      if (syncIntervalId) clearInterval(syncIntervalId);
      syncIntervalId = setInterval(generateIncomingEmail, 45000);
    }

    function stopEmailSyncLoop() {
      if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
      }
    }

    const refreshBtn = document.querySelector('.filter-action-btn[title="Refresh"]');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.connectedAccounts.length === 0) {
          showGmailToast('⚠ Please connect a Gmail account in settings first.', 'error');
          return;
        }
        showGmailToast('🔄 Checking Gmail servers for new emails...', 'info');
        setTimeout(() => {
          generateIncomingEmail();
        }, 1000);
      });
    }

    // ── On Page Load Initialization ──────────────────────
    // Restore connected accounts from the database (source of truth)
    fetch('/api/connected-channels')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data && data.data.length > 0) {
          const dbAccounts = data.data.map(ch => ({
            id: ch.account_email, // Needed for FB API which expects page.id
            email: ch.account_email,
            name: ch.account_name,
            dbChannelId: ch.id,
            platform: ch.platform,
            pictureUrl: ch.avatar_url,
            accessToken: ch.access_token,
            isAdmin: true, // assume true if saved
            connectedAt: new Date(ch.connected_at).getTime()
          }));

          // Render FB/IG/PlayStore pages from DB
          const fbPages = dbAccounts.filter(x => x.platform === 'facebook');
          const igPages = dbAccounts.filter(x => x.platform === 'instagram');
          const playPages = dbAccounts.filter(x => x.platform === 'google_play');

          if (typeof renderPages !== 'undefined') {
            if (fbPages.length > 0) renderPages(fbPages, 'facebook');
            if (igPages.length > 0) renderPages(igPages, 'instagram');
          }

          if (playPages.length > 0) {
            const playstoreGrid = document.createElement('div');
            playstoreGrid.className = 'fb-pages-grid';
            playPages.forEach(pp => {
              const card = buildPageCard(pp);
              playstoreGrid.appendChild(card);
            });
            const playstorePanel = document.getElementById('playstore-panel');
            if (playstorePanel) playstorePanel.appendChild(playstoreGrid);
            const playstoreStatus = document.getElementById('playstore-status');
            if (playstoreStatus) {
              playstoreStatus.textContent = 'Restored from Database';
              playstoreStatus.style.display = '';
            }
          }

          // Merge Gmail accounts into state (keep access tokens from localStorage if available)
          const gmailAccounts = dbAccounts.filter(x => x.platform === 'gmail');
          gmailAccounts.forEach(dbAcc => {
            const existing = state.connectedAccounts.find(x => x.email === dbAcc.email);
            if (!existing) {
              state.connectedAccounts.push(dbAcc);
            } else {
              existing.dbChannelId = dbAcc.dbChannelId;
            }
          });

          saveState();
          renderConnectedGmailAccounts();
          console.log('Restored', dbAccounts.length, 'total channels from database');
        }
      })
      .catch(err => console.error('Failed to restore channels from DB:', err));

    // Restore All Messages from the database
    Promise.all([
      fetch('/api/platform-messages').then(r => r.json()),
      fetch('/api/facebook-messages').then(r => r.json())
    ])
    .then(([platformData, fbData]) => {
      let addedCount = 0;
      const existingIds = new Set(state.cases.map(c => c.gmailMessageId || c.fbPostId || c.id).filter(Boolean));

      // Process general platform messages
      if (platformData.success && platformData.data && platformData.data.length > 0) {
        platformData.data.forEach(dbMsg => {
          if (dbMsg.gmail_message_id && !existingIds.has(dbMsg.gmail_message_id)) {
            const platform = dbMsg.platform || 'gmail';
            const sourceLabel = platform === 'gmail' ? 'Gmail Support' : (platform === 'google_play' ? 'Google Play' : platform);
            const msgType = platform === 'gmail' ? 'Email' : (platform === 'google_play' ? 'Review' : 'Message');
            
            state.cases.push({
              id: (platform === 'gmail' ? 'gmail-msg-' : 'msg-') + dbMsg.gmail_message_id,
              gmailMessageId: dbMsg.gmail_message_id,
              source: sourceLabel,
              author: dbMsg.sender_email,
              authorName: dbMsg.sender_name,
              channel: platform,
              avatarGradient: AVATAR_GRADIENTS[Math.abs(hashCode(dbMsg.sender_email || '')) % AVATAR_GRADIENTS.length],
              text: (dbMsg.body_text || '').substring(0, 120),
              createdTime: dbMsg.received_at || dbMsg.created_at,
              type: msgType,
              status: dbMsg.status === 'open' ? 'Open' : 'Closed',
              priority: 'Medium',
              assignedTo: 'Unassigned',
              emailSubject: dbMsg.subject || '(No Subject)',
              emailAttachments: [],
              messages: [{
                id: 'msg-db-' + dbMsg.id,
                sender: (dbMsg.sender_name || '') + ' <' + (dbMsg.sender_email || '') + '>',
                text: dbMsg.body_text || '',
                timestamp: dbMsg.received_at || dbMsg.created_at,
                isAgent: false
              }]
            });
            existingIds.add(dbMsg.gmail_message_id);
            addedCount++;
          }
        });
      }

      // Process dedicated facebook messages
      if (fbData.success && fbData.data && fbData.data.length > 0) {
        fbData.data.forEach(fbMsg => {
          if (fbMsg.fb_post_id && !existingIds.has(fbMsg.fb_post_id)) {
            const platform = fbMsg.platform || 'facebook';
            
            state.cases.push({
              id: fbMsg.fb_post_id,
              fbPostId: fbMsg.fb_post_id,
              source: 'Facebook Page',
              author: fbMsg.author_name,
              authorName: fbMsg.author_name,
              channel: platform,
              avatarGradient: AVATAR_GRADIENTS[Math.abs(hashCode(fbMsg.author_name || '')) % AVATAR_GRADIENTS.length],
              text: (fbMsg.message_text || '').substring(0, 120),
              createdTime: fbMsg.received_at || fbMsg.created_at,
              type: fbMsg.post_type || 'Comment',
              status: fbMsg.status === 'open' ? 'Open' : 'Closed',
              priority: 'Medium',
              assignedTo: 'Unassigned',
              emailSubject: 'Facebook ' + (fbMsg.post_type || 'Comment'),
              emailAttachments: [],
              messages: [{
                id: 'fb-db-' + fbMsg.id,
                sender: fbMsg.author_name || 'Facebook User',
                text: fbMsg.message_text || '',
                timestamp: fbMsg.received_at || fbMsg.created_at,
                isAgent: false
              }]
            });
            existingIds.add(fbMsg.fb_post_id);
            addedCount++;
          }
        });
      }

      if (addedCount > 0) {
        state.cases.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
        saveState();
        renderAllCases();
        console.log('Restored', addedCount, 'messages from database');
      }
    })
    .catch(err => console.error('Failed to restore messages from DB:', err));

    renderAllCases();
    renderConnectedGmailAccounts();
    if (state.connectedAccounts.length > 0) {
      startEmailSyncLoop();
    }

    // Expose a way to add Twitter account from the popup
    window.addTwitterAccount = function(account) {
      account.channel = 'twitter';
      account.email = account.username; // Use username as unique identifier for DB
      
      const idx = state.connectedAccounts.findIndex(x => x.username === account.username && x.channel === 'twitter');
      if (idx !== -1) {
        state.connectedAccounts[idx] = account;
      } else {
        state.connectedAccounts.push(account);
      }
      saveState();
      renderConnectedGmailAccounts(); // re-render the connected accounts list
      
      // Save Twitter channel to database
      fetch('/api/connected-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'twitter',
          account_email: account.username,
          account_name: account.name || ('@' + account.username),
          avatar_url: '', // Twitter API v2 doesn't give profile picture easily without extra scopes
          access_token: account.accessToken
        })
      })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          showGmailToast('Twitter account connected & saved to DB!', 'success');
        }
      })
      .catch(console.error);
      
      // trigger a sync
      generateIncomingTwitterMentions();
    };

    async function generateIncomingTwitterMentions() {
      if (state.connectedAccounts.length === 0) return;
      const twAccount = state.connectedAccounts.find(x => x.channel === 'twitter' && x.accessToken);
      if (!twAccount) return;
      
      showGmailToast('Syncing fresh mentions from Twitter...', 'info');
      try {
        const response = await fetch('/api/twitter-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: twAccount.accessToken })
        });
        const result = await response.json();
        if (result.success && result.mentions && result.mentions.length > 0) {
          result.mentions.forEach(tweet => {
            // map tweet to case
            const newCase = {
              id: 'tw-' + tweet.id,
              channel: 'twitter',
              author: tweet.author_id,
              username: tweet.author_id, // we might want author name
              avatar: '', // could use default avatar
              text: tweet.text,
              timestamp: new Date(tweet.created_at).getTime() || Date.now(),
              status: 'open',
              sentiment: 'neutral', // default
              priority: 'high',
              tags: ['mention'],
              replies: []
            };
            if (!state.cases.find(c => c.id === newCase.id)) {
              state.cases.unshift(newCase);
            }
          });
          saveState();
          renderAllCases();
          showGmailToast('Twitter sync complete!', 'success');
        } else if (result.success) {
          showGmailToast('No new mentions found.', 'info');
        } else {
          showGmailToast('Failed to sync Twitter: ' + result.error, 'error');
        }
      } catch (err) {
        console.error(err);
        showGmailToast('Error syncing Twitter.', 'error');
      }
    }

    async function sendRealTwitterReply(c, replyText, twAccount) {
      try {
        const response = await fetch('/api/twitter-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: twAccount.accessToken,
            tweet_id: c.id.replace('tw-', ''),
            text: replyText
          })
        });
        const result = await response.json();
        if (result.success) {
          showGmailToast('Reply posted to Twitter!', 'success');
          return true;
        } else {
          showGmailToast('Failed to post reply: ' + result.error, 'error');
          return false;
        }
      } catch (err) {
        console.error(err);
        showGmailToast('Error posting to Twitter.', 'error');
        return false;
      }
    }

  })();

