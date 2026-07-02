// Vercel Serverless Function: /api/user-profile
const { getPool, ensureTables } = require('./db');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { verifyAuth } = require('./auth-helper');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Require authentication
  const authUser = verifyAuth(req, res);
  if (!authUser) return; // response already sent

  let client;
  try {
    await ensureTables();
    const pool = getPool();

    if (req.method === 'GET') {
      client = await pool.connect();
      await client.query("BEGIN");
      
      // Set RLS bypass since we are in script/internal middleware context
      await client.query("SET LOCAL app.current_org_id = ''");

      // 2. Fetch the user profile from token ID
      const userRes = await client.query('SELECT * FROM users WHERE id = $1', [authUser.id]);
      if (userRes.rows.length === 0) {
        await client.query("COMMIT");
        return res.status(404).json({ error: 'User not found' });
      }
      const user = userRes.rows[0];

      // 3. Calculate unread counts
      // Count direct notifications
      const notifRes = await client.query('SELECT COUNT(*) as count FROM notifications WHERE recipient_user_id = $1 AND read_at IS NULL', [user.id]);
      const unreadNotifs = parseInt(notifRes.rows[0].count, 10) || 0;

      // Count open facebook messages/conversations
      let fbUnread = 0;
      try {
        const fbRes = await client.query("SELECT COUNT(*) as count FROM conversations WHERE platform = 'facebook' AND status = 'open' AND organization_id = $1 AND deleted_at IS NULL", [user.organization_id]);
        fbUnread = parseInt(fbRes.rows[0].count, 10) || 0;
      } catch(e) { /* ignore if table missing or error */ }

      // Count open email messages/conversations
      let emailUnread = 0;
      try {
        const emailRes = await client.query("SELECT COUNT(*) as count FROM conversations WHERE platform = 'gmail' AND status = 'open' AND organization_id = $1 AND deleted_at IS NULL", [user.organization_id]);
        emailUnread = parseInt(emailRes.rows[0].count, 10) || 0;
      } catch(e) { /* ignore if table missing or error */ }

      const totalUnread = unreadNotifs + fbUnread + emailUnread;

      await client.query("COMMIT");
      return res.status(200).json({
        success: true,
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          initials: user.initials,
          avatar_url: user.avatar_url,
          notification_count: totalUnread
        }
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    if (client) {
      try { await client.query("ROLLBACK"); } catch(e){}
    }
    console.error('user-profile error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    if (client) client.release();
  }
};
