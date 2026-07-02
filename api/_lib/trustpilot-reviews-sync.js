const { getPool, ensureTables } = require('./db');
const { analyzeReview } = require('./llm');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const errors = [];

  try {
    await ensureTables();
    const pool = getPool();

    // In a multi-tenant environment, req.orgId would be passed or derived from auth.
    // For now, we query the seed organization.
    const orgRes = await pool.query("SELECT id FROM organizations WHERE slug = 'carepal360'");
    if (orgRes.rows.length === 0) {
        return res.status(200).json({ success: true, synced_count: 0, errors: errors });
    }
    const orgId = orgRes.rows[0].id;
    
    // Set RLS bypass
    await pool.query("SET LOCAL app.current_org_id = ''");

    // Ensure a Trustpilot channel exists in channels table
    let channelId;
    const channelRes = await pool.query("SELECT id FROM channels WHERE platform='trustpilot' LIMIT 1");
    if (channelRes.rows.length > 0) {
      channelId = channelRes.rows[0].id;
    } else {
      const insertChannel = await pool.query(
        "INSERT INTO channels (organization_id, platform, external_id, display_name) VALUES ($1, 'trustpilot', 'trustpilot_legacy', 'Trustpilot') RETURNING id",
        [orgId]
      );
      channelId = insertChannel.rows[0].id;
    }

    let totalSaved = 0;

    try {
      // In a real Vercel environment, this would call a real Trustpilot API.
      // For local testing, we hit the Python scraper running on port 8080.
      const fetch = require('node-fetch'); // Ensure node-fetch is available if needed in Vercel
      
      // Fallback url logic just in case it runs on Vercel vs Local
      const localScraperUrl = process.env.SCRAPER_URL || 'http://localhost:8080/api/trustpilot-reviews';
      
      const revRes = await fetch(localScraperUrl);
      
      if (!revRes.ok) {
        throw new Error(`Failed to fetch reviews: ${revRes.statusText}`);
      }

      const revData = await revRes.json();
      const reviews = revData.data || [];

      for (const mockRev of reviews) {
        let ratingInt = 5;
        if (mockRev.rating && !isNaN(parseInt(mockRev.rating))) {
          ratingInt = parseInt(mockRev.rating);
        }

        // Run the Azure OpenAI analysis on the review comment
        const escalation = await analyzeReview(mockRev.comment || '');

        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          
          const uniqueId = mockRev.review_id;
          const authorName = mockRev.author_name || 'Anonymous User';
          const heading = mockRev.heading || '';
          const comment = mockRev.comment || '';
          const receivedAt = mockRev.received_at ? new Date(mockRev.received_at) : new Date();
          const platformUserId = authorName.toLowerCase().replace(/ /g, '_') + '_' + uniqueId;

          // Insert Contact
          const contactRes = await client.query(`
            INSERT INTO contacts (channel_id, platform_user_id, name)
            VALUES ($1, $2, $3)
            ON CONFLICT (channel_id, platform_user_id) DO UPDATE SET updated_at = NOW()
            RETURNING id
          `, [channelId, platformUserId, authorName]);
          const contactId = contactRes.rows[0].id;

          // Insert Conversation
          const convRes = await client.query(`
            INSERT INTO conversations (organization_id, channel_id, platform_thread_id, title, platform, type, status, priority, next_action, department, user_type, platform_created_at, created_at)
            VALUES ($1, $2, $3, $4, 'trustpilot', 'Review', 'open', $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (channel_id, platform_thread_id) DO UPDATE SET
              title = EXCLUDED.title,
              priority = EXCLUDED.priority,
              next_action = EXCLUDED.next_action,
              department = EXCLUDED.department,
              user_type = EXCLUDED.user_type,
              updated_at = NOW()
            RETURNING id
          `, [orgId, channelId, uniqueId, heading, escalation.priority, escalation.next_action, escalation.department, escalation.user_type, receivedAt]);
          const convId = convRes.rows[0].id;

          // Insert Message
          await client.query(`
            INSERT INTO messages (conversation_id, contact_id, sender_type, visibility, content, platform_message_id, rating, status, platform_created_at, created_at)
            VALUES ($1, $2, 'customer', 'public', $3, $4, $5, 'received', $6, NOW())
            ON CONFLICT (conversation_id, platform_message_id) DO UPDATE SET
              content = EXCLUDED.content,
              rating = EXCLUDED.rating
          `, [convId, contactId, comment, uniqueId, ratingInt, receivedAt]);

          await client.query('COMMIT');
          totalSaved++;
        } catch (insertErr) {
          await client.query('ROLLBACK');
          errors.push({ review_id: mockRev.review_id, error: insertErr.message });
        } finally {
          client.release();
        }
      }
    } catch (err) {
      console.error('Error processing Trustpilot sync:', err);
      errors.push(err.message);
    }

    return res.status(200).json({ success: true, synced_count: totalSaved, errors: errors });

  } catch (error) {
    console.error('trustpilot-reviews-sync error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message, errors: errors });
  }
};
