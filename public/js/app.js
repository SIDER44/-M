"use strict";

// ===== STATE =====
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

// ===== AUDIO =====
const audio = new Audio();
audio.volume = 0.8;

audio.ontimeupdate = () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  q("#progressFill").style.width = pct + "%";
  q("#currentTime").textContent = fmt(audio.currentTime);
};
audio.onloadedmetadata = () => { q("#totalTime").textContent = fmt(audio.duration); };
audio.onplay = () => { State.isPlaying = true; q("#playIcon").className = "fa fa-pause"; };
audio.onpause = () => { State.isPlaying = false; q("#playIcon").className = "fa fa-play"; };
audio.onended = () => { State.repeatMode === 2 ? (audio.currentTime = 0, audio.play()) : nextTrack(); };
audio.onerror = () => toast("No preview available", "error");

// ===== HELPERS =====
function q(sel) { return document.querySelector(sel); }
function qa(sel) { return document.querySelectorAll(sel); }
function fmt(s) {
  if (!s || isNaN(s)) return "0:00";
  return Math.floor(s/60) + ":" + String(Math.floor(s%60)).padStart(2,"0");
}
function esc(s) {
  if (!s) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#x27;");
}
function escJ(s) {
  if (!s) return "";
  return String(s).replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/\n/g," ");
}
function toast(msg, type="") {
  const t = q("#toast");
  t.textContent = msg;
  t.className = "toast " + type;
  t.classList.remove("hidden");
  clearTimeout(window._tt);
  window._tt = setTimeout(() => t.classList.add("hidden"), 3000);
}
async function api(url, opts={}) {
  const h = { "Content-Type": "application/json" };
  if (State.token) h["Authorization"] = "Bearer " + State.token;
  const r = await fetch(url, { ...opts, headers: { ...h, ...(opts.headers||{}) } });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}

// ===== PLAYER =====
window.togglePlay = function() {
  if (!State.currentTrack) return toast("Select a song first");
  audio.paused ? audio.play() : audio.pause();
};
window.prevTrack = function() {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  if (State.queueIndex > 0) { State.queueIndex--; playTrack(State.queue[State.queueIndex], false); }
};
window.nextTrack = function() {
  if (!State.queue.length) return;
  if (State.isShuffle) State.queueIndex = Math.floor(Math.random() * State.queue.length);
  else if (State.queueIndex < State.queue.length - 1) State.queueIndex++;
  else if (State.repeatMode === 1) State.queueIndex = 0;
  else return;
  playTrack(State.queue[State.queueIndex], false);
};
window.nextTrack = window.nextTrack;

window.toggleShuffle = function() {
  State.isShuffle = !State.isShuffle;
  q("#shuffleBtn").classList.toggle("active", State.isShuffle);
  toast(State.isShuffle ? "Shuffle on" : "Shuffle off");
};
window.toggleRepeat = function() {
  State.repeatMode = (State.repeatMode + 1) % 3;
  q("#repeatBtn").classList.toggle("active", State.repeatMode > 0);
  toast(["Repeat off","Repeat all","Repeat one"][State.repeatMode]);
};
window.seekTo = function(e) {
  const r = e.currentTarget.getBoundingClientRect();
  if (audio.duration) audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
};
window.setVolume = function(v) { audio.volume = v / 100; };
window.toggleMute = function() { audio.muted = !audio.muted; };

async function playTrack(track, addToQueue=true) {
  if (!track || !track.preview_url) {
    toast("No preview for this track", "error");
    return;
  }
  State.currentTrack = track;
  if (addToQueue) { State.queue = [track]; State.queueIndex = 0; }
  q("#playerTitle").textContent = track.track_name || "Unknown";
  q("#playerArtist").textContent = track.artist_name || "";
  const cover = q("#playerCover");
  cover.src = track.cover_url || "";
  cover.onerror = () => { cover.src = ""; };
  q("#playerLikeBtn").classList.toggle("liked", State.favorites.has(track.id));
  audio.src = track.preview_url;
  try { await audio.play(); } catch(e) { toast("Tap play to start 🎵"); }
  if (State.user) recordHistory(track);
  qa(".track-item").forEach(el => el.classList.toggle("playing", el.dataset.trackId === track.id));
}

window.setQueue = function(tracks, idx=0) {
  if (!tracks || !tracks.length) return;
  State.queue = tracks;
  State.queueIndex = idx;
  playTrack(tracks[idx], false);
};

window.toggleCurrentFavorite = function() {
  if (State.currentTrack) toggleFav(State.currentTrack);
};

async function toggleFav(track) {
  if (!State.user) { toast("Login to save favorites"); showAuth(); return; }
  const isFav = State.favorites.has(track.id);
  try {
    if (isFav) {
      await api("/api/music/favorites/" + encodeURIComponent(track.id), { method: "DELETE" });
      State.favorites.delete(track.id);
      toast("Removed from favorites");
    } else {
      await api("/api/music/favorites", { method: "POST", body: JSON.stringify(track) });
      State.favorites.add(track.id);
      toast("Added to favorites ❤️", "success");
    }
    if (State.currentTrack?.id === track.id)
      q("#playerLikeBtn").classList.toggle("liked", !isFav);
  } catch(e) { toast("Failed: " + e.message, "error"); }
}
window.toggleFavorite = function(track) { toggleFav(track); };

async function recordHistory(track) {
  try {
    await api("/api/music/history", { method: "POST", body: JSON.stringify({
      track_id: track.id, track_name: track.track_name,
      artist_name: track.artist_name, cover_url: track.cover_url,
      preview_url: track.preview_url
    })});
  } catch(e) {}
}

// ===== AUTH =====
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
  const inp = q("#"+id);
  inp.type = inp.type === "password" ? "text" : "password";
  icon.className = inp.type === "text" ? "fa fa-eye-slash pw-toggle" : "fa fa-eye pw-toggle";
};

window.handleLogin = async function() {
  const email = q("#loginEmail").value.trim();
  const pw = q("#loginPassword").value;
  const errEl = q("#loginError");
  const btn = q("#loginBtn");
  errEl.classList.add("hidden");
  if (!email || !pw) { errEl.textContent = "Fill in all fields"; errEl.classList.remove("hidden"); return; }
  btn.disabled = true; btn.textContent = "Logging in...";
  try {
    const d = await api("/api/auth/login", { method:"POST", body: JSON.stringify({email, password: pw}) });
    setUser(d.user, d.token);
    closeAuth();
    toast("Welcome back, " + d.user.username + "! 🎵", "success");
    navigate("home");
  } catch(e) {
    errEl.textContent = e.message;
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false; btn.textContent = "Log In";
  }
};

window.handleRegister = async function() {
  const username = q("#regUsername").value.trim();
  const email = q("#regEmail").value.trim();
  const pw = q("#regPassword").value;
  const errEl = q("#regError");
  const btn = q("#registerBtn");
  errEl.classList.add("hidden");
  if (!username || !email || !pw) { errEl.textContent = "Fill in all fields"; errEl.classList.remove("hidden"); return; }
  if (pw.length < 6) { errEl.textContent = "Password min 6 characters"; errEl.classList.remove("hidden"); return; }
  btn.disabled = true; btn.textContent = "Creating...";
  try {
    const d = await api("/api/auth/register", { method:"POST", body: JSON.stringify({username, email, password: pw}) });
    setUser(d.user, d.token);
    closeAuth();
    toast("Welcome to ALMEER MUSIC! 🎵", "success");
    navigate("home");
  } catch(e) {
    errEl.textContent = e.message;
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false; btn.textContent = "Create Account";
  }
};

function setUser(user, token) {
  State.user = user; State.token = token;
  localStorage.setItem("almeer_token", token);
  const ini = user.username[0].toUpperCase();
  q("#sidebarUser").classList.remove("hidden");
  q("#sidebarLogin").classList.add("hidden");
  q("#sidebarAvatar").textContent = ini;
  q("#sidebarUsername").textContent = user.username;
  q("#sidebarRole").textContent = user.role;
  q("#topbarUser").classList.remove("hidden");
  q("#topbarLogin").classList.add("hidden");
  q("#topbarAvatar").textContent = ini;
  q("#topbarUsername").textContent = user.username;
  qa(".auth-only").forEach(el => el.classList.remove("hidden"));
  loadFavs();
  updateBottomNav();
}

window.logout = function() {
  State.user = null; State.token = null; State.favorites.clear();
  localStorage.removeItem("almeer_token");
  q("#sidebarUser").classList.add("hidden");
  q("#sidebarLogin").classList.remove("hidden");
  q("#topbarUser").classList.add("hidden");
  q("#topbarLogin").classList.remove("hidden");
  qa(".auth-only").forEach(el => el.classList.add("hidden"));
  closeUserMenu(); updateBottomNav();
  toast("Logged out"); navigate("home");
};

async function checkAuth() {
  if (!State.token) return;
  try {
    const d = await api("/api/auth/me");
    setUser(d, State.token);
  } catch(e) { localStorage.removeItem("almeer_token"); State.token = null; }
}

async function loadFavs() {
  if (!State.user) return;
  try {
    const d = await api("/api/music/favorites");
    State.favorites = new Set((d.results||[]).map(f => f.track_id));
  } catch(e) {}
}

// ===== MENUS =====
window.toggleUserMenu = function() { q("#userMenu").classList.toggle("hidden"); };
function closeUserMenu() { q("#userMenu")?.classList.add("hidden"); }
document.addEventListener("click", e => { if (!e.target.closest(".dropdown")) closeUserMenu(); });

window.toggleSidebar = function() {
  q("#sidebar").classList.toggle("open");
  q("#sidebarBackdrop")?.classList.toggle("show");
};
window.closeSidebar = function() {
  q("#sidebar").classList.remove("open");
  q("#sidebarBackdrop")?.classList.remove("show");
};

// ===== NAVIGATION =====
window.navigate = function(page) {
  State.currentPage = page;
  qa(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  qa(".bottom-nav-item").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  closeSidebar();
  q("#pageContent").innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`;
  ({home:renderHome, search:renderSearch, trending:renderTrending,
    genres:renderGenres, favorites:renderFavs, playlists:renderPlaylists,
    history:renderHistory}[page] || renderHome)();
};

function updateBottomNav() {
  const show = !!State.user;
  ["bnFav","bnPl"].forEach(id => {
    const el = q("#"+id);
    if (el) el.style.display = show ? "flex" : "none";
  });
}

// ===== HOME =====
async function renderHome() {
  q("#pageContent").innerHTML = `
    <div class="hero-banner">
      <div class="hero-text">
        <div class="hero-badge">🔥 Now Streaming</div>
        <h1 class="hero-title">Your Music.<br/><span>Your World.</span></h1>
        <p class="hero-subtitle">Stream free — no account needed!</p>
        <div class="hero-actions">
          <button class="btn-primary" onclick="navigate('trending')"><i class="fa fa-fire"></i> Trending</button>
          <button class="btn-outline" onclick="navigate('genres')"><i class="fa fa-music"></i> Genres</button>
        </div>
      </div>
    </div>
    <section class="mb-24">
      <div class="section-header">
        <h2 class="section-title">🔥 Trending</h2>
        <span class="section-link" onclick="navigate('trending')">See all</span>
      </div>
      <div id="homeTrending"><div class="spinner-wrap"><div class="spinner"></div></div></div>
    </section>
    <section class="mb-24">
      <div class="section-header"><h2 class="section-title">🎵 Genres</h2></div>
      ${genreGrid(true)}
    </section>`;
  try {
    const d = await api("/api/music/trending");
    const tracks = d.results || [];
    window.__ht = tracks;
    const el = q("#homeTrending");
    if (!el) return;
    if (!tracks.length) { el.innerHTML = emptyState("😔","No trending data right now"); return; }
    el.innerHTML = cardsGrid(tracks.slice(0,8), "__ht");
  } catch(e) {
    const el = q("#homeTrending");
    if (el) el.innerHTML = emptyState("⚠️","Failed to load. Check connection.");
  }
}

// ===== SEARCH =====
function renderSearch() {
  q("#pageContent").innerHTML = `
    <div class="search-hero">
      <h2>Search Music</h2>
      <p>Find any song or artist</p>
      <div class="search-big-input">
        <input id="searchBigInput" placeholder="Search songs, artists..." onkeyup="if(event.key==='Enter')doSearch(this.value.trim())" />
        <button class="btn-primary" onclick="doSearch(q('#searchBigInput').value.trim())"><i class="fa fa-search"></i></button>
      </div>
    </div>
    ${genreGrid(false)}
    <div id="searchResults" style="margin-top:20px;"></div>`;
}

window.performSearch = function() {
  const v = q("#topSearchInput").value.trim();
  if (!v) return;
  navigate("search");
  setTimeout(() => { const el = q("#searchBigInput"); if(el) { el.value=v; doSearch(v); } }, 200);
};
window.handleSearchKey = function(e) { if(e.key==="Enter") window.performSearch(); };
window.searchArtist = function(name) {
  navigate("search");
  setTimeout(() => { const el = q("#searchBigInput"); if(el) { el.value=name; doSearch(name); } }, 200);
};

window.doSearch = async function(v) {
  if (!v) return;
  const el = q("#searchResults");
  if (!el) return;
  el.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`;
  try {
    const d = await api("/api/music/search?q=" + encodeURIComponent(v) + "&limit=20");
    const tracks = d.results || [];
    window.__sr = tracks;
    if (!tracks.length) { el.innerHTML = emptyState("🔍","No results found"); return; }
    el.innerHTML = `<div class="section-header"><h2 class="section-title">Results for "${esc(v)}"</h2><span class="text-muted">${tracks.length} songs</span></div>
    <div class="track-list">${tracks.map((t,i) => trackItem(t,i,"__sr")).join("")}</div>`;
  } catch(e) { el.innerHTML = emptyState("⚠️","Search failed. Try again."); }
};

// ===== TRENDING =====
async function renderTrending() {
  q("#pageContent").innerHTML = `
    <div class="section-header mb-24"><h2 class="section-title">🔥 Trending Songs</h2></div>
    <div id="trendingList"><div class="spinner-wrap"><div class="spinner"></div></div></div>`;
  try {
    const d = await api("/api/music/trending");
    const tracks = d.results || [];
    window.__tr = tracks;
    const el = q("#trendingList");
    if (!el) return;
    if (!tracks.length) { el.innerHTML = emptyState("📡","No trending data"); return; }
    el.innerHTML = `<div style="margin-bottom:14px;"><button class="btn-primary btn-sm" onclick="setQueue(window.__tr,0)"><i class="fa fa-play"></i> Play All</button></div>
    <div class="track-list">${tracks.map((t,i) => trackItem(t,i,"__tr")).join("")}</div>`;
  } catch(e) { const el = q("#trendingList"); if(el) el.innerHTML = emptyState("⚠️","Failed to load"); }
}

// ===== GENRES =====
const GENRES = [
  {id:"afrobeats",name:"Afrobeats",icon:"🌍",color:"linear-gradient(135deg,#007730,#004d20)"},
  {id:"hiphop",name:"Hip-Hop",icon:"🎤",color:"linear-gradient(135deg,#005522,#003311)"},
  {id:"pop",name:"Pop",icon:"⭐",color:"linear-gradient(135deg,#006633,#004422)"},
  {id:"rnb",name:"R&B",icon:"🎷",color:"linear-gradient(135deg,#008844,#005522)"},
  {id:"gospel",name:"Gospel",icon:"🙏",color:"linear-gradient(135deg,#004422,#002211)"},
  {id:"jazz",name:"Jazz",icon:"🎺",color:"linear-gradient(135deg,#005533,#003322)"},
  {id:"rock",name:"Rock",icon:"🎸",color:"linear-gradient(135deg,#003311,#001a08)"},
  {id:"electronic",name:"Electronic",icon:"⚡",color:"linear-gradient(135deg,#009944,#006633)"},
  {id:"reggae",name:"Reggae",icon:"🏝️",color:"linear-gradient(135deg,#00aa44,#007730)"},
  {id:"classical",name:"Classical",icon:"🎻",color:"linear-gradient(135deg,#004d22,#002211)"}
];

function genreGrid(mini) {
  const list = mini ? GENRES.slice(0,6) : GENRES;
  return `<div class="genre-grid">${list.map(g =>
    `<div class="genre-card" style="background:${g.color}" onclick="loadGenre('${g.id}','${g.name}')">
      <div class="genre-icon">${g.icon}</div><div>${g.name}</div>
    </div>`).join("")}</div>`;
}

function renderGenres() {
  q("#pageContent").innerHTML = `
    <div class="section-header mb-24"><h2 class="section-title">🎵 Browse by Genre</h2></div>
    ${genreGrid(false)}
    <div id="genreResults" style="margin-top:20px;"></div>`;
}

window.loadGenre = async function(id, name) {
  if (State.currentPage !== "genres" && State.currentPage !== "search") {
    navigate("genres");
    setTimeout(() => window.loadGenre(id, name), 300);
    return;
  }
  const el = q("#genreResults") || q("#searchResults");
  if (!el) return;
  el.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`;
  try {
    const d = await api("/api/music/genre/" + id);
    const tracks = d.results || [];
    window.__gr = tracks;
    if (!tracks.length) { el.innerHTML = emptyState("🎵","No tracks found"); return; }
    el.innerHTML = `<div class="section-header"><h2 class="section-title">${esc(name)}</h2>
      <button class="btn-primary btn-sm" onclick="setQueue(window.__gr,0)"><i class="fa fa-play"></i> Play All</button></div>
    <div class="track-list">${tracks.map((t,i) => trackItem(t,i,"__gr")).join("")}</div>`;
  } catch(e) { el.innerHTML = emptyState("⚠️","Failed to load"); }
};

// ===== FAVORITES =====
async function renderFavs() {
  if (!State.user) {
    q("#pageContent").innerHTML = `<div class="empty-state"><div class="empty-icon">❤️</div><h3>Liked Songs</h3><p>Login to save favorites</p>
      <button class="btn-primary mt-16" onclick="showAuth()"><i class="fa fa-sign-in-alt"></i> Login</button></div>`;
    return;
  }
  q("#pageContent").innerHTML = `<div class="section-header mb-24"><h2 class="section-title">❤️ Favorites</h2></div>
    <div id="favList"><div class="spinner-wrap"><div class="spinner"></div></div></div>`;
  try {
    const d = await api("/api/music/favorites");
    const items = d.results || [];
    const el = q("#favList");
    if (!items.length) { el.innerHTML = emptyState("💔","No favorites yet. Tap ❤️ on any song!"); return; }
    const tracks = items.map(t => ({id:t.track_id,track_name:t.track_name,artist_name:t.artist_name,
      album_name:t.album_name,cover_url:t.cover_url,preview_url:t.preview_url,duration:t.duration}));
    tracks.forEach(t => State.favorites.add(t.id));
    window.__fv = tracks;
    el.innerHTML = `<div style="margin-bottom:14px;"><button class="btn-primary btn-sm" onclick="setQueue(window.__fv,0)"><i class="fa fa-play"></i> Play All</button></div>
    <div class="track-list">${tracks.map((t,i) => trackItem(t,i,"__fv")).join("")}</div>`;
  } catch(e) { q("#favList").innerHTML = emptyState("⚠️","Failed to load"); }
}

// ===== PLAYLISTS =====
async function renderPlaylists() {
  if (!State.user) {
    q("#pageContent").innerHTML = `<div class="empty-state"><div class="empty-icon">🎵</div><h3>My Playlists</h3><p>Login to manage playlists</p>
      <button class="btn-primary mt-16" onclick="showAuth()"><i class="fa fa-sign-in-alt"></i> Login</button></div>`;
    return;
}
