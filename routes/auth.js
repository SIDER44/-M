const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const { findOne, find, insert, update, count } = require("../db/database");
const { generateToken, authMiddleware } = require("../middleware/auth");

// POST /api/auth/register
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

    const existingEmail = await findOne("users", { email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const existingUsername = await findOne("users", { username });
    if (existingUsername) {
      return res.status(400).json({ error: "Username already taken" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await insert("users", {
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: "user",
      bio: "",
      avatar: null,
      is_active: true,
      created_at: new Date(),
      last_login: null
    });

    // Create default playlist
    await insert("playlists", {
      user_id: newUser._id,
      name: "Liked Songs",
      description: "Your favorite tracks",
      created_at: new Date()
    });

    const token = generateToken({
      id: newUser._id,
      email: newUser.email,
      username: newUser.username,
      role: newUser.role
    });

    res.status(201).json({
      message: "Account created successfully!",
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (err) {
    console.error("Register error:", err);
    if (err.errorType === "uniqueViolated") {
      return res.status(400).json({ error: "Email or username already exists" });
    }
    res.status(500).json({ error: "Server error during registration" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await findOne("users", { email: email.toLowerCase() });
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

    await update("users", { _id: user._id }, { $set: { last_login: new Date() } });

    const token = generateToken({
      id: user._id,
      email: user.email,
      username: user.username,
      role: user.role
    });

    res.json({
      message: "Login successful!",
      token,
      user: {
        id: user._id,
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

// GET /api/auth/me
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await findOne("users", { _id: req.user.id });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const favCount = await count("favorites", { user_id: req.user.id });
    const playlistCount = await count("playlists", { user_id: req.user.id });

    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio,
      role: user.role,
      created_at: user.created_at,
      last_login: user.last_login,
      stats: {
        favorites: favCount,
        playlists: playlistCount,
        followers: 0,
        following: 0
      }
    });
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/auth/profile
router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { username, bio, avatar } = req.body;

    if (username && username.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }

    if (username) {
      const existing = await findOne("users", { username });
      if (existing && existing._id !== req.user.id) {
        return res.status(400).json({ error: "Username already taken" });
      }
    }

    const updateFields = {};
    if (username) updateFields.username = username;
    if (bio !== undefined) updateFields.bio = bio;
    if (avatar) updateFields.avatar = avatar;

    await update("users", { _id: req.user.id }, { $set: updateFields });
    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/auth/password
router.put("/password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Both passwords are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const user = await findOne("users", { _id: req.user.id });
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await update("users", { _id: req.user.id }, { $set: { password: hashed } });
    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
