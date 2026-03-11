"use strict";

const State = {
  user: null,
  token: localStorage.getItem("almeer_token"),
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  isShuffle: false,
  repeatMode: 0,
  favorites: new Set(),
  currentPage: "home"
};

const audio = new Audio();
audio.volume = 0.8;

audio.ontimeupdate = () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  q("#progressFill").style.width = pct + "%";
  q("#currentTime").textContent = fmt(audio.currentTime);
};
audio.onloadedmetadata = () => {
  q("#totalTime").textContent = fmt(audio.duration);
};
audio.onplay = () => {
  State.isPlaying = true;
  q("#playIcon").className = "fa fa-pause";
};
audio.onpause = () => {
  State.isPlaying = false;
  q("#playIcon").className = "fa fa-play";
};
audio.onended = () => {
  if (State.repeatMode === 2) {
    audio.currentTime = 0;
    audio.play();
  } else {
    window.nextTrack();
  }
};
audio.onerror = () => toast("No preview available", "error");

function q(sel) { return document.querySelector(sel); }
function qa(sel) { return document.querySelectorAll(sel); }

function fmt(s) {
  if (!s || isNaN(s)) return "0:00";
  return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
}

function esc(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function escJ(s) {
  if (!s) return "";
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, " ")
    .replace(/\r/g, "");
}

function toast(msg, type) {
  type = type || "";
  var t = q("#toast");
  t.textContent = msg;
  t.className = "toast " + type;
  t.classList.remove("hidden");
  clearTimeout(window._tt);
  window._tt = setTimeout(function() { t.classList.add("hidden"); }, 3000);
}

async function api(url, opts) {
  opts = opts || {};
  var h = { "Content-Type": "application/json" };
  if (State.token) h["Authorization"] = "Bearer " + State.token;
  var r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({}, h, opts.headers || {}) }));
  var d = await r.json();
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}

window.togglePlay = function() {
  if (!State.currentTrack) { toast("Select a song first"); return; }
  if (audio.paused) { audio.play(); } else { audio.pause(); }
};

window.prevTrack = function() {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  if (State.queueIndex > 0) {
    State.queueIndex--;
    playTrack(State.queue[State.queueIndex], false);
  }
};

window.nextTrack = function() {
  if (!State.queue.length) return;
  if (State.isShuffle) {
    State.queueIndex = Math.floor(Math.random() * State.queue.length);
  } else if (State.queueIndex < State.queue.length - 1) {
    State.queueIndex++;
  } else if (State.repeatMode === 1) {
    State.queueIndex = 0;
  } else {
    return;
  }
  playTrack(State.queue[State.queueIndex], false);
};

window.toggleShuffle = function() {
  State.isShuffle = !State.isShuffle;
  q("#shuffleBtn").classList.toggle("active", State.isShuffle);
  toast(State.isShuffle ? "Shuffle on" : "Shuffle off");
};

window.toggleRepeat = function() {
  State.repeatMode = (State.repeatMode + 1) % 3;
  q("#repeatBtn").classList.toggle("active", State.repeatMode > 0);
  var labels = ["Repeat off", "Repeat all", "Repeat one"];
  toast(labels[State.repeatMode]);
};

window.seekTo = function(e) {
  var rect = e.currentTarget.getBoundingClientRect();
  if (audio.duration) {
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  }
};

window.setVolume = function(v) { audio.volume = v / 100; };
window.toggleMute = function() { audio.muted = !audio.muted; };

async function playTrack(track, addToQueue) {
  if (addToQueue === undefined) addToQueue = true;
  if (!track || !track.preview_url) {
    toast("No preview for this track", "error");
    return;
  }
  State.currentTrack = track;
  if (addToQueue) {
    State.queue = [track];
    State.queueIndex = 0;
  }
  q("#playerTitle").textContent = track.track_name || "Unknown";
  q("#playerArtist").textContent = track.artist_name || "";
  var cover = q("#playerCover");
  cover.src = track.cover_url || "";
  cover.onerror = function() { cover.src = ""; };
  q("#playerLikeBtn").classList.toggle("liked", State.favorites.has(track.id));
  audio.src = track.preview_url;
  try {
    await audio.play();
  } catch(e) {
    toast("Tap play to start");
  }
  if (State.user) recordHistory(track);
  qa(".track-item").forEach(function(el) {
    el.classList.toggle("playing", el.dataset.trackId === track.id);
  });
}

window.setQueue = function(tracks, idx) {
  if (idx === undefined) idx = 0;
  if (!tracks || !tracks.length) return;
  State.queue = tracks;
  State.queueIndex = idx;
  playTrack(tracks[idx], false);
};

window.toggleCurrentFavorite = function() {
  if (State.currentTrack) toggleFav(State.currentTrack);
};

window.toggleFavorite = function(track) { toggleFav(track); };

async function toggleFav(track) {
  if (!State.user) {
    toast("Login to save favorites");
    window.showAuth();
    return;
  }
  var isFav = State.favorites.has(track.id);
  try {
    if (isFav) {
      await api("/api/music/favorites/" + encodeURIComponent(track.id), { method: "DELETE" });
      State.favorites.delete(track.id);
      toast("Removed from favorites");
    } else {
      await api("/api/music/favorites", { method: "POST", body: JSON.stringify(track) });
      State.favorites.add(track.id);
      toast("Added to favorites", "success");
    }
    if (State.currentTrack && State.currentTrack.id === track.id) {
      q("#playerLikeBtn").classList.toggle("liked", !isFav);
    }
  } catch(e) {
    toast("Failed: " + e.message, "error");
  }
}

async function recordHistory(track) {
  try {
    await api("/api/music/history", {
      method: "POST",
      body: JSON.stringify({
        track_id: track.id,
        track_name: track.track_name,
        artist_name: track.artist_name,
        cover_url: track.cover_url,
        preview_url: track.preview_url
      })
    });
  } catch(e) {}
}

window.showAuth = function() {
  q("#authOverlay").classList.remove("hidden");
  q("#loginForm").classList.remove("hidden");
  q("#registerForm").classList.add("hidden");
};

window.showRegister = function() {
  q("#authOverlay").classList.remove("hidden");
  q("#loginForm").classList.add("hidden");
  q("#registerForm").classList.remove("hidden");
};

window.showLogin = function() {
  q("#loginForm").classList.remove("hidden");
  q("#registerForm").classList.add("hidden");
};

window.closeAuth = function() {
  q("#authOverlay").classList.add("hidden");
};

window.fillDemo = function(email, pw) {
  q("#loginEmail").value = email;
  q("#loginPassword").value = pw;
};

window.togglePw = function(id, icon) {
  var inp = q("#" + id);
  if (inp.type === "password") {
    inp.type = "text";
    icon.className = "fa fa-eye-slash pw-toggle";
  } else {
    inp.type = "password";
    icon.className = "fa fa-eye pw-toggle";
  }
};

window.handleLogin = async function() {
  var email = q("#loginEmail").value.trim();
  var pw = q("#loginPassword").value;
  var errEl = q("#loginError");
  var btn = q("#loginBtn");
  errEl.classList.add("hidden");
  if (!email || !pw) {
    errEl.textContent = "Please fill in all fields";
    errEl.classList.remove("hidden");
    return;
  }
  btn.disabled = true;
  btn.textContent = "Logging in...";
  try {
    var d = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: email, password: pw })
    });
    setUser(d.user, d.token);
    window.closeAuth();
    toast("Welcome back " + d.user.username + "!", "success");
    window.navigate("home");
  } catch(e) {
    errEl.textContent = e.message;
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Log In";
  }
};

window.handleRegister = async function() {
  var username = q("#regUsername").value.trim();
  var email = q("#regEmail").value.trim();
  var pw = q("#regPassword").value;
  var errEl = q("#regError");
  var btn = q("#registerBtn");
  errEl.classList.add("hidden");
  if (!username || !email || !pw) {
    errEl.textContent = "Please fill in all fields";
    errEl.classList.remove("hidden");
    return;
  }
  if (pw.length < 6) {
    errEl.textContent = "Password must be at least 6 characters";
    errEl.classList.remove("hidden");
    return;
  }
  btn.disabled = true;
  btn.textContent = "Creating account...";
  try {
    var d = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: username, email: email, password: pw })
    });
    setUser(d.user, d.token);
    window.closeAuth();
    toast("Welcome to ALMEER MUSIC!", "success");
    window.navigate("home");
  } catch(e) {
    errEl.textContent = e.message;
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Create Account";
  }
};

function setUser(user, token) {
  State.user = user;
  State.token = token;
  localStorage.setItem("almeer_token", token);
  var ini = user.username[0].toUpperCase();
  q("#sidebarUser").classList.remove("hidden");
  q("#sidebarLogin").classList.add("hidden");
  q("#sidebarAvatar").textContent = ini;
  q("#sidebarUsername").textContent = user.username;
  q("#sidebarRole").textContent = user.role;
  q("#topbarUser").classList.remove("hidden");
  q("#topbarLogin").classList.add("hidden");
  q("#topbarAvatar").textContent = ini;
  q("#topbarUsername").textContent = user.username;
  qa(".auth-only").forEach(function(el) { el.classList.remove("hidden"); });
  loadFavs();
  updateBottomNav();
}

window.logout = function() {
  State.user = null;
  State.token = null;
  State.favorites.clear();
  localStorage.removeItem("almeer_token");
  q("#sidebarUser").classList.add("hidden");
  q("#sidebarLogin").classList.remove("hidden");
  q("#topbarUser").classList.add("hidden");
  q("#topbarLogin").classList.remove("hidden");
  qa(".auth-only").forEach(function(el) { el.classList.add("hidden"); });
  closeUserMenu();
  updateBottomNav();
  toast("Logged out");
  window.navigate("home");
};

async function checkAuth() {
  if (!State.token) return;
  try {
    var d = await api("/api/auth/me");
    setUser(d, State.token);
  } catch(e) {
    localStorage.removeItem("almeer_token");
    State.token = null;
  }
}

async function loadFavs() {
  if (!State.user) return;
  try {
    var d = await api("/api/music/favorites");
    State.favorites = new Set((d.results || []).map(function(f) { return f.track_id; }));
  } catch(e) {}
}

window.toggleUserMenu = function() {
  q("#userMenu").classList.toggle("hidden");
};

function closeUserMenu() {
  var m = q("#userMenu");
  if (m) m.classList.add("hidden");
}

document.addEventListener("click", function(e) {
  if (!e.target.closest(".dropdown")) closeUserMenu();
});

window.toggleSidebar = function() {
  q("#sidebar").classList.toggle("open");
  var bd = q("#sidebarBackdrop");
  if (bd) bd.classList.toggle("show");
};

window.closeSidebar = function() {
  q("#sidebar").classList.remove("open");
  var bd = q("#sidebarBackdrop");
  if (bd) bd.classList.remove("show");
};

window.navigate = function(page) {
  State.currentPage = page;
  qa(".nav-item").forEach(function(el) {
    el.classList.toggle("active", el.dataset.page === page);
  });
  qa(".bottom-nav-item").forEach(function(el) {
    el.classList.toggle("active", el.dataset.page === page);
  });
  window.closeSidebar();
  q("#pageContent").innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
  var pages = {
    home: renderHome,
    search: renderSearch,
    trending: renderTrending,
    genres: renderGenres,
    favorites: renderFavs,
    playlists: renderPlaylists,
    history: renderHistory
  };
  var fn = pages[page] || renderHome;
  fn();
};

function updateBottomNav() {
  var show = !!State.user;
  ["bnFav", "bnPl"].forEach(function(id) {
    var el = q("#" + id);
    if (el) el.style.display = show ? "flex" : "none";
  });
}

async function renderHome() {
  q("#pageContent").innerHTML =
    '<div class="hero-banner">' +
      '<div class="hero-text">' +
        '<div class="hero-badge">Now Streaming</div>' +
        '<h1 class="hero-title">Your Music.<br/><span>Your World.</span></h1>' +
        '<p class="hero-subtitle">Stream free — no account needed!</p>' +
        '<div class="hero-actions">' +
          '<button class="btn-primary" onclick="navigate(\'trending\')">Trending</button>' +
          '<button class="btn-outline" onclick="navigate(\'genres\')">Genres</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<section class="mb-24">' +
      '<div class="section-header">' +
        '<h2 class="section-title">Trending Now</h2>' +
        '<span class="section-link" onclick="navigate(\'trending\')">See all</span>' +
      '</div>' +
      '<div id="homeTrending"><div class="spinner-wrap"><div class="spinner"></div></div></div>' +
    '</section>' +
    '<section class="mb-24">' +
      '<div class="section-header"><h2 class="section-title">Genres</h2></div>' +
      genreGrid(true) +
    '</section>';

  try {
    var d = await api("/api/music/trending");
    var tracks = d.results || [];
    window.__ht = tracks;
    var el = q("#homeTrending");
    if (!el) return;
    if (!tracks.length) {
      el.innerHTML = emptyState("No trending data right now");
      return;
    }
    el.innerHTML = cardsGrid(tracks.slice(0, 8), "__ht");
  } catch(e) {
    var el2 = q("#homeTrending");
    if (el2) el2.innerHTML = emptyState("Failed to load. Check connection.");
  }
}

function renderSearch() {
  q("#pageContent").innerHTML =
    '<div class="search-hero">' +
      '<h2>Search Music</h2>' +
      '<p>Find any song or artist</p>' +
      '<div class="search-big-input">' +
        '<input id="searchBigInput" placeholder="Search songs, artists..." />' +
        '<button class="btn-primary" onclick="doSearch(q(\'#searchBigInput\').value.trim())">Search</button>' +
      '</div>' +
    '</div>' +
    genreGrid(false) +
    '<div id="searchResults" style="margin-top:20px;"></div>';

  var inp = q("#searchBigInput");
  if (inp) {
    inp.addEventListener("keyup", function(e) {
      if (e.key === "Enter") window.doSearch(inp.value.trim());
    });
  }
}

window.performSearch = function() {
  var v = q("#topSearchInput").value.trim();
  if (!v) return;
  window.navigate("search");
  setTimeout(function() {
    var el = q("#searchBigInput");
    if (el) {
      el.value = v;
      window.doSearch(v);
    }
  }, 200);
};

window.handleSearchKey = function(e) {
  if (e.key === "Enter") window.performSearch();
};

window.doSearch = async function(v) {
  if (!v) return;
  var el = q("#searchResults");
  if (!el) return;
  el.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
  try {
    var d = await api("/api/music/search?q=" + encodeURIComponent(v) + "&limit=20");
    var tracks = d.results || [];
    window.__sr = tracks;
    if (!tracks.length) {
      el.innerHTML = emptyState("No results found for: " + esc(v));
      return;
    }
    var html = '<div class="section-header"><h2 class="section-title">Results: ' + esc(v) + '</h2><span class="text-muted">' + tracks.length + ' songs</span></div>';
    html += '<div class="track-list">';
    tracks.forEach(function(t, i) { html += trackItem(t, i, "__sr"); });
    html += '</div>';
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = emptyState("Search failed. Try again.");
  }
};

async function renderTrending() {
  q("#pageContent").innerHTML =
    '<div class="section-header mb-24"><h2 class="section-title">Trending Songs</h2></div>' +
    '<div id="trendingList"><div class="spinner-wrap"><div class="spinner"></div></div></div>';
  try {
    var d = await api("/api/music/trending");
    var tracks = d.results || [];
    window.__tr = tracks;
    var el = q("#trendingList");
    if (!el) return;
    if (!tracks.length) {
      el.innerHTML = emptyState("No trending data right now");
      return;
    }
    var html = '<div style="margin-bottom:14px;"><button class="btn-primary btn-sm" onclick="setQueue(window.__tr,0)">Play All</button></div>';
    html += '<div class="track-list">';
    tracks.forEach(function(t, i) { html += trackItem(t, i, "__tr"); });
    html += '</div>';
    el.innerHTML = html;
  } catch(e) {
    var el2 = q("#trendingList");
    if (el2) el2.innerHTML = emptyState("Failed to load trending");
  }
}

var GENRES = [
  {id:"afrobeats", name:"Afrobeats", icon:"🌍", color:"linear-gradient(135deg,#007730,#004d20)"},
  {id:"hiphop",    name:"Hip-Hop",   icon:"🎤", color:"linear-gradient(135deg,#005522,#003311)"},
  {id:"pop",       name:"Pop",       icon:"⭐", color:"linear-gradient(135deg,#006633,#004422)"},
  {id:"rnb",       name:"R&B",       icon:"🎷", color:"linear-gradient(135deg,#008844,#005522)"},
  {id:"gospel",    name:"Gospel",    icon:"🙏", color:"linear-gradient(135deg,#004422,#002211)"},
  {id:"jazz",      name:"Jazz",      icon:"🎺", color:"linear-gradient(135deg,#005533,#003322)"},
  {id:"rock",      name:"Rock",      icon:"🎸", color:"linear-gradient(135deg,#003311,#001a08)"},
  {id:"electronic",name:"Electronic",icon:"⚡", color:"linear-gradient(135deg,#009944,#006633)"},
  {id:"reggae",    name:"Reggae",    icon:"🏝️", color:"linear-gradient(135deg,#00aa44,#007730)"},
  {id:"classical", name:"Classical", icon:"🎻", color:"linear-gradient(135deg,#004d22,#002211)"}
];

function genreGrid(mini) {
  var list = mini ? GENRES.slice(0, 6) : GENRES;
  var html = '<div class="genre-grid">';
  list.forEach(function(g) {
    html += '<div class="genre-card" style="background:' + g.color + '" onclick="loadGenre(\'' + g.id + '\',\'' + g.name + '\')">';
    html += '<div class="genre-icon">' + g.icon + '</div>';
    html += '<div>' + g.name + '</div></div>';
  });
  html += '</div>';
  return html;
}

function renderGenres() {
  q("#pageContent").innerHTML =
    '<div class="section-header mb-24"><h2 class="section-title">Browse by Genre</h2></div>' +
    genreGrid(false) +
    '<div id="genreResults" style="margin-top:20px;"></div>';
}

window.loadGenre = async function(id, name) {
  if (State.currentPage !== "genres" && State.currentPage !== "search") {
    window.navigate("genres");
    setTimeout(function() { window.loadGenre(id, name); }, 300);
    return;
  }
  var el = q("#genreResults") || q("#searchResults");
  if (!el) return;
  el.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
  try {
    var d = await api("/api/music/genre/" + id);
    var tracks = d.results || [];
    window.__gr = tracks;
    if (!tracks.length) {
      el.innerHTML = emptyState("No tracks found for " + name);
      return;
    }
    var html = '<div class="section-header"><h2 class="section-title">' + esc(name) + '</h2>';
    html += '<button class="btn-primary btn-sm" onclick="setQueue(window.__gr,0)">Play All</button></div>';
    html += '<div class="track-list">';
    tracks.forEach(function(t, i) { html += trackItem(t, i, "__gr"); });
    html += '</div>';
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = emptyState("Failed to load genre");
  }
};

async function renderFavs() {
  if (!State.user) {
    q("#pageContent").innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">❤️</div>' +
        '<h3>Liked Songs</h3>' +
        '<p>Login to save your favorites</p>' +
        '<button class="btn-primary mt-16" onclick="showAuth()">Login</button>' +
      '</div>';
    return;
  }
  q("#pageContent").innerHTML =
    '<div class="section-header mb-24"><h2 class="section-title">Favorites</h2></div>' +
    '<div id="favList"><div class="spinner-wrap"><div class="spinner"></div></div></div>';
  try {
    var d = await api("/api/music/favorites");
    var items = d.results || [];
    var el = q("#favList");
    if (!items.length) {
      el.innerHTML = emptyState("No favorites yet. Tap the heart on any song!");
      return;
    }
    var tracks = items.map(function(t) {
      return { id: t.track_id, track_name: t.track_name, artist_name: t.artist_name,
        album_name: t.album_name, cover_url: t.cover_url, preview_url: t.preview_url, duration: t.duration };
    });
    tracks.forEach(function(t) { State.favorites.add(t.id); });
    window.__fv = tracks;
    var html = '<div style="margin-bottom:14px;"><button class="btn-primary btn-sm" onclick="setQueue(window.__fv,0)">Play All</button></div>';
    html += '<div class="track-list">';
    tracks.forEach(function(t, i) { html += trackItem(t, i, "__fv"); });
    html += '</div>';
    el.innerHTML = html;
  } catch(e) {
    q("#favList").innerHTML = emptyState("Failed to load favorites");
  }
}

async function renderPlaylists() {
  if (!State.user) {
    q("#pageContent").innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">🎵</div>' +
        '<h3>My Playlists</h3>' +
        '<p>Login to manage playlists</p>' +
        '<button class="btn-primary mt-16" onclick="showAuth()">Login</button>' +
      '</div>';
    return;
  }
  q("#pageContent").innerHTML =
    '<div class="section-header mb-24"><h2 class="section-title">My Playlists</h2>' +
    '<button class="btn-primary btn-sm" onclick="showCreatePlaylist()">+ New</button></div>' +
    '<div id="playlistsList"><div class="spinner-wrap"><div class="spinner"></div></div></div>';
  try {
    var d = await api("/api/music/playlists");
    var pls = d.results || [];
    var el = q("#playlistsList");
    if (!pls.length) {
      el.innerHTML = emptyState("No playlists yet. Create your first one!");
      return;
    }
    var html = '<div class="playlist-list">';
    pls.forEach(function(p) {
      var pid = p._id || p.id;
      html += '<div class="playlist-item" onclick="openPlaylist(\'' + pid + '\',\'' + escJ(p.name) + '\')">';
      html += '<div class="playlist-icon">🎵</div>';
      html += '<div class="playlist-info"><div class="playlist-name">' + esc(p.name) + '</div>';
      html += '<div class="playlist-count">' + (p.song_count || 0) + ' songs</div></div>';
      html += '<button class="track-action" onclick="event.stopPropagation();deletePlaylist(\'' + pid + '\')"><i class="fa fa-trash"></i></button>';
      html += '</div>';
    });
    html += '</div>';
    el.innerHTML = html;
  } catch(e) {
    q("#playlistsList").innerHTML = emptyState("Failed to load playlists");
  }
}

window.openPlaylist = async function(id, name) {
  q("#pageContent").innerHTML =
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">' +
      '<button class="btn-outline btn-sm" onclick="renderPlaylists()"><i class="fa fa-arrow-left"></i> Back</button>' +
      '<h2 class="section-title">' + esc(name) + '</h2>' +
    '</div>' +
    '<div id="playlistDetail"><div class="spinner-wrap"><div class="spinner"></div></div></div>';
  try {
    var d = await api("/api/music/playlists/" + id);
    var songs = d.songs || [];
    var el = q("#playlistDetail");
    if (!songs.length) {
      el.innerHTML = emptyState("No songs in this playlist yet");
      return;
    }
    var tracks = songs.map(function(s) {
      return { id: s.track_id, track_name: s.track_name, artist_name: s.artist_name,
        cover_url: s.cover_url, preview_url: s.preview_url, duration: s.duration };
    });
    window.__pl = tracks;
    var html = '<div style="margin-bottom:14px;"><button class="btn-primary btn-sm" onclick="setQueue(window.__pl,0)">Play All</button></div>';
    html += '<div class="track-list">';
    tracks.forEach(function(t, i) { html += trackItem(t, i, "__pl"); });
    html += '</div>';
    el.innerHTML = html;
  } catch(e) {
    q("#playlistDetail").innerHTML = emptyState("Failed to load playlist");
  }
};

window.deletePlaylist = async function(id) {
  if (!confirm("Delete this playlist?")) return;
  try {
    await api("/api/music/playlists/" + id, { method: "DELETE" });
    toast("Playlist deleted");
    renderPlaylists();
  } catch(e) {
    toast("Failed to delete", "error");
  }
};

async function renderHistory() {
  if (!State.user) {
    q("#pageContent").innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">🕐</div>' +
        '<h3>Listening History</h3>' +
        '<p>Login to track your history</p>' +
        '<button class="btn-primary mt-16" onclick="showAuth()">Login</button>' +
      '</div>';
    return;
  }
  q("#pageContent").innerHTML =
    '<div class="section-header mb-24"><h2 class="section-title">Recently Played</h2></div>' +
    '<div id="historyList"><div class="spinner-wrap"><div class="spinner"></div></div></div>';
  try {
    var d = await api("/api/music/history");
    var items = d.results || [];
    var el = q("#historyList");
    if (!items.length) {
      el.innerHTML = emptyState("Nothing played yet. Start listening!");
      return;
    }
    var tracks = items.map(function(h) {
      return { id: h.track_id, track_name: h.track_name, artist_name: h.artist_name,
        cover_url: h.cover_url, preview_url: h.preview_url, duration: 0 };
    });
    window.__hi = tracks;
    var html = '<div class="track-list">';
    tracks.forEach(function(t, i) { html += trackItem(t, i, "__hi"); });
    html += '</div>';
    el.innerHTML = html;
  } catch(e) {
    q("#historyList").innerHTML = emptyState("Failed to load history");
  }
}

window.showProfile = function() {
  if (!State.user) { window.showAuth(); return; }
  closeUserMenu();
  q("#profileModal").classList.remove("hidden");
  q("#profileContent").innerHTML =
    '<div class="profile-header">' +
      '<div class="profile-avatar">' + State.user.username[0].toUpperCase() + '</div>' +
      '<div class="profile-info"><h3>' + esc(State.user.username) + '</h3></div>' +
    '</div>' +
    '<div class="profile-form" style="margin-top:20px;">' +
      '<div class="form-group"><label>Username</label>' +
        '<input type="text" id="profUser" value="' + esc(State.user.username) + '" /></div>' +
      '<div class="form-group"><label>Bio</label>' +
        '<input type="text" id="profBio" placeholder="Tell us about yourself..." /></div>' +
      '<div id="profMsg" class="auth-error hidden"></div>' +
      '<button class="btn-primary btn-full" onclick="updateProfile()">Save Changes</button>' +
      '<hr style="border-color:var(--border);margin:20px 0;">' +
      '<h4 style="margin-bottom:14px;">Change Password</h4>' +
      '<div class="form-group"><label>Current Password</label><input type="password" id="curPw" /></div>' +
      '<div class="form-group"><label>New Password</label><input type="password" id="newPw" /></div>' +
      '<div id="pwMsg" class="auth-error hidden"></div>' +
      '<button class="btn-outline btn-full" onclick="changePassword()">Change Password</button>' +
    '</div>';
};

window.closeProfileModal = function() {
  q("#profileModal").classList.add("hidden");
};

window.updateProfile = async function() {
  var username = q("#profUser") ? q("#profUser").value.trim() : "";
  var bio = q("#profBio") ? q("#profBio").value.trim() : "";
  var msgEl = q("#profMsg");
  try {
    await api("/api/auth/profile", { method: "PUT", body: JSON.stringify({ username: username, bio: bio }) });
    msgEl.textContent = "Saved!";
    msgEl.style.cssText = "background:rgba(0,170,68,0.1);border-color:rgba(0,170,68,0.4);color:var(--primary);";
    msgEl.classList.remove("hidden");
    if (username && State.user) {
      State.user.username = username;
      q("#sidebarUsername").textContent = username;
      q("#topbarUsername").textContent = username;
    }
    setTimeout(function() { msgEl.classList.add("hidden"); }, 3000);
  } catch(e) {
    msgEl.textContent = e.message;
    msgEl.style.cssText = "";
    msgEl.classList.remove("hidden");
  }
};

window.changePassword = async function() {
  var cur = q("#curPw") ? q("#curPw").value : "";
  var nw = q("#newPw") ? q("#newPw").value : "";
  var msgEl = q("#pwMsg");
  try {
    await api("/api/auth/password", { method: "PUT", body: JSON.stringify({ currentPassword: cur, newPassword: nw }) });
    msgEl.textContent = "Password changed!";
    msgEl.style.cssText = "background:rgba(0,170,68,0.1);border-color:rgba(0,170,68,0.4);color:var(--primary);";
    msgEl.classList.remove("hidden");
  } catch(e) {
    msgEl.textContent = e.message;
    msgEl.style.cssText = "";
    msgEl.classList.remove("hidden");
  }
};

var pendingTrack = null;

window.showPlaylistModal = async function(track) {
  if (!State.user) { toast("Login to add to playlists"); window.showAuth(); return; }
  pendingTrack = track;
  q("#playlistModal").classList.remove("hidden");
  var el = q("#playlistModalContent");
  el.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
  try {
    var d = await api("/api/music/playlists");
    var pls = d.results || [];
    var html = '<div style="margin-bottom:12px;"><button class="btn-outline btn-sm" onclick="showCreatePlaylist()">+ New Playlist</button></div>';
    if (!pls.length) {
      html += '<p style="color:var(--text-muted);padding:10px 0;">No playlists yet. Create one first!</p>';
    } else {
      html += '<div class="playlist-list">';
      pls.forEach(function(p) {
        var pid = p._id || p.id;
        html += '<div class="playlist-item" onclick="addToPlaylist(\'' + pid + '\')">';
        html += '<div class="playlist-icon">🎵</div>';
        html += '<div class="playlist-info"><div class="playlist-name">' + esc(p.name) + '</div>';
        html += '<div class="playlist-count">' + (p.song_count || 0) + ' songs</div></div>';
        html += '<i class="fa fa-plus" style="color:var(--primary)"></i></div>';
      });
      html += '</div>';
    }
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = '<p style="color:red;">Failed to load playlists</p>';
  }
};

window.closePlaylistModal = function() {
  q("#playlistModal").classList.add("hidden");
  pendingTrack = null;
};

window.addToPlaylist = async function(id) {
  if (!pendingTrack) return;
  try {
    await api("/api/music/playlists/" + id + "/songs", { method: "POST", body: JSON.stringify(pendingTrack) });
    window.closePlaylistModal();
    toast("Added to playlist!", "success");
  } catch(e) {
    toast("Failed to add", "error");
  }
};

window.showCreatePlaylist = function() {
  q("#createPlaylistModal").classList.remove("hidden");
  window.closePlaylistModal();
};

window.closeCreatePlaylist = function() {
  q("#createPlaylistModal").classList.add("hidden");
};

window.createPlaylist = async function() {
  var name = q("#newPlaylistName") ? q("#newPlaylistName").value.trim() : "";
  if (!name) { toast("Enter a playlist name", "error"); return; }
  try {
    await api("/api/music/playlists", { method: "POST", body: JSON.stringify({ name: name, description: "" }) });
    window.closeCreatePlaylist();
    toast("Playlist created!", "success");
    if (State.currentPage === "playlists") renderPlaylists();
  } catch(e) {
    toast("Failed to create playlist", "error");
  }
};

function trackItem(t, i, arrKey) {
  var isLiked = State.favorites.has(t.id);
  var tid = t.id || "";
  var tn = escJ(t.track_name || "");
  var ta = escJ(t.artist_name || "");
  var tc = (t.cover_url || "").replace(/'/g, "");
  var tp = (t.preview_url || "").replace(/'/g, "");
  var tdur = t.duration || 0;
  var trackObj = "{id:'" + tid + "',track_name:'" + tn + "',artist_name:'" + ta + "',cover_url:'" + tc + "',preview_url:'" + tp + "',duration:" + tdur + "}";
  var html = '<div class="track-item" data-track-id="' + tid + '" onclick="setQueue(window.' + arrKey + ',' + i + ')">';
  html += '<div class="track-num">' + (i + 1) + '</div>';
  html += '<img class="track-cover" src="' + tc + '" onerror="this.src=\'\'" />';
  html += '<div class="track-info">';
  html += '<div class="track-name">' + esc(t.track_name) + '</div>';
  html += '<div class="track-artist">' + esc(t.artist_name) + '</div>';
  html += '</div>';
  if (t.duration) html += '<div class="track-duration">' + fmt(t.duration) + '</div>';
  html += '<div class="track-actions">';
  html += '<button class="track-action like-btn ' + (isLiked ? "liked" : "") + '" onclick="event.stopPropagation();toggleFavorite(' + trackObj + ')"><i class="fa fa-heart"></i></button>';
  html += '<button class="track-action" onclick="event.stopPropagation();showPlaylistModal(' + trackObj + ')"><i class="fa fa-plus"></i></button>';
  html += '</div></div>';
  return html;
}

function cardsGrid(tracks, arrKey) {
  var html = '<div class="cards-grid">';
  tracks.forEach(function(t, i) {
    var tid = t.id || "";
    var tn = escJ(t.track_name || "");
    var ta = escJ(t.artist_name || "");
    var tc = (t.cover_url || "").replace(/'/g, "");
    var tp = (t.preview_url || "").replace(/'/g, "");
    var tdur = t.duration || 0;
    var trackObj = "{id:'" + tid + "',track_name:'" + tn + "',artist_name:'" + ta + "',cover_url:'" + tc + "',preview_url:'" + tp + "',duration:" + tdur + "}";
    html += '<div class="music-card" onclick="setQueue(window.' + arrKey + ',' + i + ')">';
    html += '<div class="card-cover-wrap">';
    html += '<img class="card-cover" src="' + tc + '" onerror="this.src=\'\'" />';
    html += '<button class="card-play-btn" onclick="event.stopPropagation();setQueue(window.' + arrKey + ',' + i + ')"><i class="fa fa-play"></i></button>';
    html += '</div>';
    html += '<div class="card-title">' + esc(t.track_name) + '</div>';
    html += '<div class="card-artist">' + esc(t.artist_name) + '</div>';
    html += '<div class="card-actions">';
    html += '<button class="card-action-btn ' + (State.favorites.has(t.id) ? "liked" : "") + '" onclick="event.stopPropagation();toggleFavorite(' + trackObj + ')"><i class="fa fa-heart"></i></button>';
    html += '<button class="card-action-btn" onclick="event.stopPropagation();showPlaylistModal(' + trackObj + ')"><i class="fa fa-plus"></i></button>';
    html += '</div></div>';
  });
  html += '</div>';
  return html;
}

function emptyState(msg) {
  return '<div class="empty-state"><div class="empty-icon">🎵</div><p>' + msg + '</p></div>';
}

document.addEventListener("keydown", function(e) {
  if (e.code === "Space" && !["INPUT","TEXTAREA"].includes(e.target.tagName)) {
    e.preventDefault();
    window.togglePlay();
  }
  if (e.code === "Escape") {
    window.closeAuth();
    window.closePlaylistModal();
    window.closeCreatePlaylist();
    window.closeProfileModal();
    window.closeSidebar();
  }
});

["authOverlay","playlistModal","createPlaylistModal","profileModal"].forEach(function(id) {
  var el = q("#" + id);
  if (el) {
    el.addEventListener("click", function(e) {
      if (e.target === el) el.classList.add("hidden");
    });
  }
});

checkAuth().then(function() {
  window.navigate("home");
  updateBottomNav();
});