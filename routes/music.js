const express = require("express");
const axios = require("axios");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const { findOne, find, insert, update, remove, count } = require("../db/database");

const ITUNES_BASE = "https://itunes.apple.com";
const DEEZER_BASE = "https://api.deezer.com";

function normalizeItunesTrack(t) {
  return {
    id: `itunes_${t.trackId}`,
    source: "itunes",
    track_name: t.trackName || "",
    artist_name: t.artistName || "",
    album_name: t.collectionName || "",
    cover_url: t.artworkUrl100
      ? t.artworkUrl100.replace("100x100", "300x300")
      : "",
    preview_url: t.previewUrl || "",
    duration: Math.round((t.trackTimeMillis || 0) / 1000),
    genre: t.primaryGenreName || "",
    external_url: t.trackViewUrl || ""
  };
}

function normalizeDeezerTrack(t) {
  return {
    id: `deezer_${t.id}`,
    source: "deezer",
    track_name: t.title || "",
    artist_name: t.artist?.name || "",
    album_name: t.album?.title || "",
    cover_url: t.album?.cover_medium || "",
    preview_url: t.preview || "",
    duration: t.duration || 0,
    genre: "",
    external_url: t.link || ""
  };
}

// GET /api/music/search
router.get("/search", async (req, res) => {
  const { q, limit = 20 } = req.query;
  if (!q) return res.status(400).json({ error: "Query required" });

  try {
    const response = await axios.get(`${ITUNES_BASE}/search`, {
      params: {
        term: q,
        entity: "song",
        limit: Math.min(parseInt(limit), 50)
      },
      timeout: 8000
    });
    const tracks = (response.data.results || []).map(normalizeItunesTrack);
    res.json({ results: tracks, total: tracks.length });
  } catch (err) {
    res.status(500).json({ error: "Search failed", results: [] });
  }
});

// GET /api/music/trending
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
      const entries = itunesRes.value.data?.feed?.entry || [];
      tracks = entries.slice(0, 20).map((e, i) => ({
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

// GET /api/music/genre/:genre
router.get("/genre/:genre", async (req, res) => {
  const genreMap = {
    afrobeats: "afrobeats",
    hiphop: "hip hop",
    pop: "pop",
    rnb: "r&b",
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

// GET /api/music/artist/:name
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

// GET /api/music/favorites
router.get("/favorites", authMiddleware, async (req, res) => {
  try {
    const favorites = await find("favorites", { user_id: req.user.id }, { added_at: -1 });
    res.json({ results: favorites });
  } catch (err) {
    res.status(500).json({ error: "Failed to load favorites" });
  }
});

// POST /api/music/favorites
router.post("/favorites", authMiddleware, async (req, res) => {
  try {
    const {
      track_id, track_name, artist_name,
      album_name, cover_url, preview_url, duration
    } = req.body;

    if (!track_id || !track_name) {
      return res.status(400).json({ error: "track_id and track_name required" });
    }

    const existing = await findOne("favorites", {
      user_id: req.user.id,
      track_id
    });

    if (!existing) {
      await insert("favorites", {
        user_id: req.user.id,
        track_id,
        track_name,
        artist_name: artist_name || "",
        album_name: album_name || "",
        cover_url: cover_url || "",
        preview_url: preview_url || "",
        duration: duration || 0,
        added_at: new Date()
      });
    }

    res.json({ message: "Added to favorites" });
  } catch (err) {
    res.status(500).json({ error: "Failed to add favorite" });
  }
});

// DELETE /api/music/favorites/:trackId
router.delete("/favorites/:trackId", authMiddleware, async (req, res) => {
  try {
    await remove("favorites", {
      user_id: req.user.id,
      track_id: req.params.trackId
    });
    res.json({ message: "Removed from favorites" });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove favorite" });
  }
});

// GET /api/music/history
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const history = await find(
      "history",
      { user_id: req.user.id },
      { played_at: -1 }
    );
    res.json({ results: history.slice(0, 50) });
  } catch (err) {
    res.status(500).json({ error: "Failed to load history" });
  }
});

// POST /api/music/history
router.post("/history", authMiddleware, async (req, res) => {
  try {
    const { track_id, track_name, artist_name, cover_url, preview_url } = req.body;
    if (!track_id) return res.status(400).json({ error: "track_id required" });

    const historyCount = await count("history", { user_id: req.user.id });
    if (historyCount >= 100) {
      const oldest = await find("history", { user_id: req.user.id }, { played_at: 1 });
      if (oldest.length > 0) {
        await remove("history", { _id: oldest[0]._id });
      }
    }

    await insert("history", {
      user_id: req.user.id,
      track_id,
      track_name: track_name || "",
      artist_name: artist_name || "",
      cover_url: cover_url || "",
      preview_url: preview_url || "",
      played_at: new Date()
    });

    res.json({ message: "Recorded" });
  } catch (err) {
    res.status(500).json({ error: "Failed to record history" });
  }
});

// GET /api/music/playlists
router.get("/playlists", authMiddleware, async (req, res) => {
  try {
    const playlists = await find(
      "playlists",
      { user_id: req.user.id },
      { created_at: -1 }
    );

    const playlistsWithCount = await Promise.all(
      playlists.map(async p => {
        const songCount = await count("playlist_songs", { playlist_id: p._id });
        return { ...p, id: p._id, song_count: songCount };
      })
    );

    res.json({ results: playlistsWithCount });
  } catch (err) {
    res.status(500).json({ error: "Failed to load playlists" });
  }
});

// POST /api/music/playlists
router.post("/playlists", authMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: "Playlist name required" });

    const playlist = await insert("playlists", {
      user_id: req.user.id,
      name,
      description: description || "",
      created_at: new Date()
    });

    res.status(201).json({
      message: "Playlist created",
      id: playlist._id
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create playlist" });
  }
});

// GET /api/music/playlists/:id
router.get("/playlists/:id", authMiddleware, async (req, res) => {
  try {
    const playlist = await findOne("playlists", {
      _id: req.params.id,
      user_id: req.user.id
    });
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });

    const songs = await find(
      "playlist_songs",
      { playlist_id: req.params.id },
      { added_at: -1 }
    );

    res.json({ playlist, songs });
  } catch (err) {
    res.status(500).json({ error: "Failed to load playlist" });
  }
});

// POST /api/music/playlists/:id/songs
router.post("/playlists/:id/songs", authMiddleware, async (req, res) => {
  try {
    const {
      track_id, track_name, artist_name,
      album_name, cover_url, preview_url, duration
    } = req.body;

    const playlist = await findOne("playlists", {
      _id: req.params.id,
      user_id: req.user.id
    });
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });

    await insert("playlist_songs", {
      playlist_id: req.params.id,
      track_id,
      track_name: track_name || "",
      artist_name: artist_name || "",
      album_name: album_name || "",
      cover_url: cover_url || "",
      preview_url: preview_url || "",
      duration: duration || 0,
      added_at: new Date()
    });

    res.json({ message: "Song added to playlist" });
  } catch (err) {
    res.status(500).json({ error: "Failed to add song" });
  }
});

// DELETE /api/music/playlists/:id/songs/:songId
router.delete("/playlists/:id/songs/:songId", authMiddleware, async (req, res) => {
  try {
    const playlist = await findOne("playlists", {
      _id: req.params.id,
      user_id: req.user.id
    });
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });

    await remove("playlist_songs", { _id: req.params.songId });
    res.json({ message: "Song removed" });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove song" });
  }
});

// DELETE /api/music/playlists/:id
router.delete("/playlists/:id", authMiddleware, async (req, res) => {
  try {
    await remove("playlists", {
      _id: req.params.id,
      user_id: req.user.id
    });
    await remove("playlist_songs", { playlist_id: req.params.id }, { multi: true });
    res.json({ message: "Playlist deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete playlist" });
  }
});

module.exports = router;
