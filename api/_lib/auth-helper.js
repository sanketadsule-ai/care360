const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'carapal360-dev-secret';

// Extracts and verifies the Bearer token. On failure it sends a 401/403 and
// returns null so callers can simply `if (!user) return;`.
function verifyAuth(req, res) {
  const header = req.headers['authorization'] || req.headers['Authorization'] || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  let payload;
  try {
    payload = jwt.verify(match[1], JWT_SECRET);
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return null;
  }

  // Only approved accounts may reach protected resources.
  if (payload.status !== 'approved') {
    res.status(403).json({ error: 'Account is not approved' });
    return null;
  }

  return { id: payload.id, email: payload.email, role: payload.role, status: payload.status };
}

function verifyAdmin(req, res) {
  const user = verifyAuth(req, res);
  if (!user) return null; // response already sent

  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }
  return user;
}

module.exports = {
  verifyAuth,
  verifyAdmin
};
