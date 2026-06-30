const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getPool, ensureTables } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'carapal360-dev-secret';

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

// Maps a non-approved account status to a meaningful HTTP response. Returns
// null when the account is approved and may proceed to token issuance.
function statusGate(user, res) {
  if (user.status === 'approved') return null;

  if (user.status === 'pending') {
    return res.status(403).json({
      error: 'Your account is pending administrator approval.',
      status: 'pending',
      user: { name: user.name, email: user.email, status: user.status }
    });
  }
  if (user.status === 'rejected') {
    return res.status(403).json({
      error: 'Your access request has been rejected. Please contact an administrator.',
      status: 'rejected',
      user: { name: user.name, email: user.email, status: user.status }
    });
  }
  if (user.status === 'disabled') {
    return res.status(403).json({
      error: 'Your account has been disabled. Please contact an administrator.',
      status: 'disabled',
      user: { name: user.name, email: user.email, status: user.status }
    });
  }
  return res.status(403).json({
    error: 'Your account is not allowed to access the system.',
    status: user.status,
    user: { name: user.name, email: user.email, status: user.status }
  });
}

// Verifies a Google ID token (credential) against Google's tokeninfo endpoint
// and returns the decoded profile, or null when invalid. Dependency-free.
async function verifyGoogleIdToken(idToken) {
  try {
    const resp = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    if (!resp.ok) return null;
    const payload = await resp.json();
    // tokeninfo returns email, name, picture, sub (google id), email_verified
    if (!payload || !payload.email) return null;
    return payload;
  } catch (e) {
    console.error('Google token verification failed:', e.message);
    return null;
  }
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await ensureTables();
    const { action, email, password, name, credential } = req.body;

    const pool = getPool();

    // ── Google Sign-In ────────────────────────────────────────────────
    // First-time Google users are created as PENDING (no token issued).
    // Existing users are linked and may log in only when approved.
    if (action === 'google') {
      if (!credential) {
        return res.status(400).json({ error: 'Missing Google credential' });
      }
      const profile = await verifyGoogleIdToken(credential);
      if (!profile) {
        return res.status(401).json({ error: 'Invalid Google credential' });
      }

      const gEmail = (profile.email || '').toLowerCase();
      const gName = profile.name || gEmail.split('@')[0];
      const gAvatar = profile.picture || '';
      const gId = profile.sub || null;

      const existingRes = await pool.query('SELECT * FROM users WHERE email = $1', [gEmail]);
      let gUser = existingRes.rows[0];

      if (!gUser) {
        // Scenario 5 — create a pending record, store profile, issue no token.
        const initials = gName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const insertRes = await pool.query(
          `INSERT INTO users (email, name, initials, avatar_url, role, status, provider, google_id, updated_at)
             VALUES ($1, $2, $3, $4, 'user', 'pending', 'google', $5, NOW()) RETURNING *`,
          [gEmail, gName, initials, gAvatar, gId]
        );
        gUser = insertRes.rows[0];
        return res.status(202).json({
          pending: true,
          status: 'pending',
          message: 'Your account request has been submitted successfully. Please wait for administrator approval before accessing the system.',
          user: { name: gUser.name, email: gUser.email, status: gUser.status }
        });
      }

      // Scenario 6 — link Google to the existing account (keep email unique).
      if (!gUser.google_id) {
        const linkRes = await pool.query(
          `UPDATE users SET google_id = $1, avatar_url = COALESCE(NULLIF($2, ''), avatar_url),
             provider = CASE WHEN provider = 'email' THEN 'google,email' ELSE provider END,
             updated_at = NOW() WHERE id = $3 RETURNING *`,
          [gId, gAvatar, gUser.id]
        );
        gUser = linkRes.rows[0];
      }

      const gated = statusGate(gUser, res);
      if (gated) return gated;

      await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [gUser.id]);
      const gToken = jwt.sign(
        { id: gUser.id, email: gUser.email, role: gUser.role, status: gUser.status },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.status(200).json({ success: true, token: gToken, user: gUser });
    }

    if (!action || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    let user = userRes.rows[0];

    if (action === 'register') {
      if (user) {
        // If user exists, update password if it's missing (for existing google users)
        if (!user.password_hash) {
            const salt = crypto.randomBytes(16).toString('hex');
            const passwordHash = hashPassword(password, salt);
            const updateRes = await pool.query('UPDATE users SET password_hash = $1, salt = $2, name = $3 WHERE id = $4 RETURNING *', [passwordHash, salt, name || user.name, user.id]);
            user = updateRes.rows[0];
        } else {
            return res.status(400).json({ error: 'User already exists' });
        }
      } else {
        if (!name) {
          return res.status(400).json({ error: 'Name is required for registration' });
        }

        // Generate salt and hash
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = hashPassword(password, salt);

        // Self-registered accounts start pending — only an Admin can approve
        // them. The initial admin is seeded separately (see db.js). One legacy
        // address is auto-promoted to an approved admin for continuity.
        const isLegacyAdmin = (email.toLowerCase() === 'sanket.adsule@impactguru.com');
        const role = isLegacyAdmin ? 'admin' : 'user';
        const status = isLegacyAdmin ? 'approved' : 'pending';

        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        const insertRes = await pool.query(
          `INSERT INTO users (email, name, initials, avatar_url, role, status, provider, password_hash, salt, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, 'email', $7, $8, NOW()) RETURNING *`,
          [email, name, initials, '', role, status, passwordHash, salt]
        );
        user = insertRes.rows[0];
      }
    } else if (action === 'login') {
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      
      // If user exists but has no password (e.g., from old Google login), they can't login via password yet
      if (!user.salt || !user.password_hash) {
        return res.status(401).json({ error: 'Account not set up for password login. Please register again with the same email.' });
      }

      const hash = hashPassword(password, user.salt);
      if (hash !== user.password_hash) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    // Verify account status before issuing any token (pending / rejected /
    // disabled all stop here with a meaningful message).
    const gated = statusGate(user, res);
    if (gated) return gated;

    // Record successful login (password flow). Registration also lands here,
    // approved-on-create accounts included.
    if (action === 'login') {
      await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, status: user.status },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({ success: true, token, user });

  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message, stack: err.stack });
  }
};
