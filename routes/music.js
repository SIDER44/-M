const express = require("express");
const axios = require("axios");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const { getDb } = require("../db/database");

const ITUNES_BASE = "https://itunes.apple.com";
const DEEZER_BASE = "https://api.deezer.com";

function normalizeItunesTrack(t) {
  return {
    id: `itunes_${t.trackId}`,
    source: "itunes",
    track_name: t.trackName,
    artist_name: t.artistName,
    album_name: t.collectionName || "",
    cover_url: t.artworkUrl100?.replace("100x100", "300x300") || "",
    preview_url: t.previewUrl || "",
    duration: Math.round((t.trackTimeMillis || 0) / 1000),
    genre: t.primaryGenreName || "",
    release_date: t.releaseDate || "",
    external_url: t.trackViewUrl || ""
  };
}

function normalizeDeezerTrack(t) {
  return {
    id: `deezer_${t.id}`,
    source: "deezer",
    track_name: t.title,
    artist_name: t.artist?.name || "",
    album_name: t.album?.title || "",
    cover_url: t.album?.cover_medium || t.album?.cover || "",
    preview_url: t.preview || "",
    duration: t.duration || 0,
    genre: "",
    release_date: "",
    external_url: t.link || ""
  };
}

router.get("/search", async (req, res) => {
  const { q, limit = 20 } = req.query;
  if (!q) return res.status(400).json({ error: "Query is required" });

  try {
    const response = await axios.get(`${ITUNES_BASE}/search`, {
      params: { term: q, entity: "song", limit: Math.min(parseInt(limit), 50) },
      timeout: 8000
    });
    const tracks = (response.data.results || []).map(normalizeItunesTrack);
    res.json({ results: tracks, total: tracks.length });
  } catch (err) {
    res.status(500).json({ error: "Search failed", results: [] });
  }
});

router.get("/trending", async (req, res) => {
  try {
    const [deezerRes, itunesRes] = await Promise.allSettled([
      axios.get(`${DEEZER_BASE}/chart/0/tracks?limit=20`, { timeout: 8000 }),
      axios.get(`${ITUNES_BASE}/rss/topsongs/limit=20/json`, { timeout: 8000 })
    ]);

    let tracks = [];

    if (deezerRes.status === "fulfilled") {
      tracks = (deezerRes.value.data?.data || []).map(normalizeDeezerTrack);
    }

    if (tracks.length === 0 && itunesRes.status === "fulfilled") {
      const itunesData = itunesRes.value.data?.feed?.entry || [];
      tracks = itunesData.slice(0, 20).map((e, i) => ({
        id: `itunes_top_${i}`,
        source: "itunes",
        track_name: e["im:name"]?.label || "",
        artist_name: e["im:artist"]?.label || "",
        album_name: e["im:collection"]?.["im:name"]?.label || "",
        cover_url: e["im:image"]?.[2]?.label || "",
        preview_url: "",
        duration: 0,
        genre: e.category?.attributes?.label || ""
      }));
    }

    res.json({ results: tracks });
  } catch (err) {
    res.status(500).json({ error: "Failed to load trending", results: [] });
  }
});

router.get("/genre/:genre", async (req, res) => {
  const genreMap = {
    afrobeats: "afrobeats",
    hiphop: "hip+hop",
    pop: "pop",
    rnb: "r%26b",
    gospel: "gospel",
    jazz: "jazz",
    rock: "rock",
    electronic: "electronic",
    reggae: "reggae",
    classical: "classical"
  };

  const genre = genreMap[req.params.genre.toLowerCase()] || req.params.genre;

  try {
    const response = await axios.get(`${ITUNES_BASE}/search`, {
      params: { term: genre, entity: "song", limit: 20 },
      timeout: 8000
    });
    const tracks = (response.data.results || []).map(normalizeItunesTrack);
    res.json({ results: tracks, genre: req.params.genre });
  } catch (err) {
    res.status(500).json({ error: "Genre fetch failed", results: [] });
  }
});

router.get("/artist/:name", async (req, res) => {
  try {
    const response = await axios.get(`${ITUNES_BASE}/search`, {
      params: { term: req.params.name, entity: "song", limit: 20 },
      timeout: 8000
    });
    const tracks = (response.data.results || []).map(normalizeItunesTrack);
    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: "Artist fetch failed" });
  }
});

router.get("/favorites", authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const favorites = db.prepare(
      "SELECT * FROM favorites WHERE user_id = ? ORDER BY added_at DESC"
    ).all(req.user.id);
    res.json({ results: favorites });
  } catch (err) {
    res.status(500).json({ error: "Failed to load favorites" });
  }
});

router.post("/favorites", authMiddleware, (req, res) => {
  try {
    const { track_id, track_name, artist_name, album_name, cover_url, preview_url, duration } = req.body;
    if (!track_id || !track_name) {
      return res.status(400).json({ error: "track_id and track_name are required" });
    }

    const db = getDb();
    db.prepare(
      "INSERT OR IGNORE INTO favorites (user_id, track_id, track_name, artist_name, album_name, cover_url, preview_url, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(req.user.id, track_id, track_name, artist_name || "", album_name || "", cover_url || "", preview_url || "", duration || 0);

    res.json({ message: "Added to favorites" });
  } catch (err) {
    res.status(500).json({ error: "Failed to add favorite" });
  }
});

router.delete("/favorites/:trackId", authMiddleware, (req, res) => {
  try {
    const db = getDb();
    db.prepare("DELETE FROM favorites WHERE user_id = ? AND track_id = ?")
      .run(req.user.id, req.params.trackId);
    res.json({ message: "Removed from favorites" });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove favorite" });
  }
});

router.get("/history", authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const history = db.prepare(
      "SELECT * FROM history WHERE user_id = ? ORDER BY played_at DESC LIMIT 50"
    ).all(req.user.id);
    res.json({ results: history });
  } catch (err) {
    res.status(500).json({ error: "Failed to load history" });
  }
});

router.post("/history", authMiddleware, (req, res) => {
  try {
    const { track_id, track_name, artist_name, cover_url, preview_url } = req.body;
    if (!track_id) return res.status(400).json({ error: "track_id required" });

    const db = getDb();
    const count = db.prepare(
      "SELECT COUNT(*) as c FROM history WHERE user_id = ?"
    ).get(req.user.id);

    if (count.c >= 100) {
      db.prepare(
        "DELETE FROM history WHERE user_id = ? AND id = (SELECT id FROM history WHERE user_id = ? ORDER BY played_at ASC LIMIT 1)"
      ).run(req.user.id, req.user.id);
    }

    db.prepare(
      "INSERT INTO history (user_id, track_id, track_name, artist_name, cover_url, preview_url) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(req.user.id, track_id, track_name || "", artist_name || "", cover_url || "", preview_url || "");

    res.json({ message: "Recorded" });
  } catch (err) {
    res.status(500).json({ error: "Failed to record history" });
  }
});

router.get("/playlists", authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const playlists = db.prepare(`
      SELECT p.*, COUNT(ps.id) as song_count
      FROM playlists p
      LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
      WHERE p.user_id = ?
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all(req.user.id);
    res.json({ results: playlists });
  } catch (err) {
    res.status(500).json({ error: "Failed to load playlists" });
  }
});

router.post("/playlists", authMiddleware, (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: "Playlist name is required" });

    const db = getDb();
    const result = db.prepare(
      "INSERT INTO playlists (user_id, name, description) VALUES (?, ?, ?)"
    ).run(req.user.id, name, description || "");

    res.status(201).json({ message: "Playlist created", id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: "Failed to create playlist" });
  }
});

router.get("/playlists/:id", authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const playlist = db.prepare(
      "SELECT * FROM playlists WHERE id = ? AND user_id = ?"
    ).get(req.params.id, req.user.id);
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });

    const songs = db.prepare(
      "SELECT * FROM playlist_songs WHERE playlist_id = ? ORDER BY added_at DESC"
    ).all(req.params.id);
    res.json({ playlist, songs });
  } catch (err) {
    res.status(500).json({ error: "Failed to load playlist" });
  }
});

router.post("/playlists/:id/songs", authMiddleware, (req, res) => {
  try {
    const { track_id, track_name, artist_name, album_name, cover_url, preview_url, duration } = req.body;
    const db = getDb();

    const playlist = db.prepare(
      "SELECT id FROM playlists WHERE id = ? AND user_id = ?"
    ).get(req.params.id, req.user.id);
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });

    db.prepare(
      "INSERT INTO playlist_songs (playlist_id, track_id, track_name, artist_name, album_name, cover_url, preview_url, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(req.params.id, track_id, track_name || "", artist_name || "", album_name || "", cover_url || "", preview_url || "", duration || 0);

    res.json({ message: "Song added to playlist" });
  } catch (err) {
    res.status(500).json({ error: "Failed to add song" });
  }
});

router.delete("/playlists/:id/songs/:songId", authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const playlist = db.prepare(
      "SELECT id FROM playlists WHERE id = ? AND user_id = ?"
    ).get(req.params.id, req.user.id);
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });

    db.prepare(
      "DELETE FROM playlist_songs WHERE id = ? AND playlist_id = ?"
    ).run(req.params.songId, req.params.id);
    res.json({ message: "Song removed" });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove song" });
  }
});

router.delete("/playlists/:id", authMiddleware, (req, res) => {
  try {
    const db = getDb();
    db.prepare(
      "DELETE FROM playlists WHERE id = ? AND user_id = ?"
    ).run(req.params.id, req.user.id);
    res.json({ message: "Playlist deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete playlist" });
  }
});

module.exports = router;
