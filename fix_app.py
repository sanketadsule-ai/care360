import os
import sys
import re

app_js_path = os.path.join('c:\\', 'Users', '6451', 'Documents', 'care360', 'care360', 'app.js')

if not os.path.exists(app_js_path):
    print(f"Error: Could not find {app_js_path}")
    sys.exit(1)

with open(app_js_path, 'r', encoding='utf-8') as f:
    content = f.read()

# We need to find the point where it got corrupted and replace everything after it.
# The corruption starts somewhere around "const refreshBtn = document.querySelector('.filter-action-btn[title=\"Refresh\"]');"
# Let's find this string and truncate everything after it, then append the full correct code.

anchor = "    const refreshBtn = document.querySelector('.filter-action-btn[title=\"Refresh\"]');"
idx = content.find(anchor)

if idx == -1:
    print("Error: Could not find the anchor point in app.js. The file might be corrupted differently.")
    sys.exit(1)

# Truncate content up to the anchor
content = content[:idx]

# Append the full correct ending code
correct_ending = """    const refreshBtn = document.querySelector('.filter-action-btn[title="Refresh"]');
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

          const gbPages = dbAccounts.filter(x => x.platform === 'google_business');
          if (gbPages.length > 0) {
            const gbGrid = document.createElement('div');
            gbGrid.className = 'fb-pages-grid';
            gbPages.forEach(pp => {
              const card = buildPageCard(pp);
              gbGrid.appendChild(card);
            });
            const gbPanel = document.getElementById('google-business-panel');
            if (gbPanel) gbPanel.appendChild(gbGrid);
            const gbStatus = document.getElementById('google-business-status');
            if (gbStatus) {
              gbStatus.textContent = 'Restored from Database';
              gbStatus.style.display = '';
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
      fetch('/api/facebook-messages').then(r => r.json()),
      fetch('/api/google-reviews').then(r => r.json()),
      fetch('/api/trustpilot-reviews').then(r => r.json())
    ])
    .then(([platformData, fbData, gbData, tpData]) => {
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
              avatarGradient: AVATAR_GRADIENTS[Math.abs(hashCode(dbMsg.sender_email || dbMsg.sender_name || '')) % AVATAR_GRADIENTS.length],
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
                sender: dbMsg.sender_email ? `${dbMsg.sender_name || ''} <${dbMsg.sender_email}>` : (dbMsg.sender_name || 'Unknown'),
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

      // Process Google Reviews
      if (gbData && gbData.success && gbData.data && gbData.data.length > 0) {
        gbData.data.forEach(gbMsg => {
          if (gbMsg.review_id && !existingIds.has(gbMsg.review_id)) {
            state.cases.push({
              id: gbMsg.review_id,
              gbReviewId: gbMsg.review_id,
              source: 'Google Business',
              author: gbMsg.author_name,
              authorName: gbMsg.author_name,
              channel: 'google_business',
              avatarGradient: AVATAR_GRADIENTS[Math.abs(hashCode(gbMsg.author_name || '')) % AVATAR_GRADIENTS.length],
              text: (gbMsg.rating ? `[${gbMsg.rating} Stars] ` : '') + (gbMsg.comment || '').substring(0, 120),
              createdTime: gbMsg.received_at || gbMsg.created_at,
              type: 'Review',
              status: gbMsg.status === 'open' ? 'Open' : 'Closed',
              priority: 'High',
              assignedTo: 'Unassigned',
              emailSubject: 'Google Review: ' + gbMsg.rating + ' Stars',
              emailAttachments: [],
              messages: [{
                id: 'gb-db-' + gbMsg.id,
                sender: gbMsg.author_name || 'Google User',
                text: `Rating: ${gbMsg.rating} Stars\\n\\n${gbMsg.comment || ''}`,
                timestamp: gbMsg.received_at || gbMsg.created_at,
                isAgent: false
              }]
            });
            existingIds.add(gbMsg.review_id);
            addedCount++;
          }
        });
      }

      // Process Trustpilot Reviews
      // First, remove old trustpilot cases from state to ensure clean reload with correct ratings
      state.cases = state.cases.filter(c => c.channel !== 'trustpilot');
      // Re-calculate existingIds after filtering
      const updatedExistingIds = new Set(state.cases.map(c => c.gmailMessageId || c.fbPostId || c.id).filter(Boolean));

      if (tpData && tpData.success && tpData.data && tpData.data.length > 0) {
        tpData.data.forEach(tpMsg => {
          if (tpMsg.review_id && !updatedExistingIds.has(tpMsg.review_id)) {
            state.cases.push({
              id: tpMsg.review_id,
              tpReviewId: tpMsg.review_id,
              source: 'Trustpilot',
              author: tpMsg.author_name,
              authorName: tpMsg.author_name,
              channel: 'trustpilot',
              rating: tpMsg.rating,
              avatarGradient: AVATAR_GRADIENTS[Math.abs(hashCode(tpMsg.author_name || '')) % AVATAR_GRADIENTS.length],
              text: (tpMsg.rating ? `[${tpMsg.rating} Stars] ` : '') + (tpMsg.heading && tpMsg.heading !== "N/A" ? `${tpMsg.heading} - ` : '') + (tpMsg.comment || '').substring(0, 120),
              createdTime: tpMsg.received_at || new Date().toISOString(),
              type: 'Review',
              status: tpMsg.status === 'open' ? 'Open' : 'Closed',
              priority: 'High',
              assignedTo: 'Unassigned',
              emailSubject: (tpMsg.heading || 'Trustpilot Review') + ': ' + tpMsg.rating + ' Stars',
              emailAttachments: [],
              messages: [{
                id: 'tp-db-' + tpMsg.id,
                sender: tpMsg.author_name || 'Trustpilot User',
                text: `Heading: ${tpMsg.heading}\\nRating: ${tpMsg.rating} Stars\\n\\n${tpMsg.comment || ''}`,
                timestamp: tpMsg.received_at || new Date().toISOString(),
                isAgent: false
              }]
            });
            existingIds.add(tpMsg.review_id);
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
    renderConnectedTwitterAccounts();
    if (state.connectedAccounts.length > 0) {
      startEmailSyncLoop();
    }
    // Auto-sync Twitter on page load if connected
    const hasTwitter = state.connectedAccounts.find(x => x.channel === 'twitter');
    if (hasTwitter) {
      console.log('Auto-syncing Twitter on page load...');
      setTimeout(() => generateIncomingTwitterMentions(), 1500);
    }
    
    // Auto-sync Facebook on page load if connected
    const hasFacebook = state.connectedAccounts.find(x => x.channel === 'facebook' || x.platform === 'facebook');
    if (hasFacebook) {
      console.log('Auto-syncing Facebook on page load...');
      setTimeout(() => {
        fetch('/api/facebook-sync')
          .then(r => r.json())
          .then(data => {
            if (data.success && data.synced_count > 0) {
              // Refresh Facebook cases from DB
              fetch('/api/facebook-messages')
                .then(r => r.json())
                .then(fbData => {
                  if (fbData.success && fbData.data) {
                    const existingIds = new Set(state.cases.map(c => c.fbPostId || c.id).filter(Boolean));
                    let added = 0;
                    fbData.data.forEach(fbMsg => {
                      if (fbMsg.fb_post_id && !existingIds.has(fbMsg.fb_post_id)) {
                        state.cases.push({
                          id: fbMsg.fb_post_id,
                          fbPostId: fbMsg.fb_post_id,
                          source: 'Facebook Page',
                          author: fbMsg.author_name,
                          authorName: fbMsg.author_name,
                          channel: 'facebook',
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
                        added++;
                      }
                    });
                    if (added > 0) {
                      state.cases.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
                      saveState();
                      renderAllCases();
                      console.log(`Auto-synced ${added} new Facebook messages.`);
                    }
                  }
                });
            }
          })
          .catch(console.error);
      }, 2000);
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
      renderConnectedTwitterAccounts(); // re-render the connected accounts list
      
      // Save Twitter channel to database (will fail locally if server.py doesn't handle POST /api/connected-channels, which is fine)
      fetch('/api/connected-channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'twitter',
          account_email: account.username,
          account_name: account.name || ('@' + account.username),
          avatar_url: account.profile_image_url || '', 
          access_token: '' // handled by .env securely
        })
      })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          showGmailToast('Twitter account connected & saved to DB!', 'success');
        }
      })
      .catch(err => console.log('Skipping DB save (local mode)', err));
      
      // trigger a sync
      generateIncomingTwitterMentions();
    };

    async function generateIncomingTwitterMentions() {
      if (state.connectedAccounts.length === 0) return;
      const twAccount = state.connectedAccounts.find(x => x.channel === 'twitter');
      if (!twAccount) return;
      
      showGmailToast('Syncing fresh mentions from Twitter...', 'info');
      try {
        if (window.CarapalTwitter) {
          const syncData = await window.CarapalTwitter.sync();
          let combined = [];
          if (syncData.tweets && syncData.tweets.length > 0) {
            combined = combined.concat(syncData.tweets);
          }
          if (syncData.mentions && syncData.mentions.length > 0) {
            combined = combined.concat(syncData.mentions);
          }
          
          if (combined.length === 0) {
            showGmailToast('No new tweets or mentions found.', 'info');
          } else {
            combined.forEach(tweet => {
              // map tweet to case
              const newCase = {
                id: 'tw-' + tweet.id,
                channel: 'twitter',
                author: tweet.author_id || twAccount.username,
                username: tweet.author_id || twAccount.username,
                avatar: '', // could use default avatar
                text: tweet.text,
                timestamp: new Date(tweet.created_at).getTime() || Date.now(),
                status: 'open',
                sentiment: 'neutral', // default
                priority: 'high',
                tags: ['tweet'],
                replies: []
              };
              if (!state.cases.find(c => c.id === newCase.id)) {
                state.cases.unshift(newCase);
              }
            });
            saveState();
            renderAllCases();
            showGmailToast('Twitter sync complete!', 'success');
          }
        } else {
          showGmailToast('Failed to sync Twitter.', 'error');
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


    // ── Fetch User Profile & Notifications ────────────────
    async function fetchUserProfile() {
      try {
        const res = await fetch('/api/user-profile');
        const data = await res.json();
        if (data.success && data.data) {
          const initialsSpan = document.getElementById('header-user-initials');
          const notifBadge = document.getElementById('header-notif-badge');
          const dropName = document.getElementById('dropdown-user-name');
          const dropEmail = document.getElementById('dropdown-user-email');
          
          if (initialsSpan) initialsSpan.textContent = data.data.initials;
          if (notifBadge) notifBadge.textContent = data.data.notification_count;
          if (dropName) dropName.textContent = data.data.name;
          if (dropEmail) dropEmail.textContent = data.data.email;
        }
      } catch (err) {
        console.error('Failed to fetch user profile:', err);
      }
    }

    // Call on load
    fetchUserProfile();

    // Profile Dropdown Toggle
    const userAvatar = document.getElementById('user-avatar');
    const profileDropdown = document.getElementById('profile-dropdown');
    
    if (userAvatar && profileDropdown) {
      userAvatar.addEventListener('click', (e) => {
        e.stopPropagation();
        if (profileDropdown.style.display === 'none') {
          profileDropdown.style.display = 'block';
        } else {
          profileDropdown.style.display = 'none';
        }
      });
      
      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!profileDropdown.contains(e.target) && e.target !== userAvatar) {
          profileDropdown.style.display = 'none';
        }
      });
    }

    // ── Admin User Management ──────────────────────────────
    window.loadAdminUsers = async function() {
      const tbody = document.getElementById('admin-users-list');
      if (!tbody) return;
      
      try {
        const res = await window.fetch('/api/admin-users');
        const data = await res.json();
        
        if (data.success && data.users) {
          tbody.innerHTML = '';
          if (data.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #6B7280; font-size: 14px;">No pending or standard users found.</td></tr>';
            return;
          }
          
          data.users.forEach(user => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #E5E7EB';
            
            const actionHtml = user.status === 'pending' ? `
              <button onclick="handleUserAction('${user.id}', 'approve')" style="background: #10B981; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 6px;">Approve</button>
              <button onclick="handleUserAction('${user.id}', 'reject')" style="background: #EF4444; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Reject</button>
            ` : `
              <span style="font-size: 12px; color: #6B7280;">N/A</span>
            `;
            
            const statusColor = user.status === 'pending' ? '#F59E0B' : (user.status === 'approved' ? '#10B981' : '#EF4444');
            
            tr.innerHTML = `
              <td style="padding: 12px 16px; font-size: 14px; color: #111827;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 24px; height: 24px; border-radius: 50%; background: #E5E7EB; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; overflow: hidden;">
                    ${user.avatar_url ? `<img src="${user.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;">` : user.initials}
                  </div>
                  ${user.name}
                </div>
              </td>
              <td style="padding: 12px 16px; font-size: 14px; color: #4B5563;">${user.email}</td>
              <td style="padding: 12px 16px; font-size: 14px;"><span style="color: ${statusColor}; font-weight: 500; text-transform: capitalize;">${user.status}</span></td>
              <td style="padding: 12px 16px; font-size: 14px;">${actionHtml}</td>
            `;
            tbody.appendChild(tr);
          });
          
          // Update pending count badge
          const pendingCountBadge = document.getElementById('pending-count-badge');
          if (pendingCountBadge) {
            const pendingCount = data.users.filter(u => u.status === 'pending').length;
            if (pendingCount > 0) {
              pendingCountBadge.textContent = `${pendingCount} pending`;
              pendingCountBadge.style.display = 'inline-block';
            } else {
              pendingCountBadge.style.display = 'none';
            }
          }
        }
      } catch (err) {
        console.error('Failed to load admin users:', err);
        tbody.innerHTML = '<tr><td colspan="4" style="padding: 16px; text-align: center; color: #EF4444; font-size: 14px;">Failed to load users.</td></tr>';
      }
    };
    
    window.handleUserAction = async function(userId, action) {
      if (!confirm(`Are you sure you want to ${action} this user?`)) return;
      
      try {
        const res = await window.fetch('/api/admin-users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, action })
        });
        const data = await res.json();
        if (data.success) {
          alert(`User ${action}d successfully`);
          window.loadAdminUsers();
        } else {
          alert(data.error || 'Failed to update user');
        }
      } catch (err) {
        alert('An error occurred');
      }
    };

  // ══════════════════════════════════════════════════════
  // CENTRAL DASHBOARD / STATS LOGIC
  // ══════════════════════════════════════════════════════
  
  const statsSidebarItem = document.querySelector('.sidebar-item[data-page="stats"]');
  const statsFilterChannel = document.getElementById('stats-filter-channel');
  const statsFilterDate = document.getElementById('stats-filter-date');

  function renderStatsDashboard() {
    if (!document.getElementById('page-stats').classList.contains('active')) return;

    const channelFilter = statsFilterChannel ? statsFilterChannel.value : 'all';
    const dateFilter = statsFilterDate ? statsFilterDate.value : 'all';

    let filteredCases = state.cases || [];

    // Filter by Channel
    if (channelFilter !== 'all') {
      filteredCases = filteredCases.filter(c => c.channel && c.channel.toLowerCase() === channelFilter.toLowerCase());
    }

    // Filter by Date
    const now = new Date();
    if (dateFilter !== 'all') {
      filteredCases = filteredCases.filter(c => {
        if (!c.createdTime) return false;
        const caseDate = new Date(c.createdTime);
        if (isNaN(caseDate)) return true; // Keep if invalid date to be safe

        const diffTime = Math.abs(now - caseDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

        if (dateFilter === 'today') return diffDays <= 1;
        if (dateFilter === '7days') return diffDays <= 7;
        if (dateFilter === '30days') return diffDays <= 30;
        return true;
      });
    }

    // Calculate Metrics
    const totalCases = filteredCases.length;
    let pendingCases = 0;
    let resolvedCases = 0;
    const channelCounts = {};

    filteredCases.forEach(c => {
      if (c.status === 'Open' || c.status === 'Pending') pendingCases++;
      if (c.status === 'Resolved' || c.status === 'Closed') resolvedCases++;

      const ch = c.channel ? c.channel.toLowerCase() : 'unknown';
      channelCounts[ch] = (channelCounts[ch] || 0) + 1;
    });

    // Update DOM Metrics
    const elTotal = document.getElementById('stats-val-total');
    const elOpen = document.getElementById('stats-val-open');
    const elResolved = document.getElementById('stats-val-resolved');
    const elChannels = document.getElementById('stats-val-channels');

    if (elTotal) elTotal.textContent = totalCases;
    if (elOpen) elOpen.textContent = pendingCases;
    if (elResolved) elResolved.textContent = resolvedCases;
    if (elChannels) elChannels.textContent = Object.keys(channelCounts).length;

    // Render Channel Breakdown Bars
    const distContainer = document.getElementById('stats-distribution-container');
    if (distContainer) {
      distContainer.innerHTML = '';
      if (totalCases === 0) {
        distContainer.innerHTML = '<div style="color:var(--gray-500); font-size:14px;">No data available for the selected filters.</div>';
      } else {
        const sortedChannels = Object.entries(channelCounts).sort((a, b) => b[1] - a[1]);
        
        sortedChannels.forEach(([chName, count]) => {
          const percent = Math.round((count / totalCases) * 100);
          
          let displayLabel = chName;
          if (chName === 'facebook') displayLabel = 'Facebook';
          if (chName === 'instagram') displayLabel = 'Instagram';
          if (chName === 'twitter') displayLabel = 'Twitter';
          if (chName === 'google_business') displayLabel = 'Google Business';
          if (chName === 'google_play') displayLabel = 'Google Play';
          if (chName === 'trustpilot') displayLabel = 'Trustpilot';
          if (chName === 'gmail') displayLabel = 'Gmail';
          
          const wrapper = document.createElement('div');
          wrapper.className = 'stats-bar-wrapper';
          wrapper.innerHTML = `
            <div class="stats-bar-header">
              <div class="stats-bar-label">
                ${displayLabel}
              </div>
              <div class="stats-bar-count">${count} (${percent}%)</div>
            </div>
            <div class="stats-bar-track">
              <div class="stats-bar-fill" style="width: 0%"></div>
            </div>
          `;
          distContainer.appendChild(wrapper);

          // Animate the bar fill
          setTimeout(() => {
            const fill = wrapper.querySelector('.stats-bar-fill');
            if (fill) fill.style.width = percent + '%';
          }, 50);
        });
      }
    }
  }

  if (statsSidebarItem) {
    statsSidebarItem.addEventListener('click', () => {
      setTimeout(renderStatsDashboard, 10);
    });
  }

  if (statsFilterChannel) statsFilterChannel.addEventListener('change', renderStatsDashboard);
  if (statsFilterDate) statsFilterDate.addEventListener('change', renderStatsDashboard);

});
"""

content = content + correct_ending

with open(app_js_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully repaired app.js!")
