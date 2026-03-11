const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const { getDb } = require("../db/database");
const { generateToken, authMiddleware } = require("../middleware/auth");

router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const db = getDb();

    const existingEmail = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existingEmail) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const existingUsername = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existingUsername) {
      return res.status(400).json({ error: "Username already taken" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)"
    ).run(username, email.toLowerCase(), hashedPassword);

    db.prepare(
      "INSERT INTO playlists (user_id, name, description) VALUES (?, ?, ?)"
    ).run(result.lastInsertRowid, "Liked Songs", "Your favorite tracks");

    const newUser = db.prepare(
      "SELECT id, username, email, role, created_at FROM users WHERE id = ?"
    ).get(result.lastInsertRowid);

    const token = generateToken(newUser);

    res.status(201).json({
      message: "Account created successfully!",
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error during registration" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const db = getDb();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: "Account has been deactivated" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    db.prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

    const token = generateToken(user);

    res.json({
      message: "Login successful!",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error during login" });
  }
});

router.get("/me", authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare(
      "SELECT id, username, email, avatar, bio, role, created_at, last_login FROM users WHERE id = ?"
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const favCount = db.prepare("SELECT COUNT(*) as count FROM favorites WHERE user_id = ?").get(req.user.id);
    const playlistCount = db.prepare("SELECT COUNT(*) as count FROM playlists WHERE user_id = ?").get(req.user.id);
    const followersCount = db.prepare("SELECT COUNT(*) as count FROM follows WHERE following_id = ?").get(req.user.id);
    const followingCount = db.prepare("SELECT COUNT(*) as count FROM follows WHERE follower_id = ?").get(req.user.id);

    res.json({
      ...user,
      stats: {
        favorites: favCount.count,
        playlists: playlistCount.count,
        followers: followersCount.count,
        following: followingCount.count
      }
    });
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { username, bio, avatar } = req.body;
    const db = getDb();

    if (username && username.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }

    if (username) {
      const existing = db.prepare(
        "SELECT id FROM users WHERE username = ? AND id != ?"
      ).get(username, req.user.id);
      if (existing) {
        return res.status(400).json({ error: "Username already taken" });
      }
    }

    db.prepare(
      "UPDATE users SET username = COALESCE(?, username), bio = COALESCE(?, bio), avatar = COALESCE(?, avatar) WHERE id = ?"
    ).run(username || null, bio !== undefined ? bio : null, avatar || null, req.user.id);

    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Both passwords are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const db = getDb();
    const user = db.prepare("SELECT password FROM users WHERE id = ?").get(req.user.id);
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashed, req.user.id);
    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
