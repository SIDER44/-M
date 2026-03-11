const Database = require("better-sqlite3");
const path = require("path");
const bcrypt = require("bcryptjs");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "almeer.db");

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

function initializeDatabase() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar TEXT DEFAULT NULL,
      bio TEXT DEFAULT '',
      role TEXT DEFAULT 'user',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME DEFAULT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      cover_url TEXT DEFAULT NULL,
      is_public INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS playlist_songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      track_id TEXT NOT NULL,
      track_name TEXT NOT NULL,
      artist_name TEXT NOT NULL,
      album_name TEXT DEFAULT '',
      cover_url TEXT DEFAULT '',
      preview_url TEXT DEFAULT '',
      duration INTEGER DEFAULT 0,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      track_id TEXT NOT NULL,
      track_name TEXT NOT NULL,
      artist_name TEXT NOT NULL,
      album_name TEXT DEFAULT '',
      cover_url TEXT DEFAULT '',
      preview_url TEXT DEFAULT '',
      duration INTEGER DEFAULT 0,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, track_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      track_id TEXT NOT NULL,
      track_name TEXT NOT NULL,
      artist_name TEXT NOT NULL,
      cover_url TEXT DEFAULT '',
      preview_url TEXT DEFAULT '',
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS follows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      follower_id INTEGER NOT NULL,
      following_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(follower_id, following_id),
      FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  seedAdminUser(database);
  seedDemoUser(database);

  console.log("✅ Database initialized successfully");
  return database;
}

function seedAdminUser(database) {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@almeermusic.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin@1234";

  const existing = database
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(adminEmail);
  if (!existing) {
    const hashed = bcrypt.hashSync(adminPassword, 10);
    database
      .prepare("INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)")
      .run("admin", adminEmail, hashed, "admin");
    console.log(`✅ Admin user seeded: ${adminEmail}`);
  }
}

function seedDemoUser(database) {
  const demoEmail = "demo@almeermusic.com";
  const existing = database
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(demoEmail);
  if (!existing) {
    const hashed = bcrypt.hashSync("Demo@1234", 10);
    const result = database
      .prepare("INSERT INTO users (username, email, password, bio) VALUES (?, ?, ?, ?)")
      .run("DemoUser", demoEmail, hashed, "Music lover 🎵");

    database
      .prepare("INSERT INTO playlists (user_id, name, description) VALUES (?, ?, ?)")
      .run(result.lastInsertRowid, "My Favorites", "Demo playlist");
    console.log(`✅ Demo user seeded: ${demoEmail}`);
  }
}

module.exports = { getDb, initializeDatabase };
