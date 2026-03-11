const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "almeer_music_secret_key_2024";

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.id, email: decoded.email, username: decoded.username, role: decoded.role };
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = { id: decoded.id, email: decoded.email, username: decoded.username, role: decoded.role };
    } catch (e) {}
  }
  next();
}

module.exports = { generateToken, authMiddleware, optionalAuth };
