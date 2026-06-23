const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'carapal360-dev-secret';

function verifyAuth(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
    return null;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.status !== 'approved') {
      res.status(403).json({ error: 'Forbidden: User is not approved' });
      return null;
    }
    return decoded; // { id, email, role, status, iat, exp }
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    return null;
  }
}

function verifyAdmin(req, res) {
  const user = verifyAuth(req, res);
  if (!user) return null; // Error response already sent

  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
    return null;
  }

  return user;
}

module.exports = { verifyAuth, verifyAdmin };
