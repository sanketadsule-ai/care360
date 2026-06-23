const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'carapal360-dev-secret';

function verifyAuth(req, res) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid token' });
    return null;
  }
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }
}

function verifyAdmin(req, res) {
  const user = verifyAuth(req, res);
  if (!user) return null;

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
