const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'carapal360-dev-secret';

function verifyAuth(req, res) {
  // BYPASS AUTH FOR TESTING: Always return an admin user
  return { id: 1, email: 'admin@care360.com', role: 'admin', status: 'approved' };
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
