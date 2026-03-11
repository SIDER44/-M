// db/database.js - Using NeDB (no compilation needed, works on Railway)
const Datastore = require("nedb");
const path = require("path");
const bcrypt = require("bcryptjs");

const dbPath = process.env.DB_PATH || path.join(__dirname);

// Create all databases
const db = {
  users: new Datastore({ filename: path.join(dbPath, "users.db"), autoload: true }),
  playlists: new Datastore({ filename: path.join(dbPath, "playlists.db"), autoload: true }),
  playlist_songs: new Datastore({ filename: path.join(dbPath, "playlist_songs.db"), autoload: true }),
  favorites: new Datastore({ filename: path.join(dbPath, "favorites.db"), autoload: true }),
  history: new Datastore({ filename: path.join(dbPath, "history.db"), autoload: true })
};

// Create indexes
db.users.ensureIndex({ fieldName: "email", unique: true });
db.users.ensureIndex({ fieldName: "username", unique: true });
db.favorites.ensureIndex({ fieldName: "user_id" });
db.history.ensureIndex({ fieldName: "user_id" });
db.playlists.ensureIndex({ fieldName: "user_id" });
db.playlist_songs.ensureIndex({ fieldName: "playlist_id" });

// Helper: promisify NeDB operations
function findOne(collection, query) {
  return new Promise((resolve, reject) => {
    db[collection].findOne(query, (err, doc) => {
      if (err) reject(err);
      else resolve(doc);
    });
  });
}

function find(collection, query, sort = {}) {
  return new Promise((resolve, reject) => {
    db[collection].find(query).sort(sort).exec((err, docs) => {
      if (err) reject(err);
      else resolve(docs);
    });
  });
}

function insert(collection, doc) {
  return new Promise((resolve, reject) => {
    db[collection].insert(doc, (err, newDoc) => {
      if (err) reject(err);
      else resolve(newDoc);
    });
  });
}

function update(collection, query, updateDoc, options = {}) {
  return new Promise((resolve, reject) => {
    db[collection].update(query, updateDoc, options, (err, numReplaced) => {
      if (err) reject(err);
      else resolve(numReplaced);
    });
  });
}

function remove(collection, query, options = {}) {
  return new Promise((resolve, reject) => {
    db[collection].remove(query, options, (err, numRemoved) => {
      if (err) reject(err);
      else resolve(numRemoved);
    });
  });
}

function count(collection, query) {
  return new Promise((resolve, reject) => {
    db[collection].count(query, (err, n) => {
      if (err) reject(err);
      else resolve(n);
    });
  });
}

// Seed admin and demo users
async function seedUsers() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@almeermusic.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "Admin@1234";

    const existingAdmin = await findOne("users", { email: adminEmail });
    if (!existingAdmin) {
      const hashed = await bcrypt.hash(adminPassword, 10);
      await insert("users", {
        username: "admin",
        email: adminEmail,
        password: hashed,
        role: "admin",
        bio: "Site Administrator",
        is_active: true,
        created_at: new Date()
      });
      console.log("✅ Admin user seeded:", adminEmail);
    }

    const existingDemo = await findOne("users", { email: "demo@almeermusic.com" });
    if (!existingDemo) {
      const hashed = await bcrypt.hash("Demo@1234", 10);
      const demoUser = await insert("users", {
        username: "DemoUser",
        email: "demo@almeermusic.com",
        password: hashed,
        role: "user",
        bio: "Music lover 🎵",
        is_active: true,
        created_at: new Date()
      });
      await insert("playlists", {
        user_id: demoUser._id,
        name: "My Favorites",
        description: "Demo playlist",
        created_at: new Date()
      });
      console.log("✅ Demo user seeded: demo@almeermusic.com");
    }
  } catch (e) {
    console.log("Seed info:", e.message);
  }
}

async function initializeDatabase() {
  await seedUsers();
  console.log("✅ Database initialized successfully");
}

module.exports = {
  db,
  findOne,
  find,
  insert,
  update,
  remove,
  count,
  initializeDatabase
};
