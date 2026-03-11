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

const audio = document.getElementById("audioPlayer");
const playIcon = document.getElementById("playIcon");
const progressFill = document.getElementById("progressFill");
const progressThumb = document.getElementById("progressThumb");
const currentTimeEl = document.getElementById("currentTime");
const totalTimeEl = document.getElementById("totalTime");
const playerTitle = document.getElementById("playerTitle");
const playerArtist = document.getElementById("playerArtist");
const playerCover = document.getElementById("playerCover");
const playerLikeBtn = document.getElementById("playerLikeBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const repeatBtn = document.getElementById("repeatBtn");

audio.volume = 0.8;

audio.addEventListener("timeupdate", () => {
  if (audio.duration) {
    const pct = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = pct + "%";
    if (progressThumb) progressThumb.style.left = pct + "%";
    currentTimeEl.textContent = formatTime(audio.currentTime);
  }
});

audio.addEventListener("loadedmetadata", () => {
  totalTimeEl.textContent = formatTime(audio.duration);
});

audio.addEventListener("ended", () => {
  if (State.repeatMode === 2) {
    audio.currentTime = 0;
    audio.play();
  } else {
    nextTrack();
  }
});

audio.addEventListener("play", () => {
  State.isPlaying = true;
  playIcon.className = "fa fa-pause";
});

audio.addEventListener("pause", () => {
  State.isPlaying = false;
  playIcon.className = "fa fa-play";
});

audio.addEventListener("error", () => {
  showToast("No preview available", "error");
  playIcon.className = "fa fa-play";
});

// ===== PLAYER CONTROLS =====
function togglePlay() {
  if (!State.currentTrack) return showToast("Select a song first");
  if (audio.paused) audio.play();
  else audio.pause();
}

function prevTrack() {
  if (State.queueIndex > 0) {
    State.queueIndex--;
    playTrack(State.queue[State.queueIndex], false);
  } else if (audio.currentTime > 3) {
    audio.currentTime = 0;
  }
}

function nextTrack() {
  if (State.queue.length === 0) return;
  if (State.isShuffle) {
    State.queueIndex = Math.floor(Math.random() * State.queue.length);
  } else {
    if (State.queueIndex < State.queue.length - 1) {
      State.queueIndex++;
    } else if (State.repeatMode === 1) {
      State.queueIndex = 0;
    } else return;
  }
  playTrack(State.queue[State.queueIndex], false);
}

function toggleShuffle() {
  State.isShuffle = !State.isShuffle;
  shuffleBtn.classList.toggle("active", State.isShuffle);
  showToast(State.isShuffle ? "Shuffle on 🔀" : "Shuffle off");
}

function toggleRepeat() {
  State.repeatMode = (State.repeatMode + 1) % 3;
  const labels = ["Repeat off", "Repeat all 🔁", "Repeat one 🔂"];
  repeatBtn.classList.toggle("active", State.repeatMode > 0);
  showToast(labels[State.repeatMode]);
}

function seekTo(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  if (audio.duration) audio.currentTime = pct * audio.duration;
}

function setVolume(val) {
  audio.volume = val / 100;
  const volIcon = document.getElementById("volIcon");
  if (!volIcon) return;
  if (val == 0) volIcon.className = "fa fa-volume-mute";
  else if (val < 50) volIcon.className = "fa fa-volume-down";
  else volIcon.className = "fa fa-volume-up";
}

function toggleMute() {
  audio.muted = !audio.muted;
  const volIcon = document.getElementById("volIcon");
  if (volIcon) volIcon.className = audio.muted ? "fa fa-volume-mute" : "fa fa-volume-up";
}

async function playTrack(track, addToQueue = true) {
  if (!track.preview_url) {
    showToast("No preview available for this track", "error");
    if (track.external_url) window.open(track.external_url, "_blank");
    return;
  }

  State.currentTrack = track;

  if (addToQueue) {
    State.queue = [track];
    State.queueIndex = 0;
  }

  playerTitle.textContent = track.track_name;
  playerArtist.textContent = track.artist_name;
  playerCover.src = track.cover_url || "";
  playerCover.onerror = () => { playerCover.src = ""; };
  playerLikeBtn.classList.toggle("liked", State.favorites.has(track.id));

  audio.src = track.preview_url;
  try {
    await audio.play();
  } catch (e) {
    showToast("Tap play to start 🎵");
  }

  if (State.user && State.token) recordHistory(track);

  document.querySelectorAll(".track-item").forEach(el => {
    el.classList.toggle("playing", el.dataset.trackId === track.id);
  });
}

function setQueue(tracks, startIndex = 0) {
  if (!tracks || tracks.length === 0) return;
  window.__currentTracks = tracks;
  State.queue = tracks;
  State.queueIndex = startIndex;
  playTrack(tracks[startIndex], false);
}

// ===== FAVORITES =====
async function toggleFavorite(track) {
  if (!State.user) {
    showToast("Login to save favorites ❤️");
    showAuth();
    return;
  }

  const isFav = State.favorites.has(track.id);
  try {
    if (isFav) {
      await apiFetch(`/api/music/favorites/${encodeURIComponent(track.id)}`, { method: "DELETE" });
      State.favorites.delete(track.id);
      showToast("Removed from favorites");
    } else {
      await apiFetch("/api/music/favorites", {
        method: "POST",
        body: JSON.stringify(track)
      });
      State.favorites.add(track.id);
      showToast("Added to favorites ❤️", "success");
    }
    if (State.currentTrack?.id === track.id) {
      playerLikeBtn.classList.toggle("liked", !isFav);
    }
  } catch (e) {
    showToast("Failed to update favorites", "error");
  }
}

function toggleCurrentFavorite() {
  if (!State.currentTrack) return;
  toggleFavorite(State.currentTrack);
}

async function loadFavorites() {
  if (!State.user) return;
  try {
    const data = await apiFetch("/api/music/favorites");
    State.favorites = new Set(data.results.map(f => f.track_id));
  } catch (e) {}
}

async function recordHistory(track) {
  try {
    await apiFetch("/api/music/history", {
      method: "POST",
      body: JSON.stringify({
        track_id: track.id,
        track_name: track.track_name,
        artist_name: track.artist_name,
        cover_url: track.cover_url,
        preview_url: track.preview_url
      })
    });
  } catch (e) {}
}

// ===== API HELPER =====
async function apiFetch(url, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (State.token) headers["Authorization"] = `Bearer ${State.token}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ===== AUTH =====
async function handleLogin() {
  const emailEl = document.getElementById("loginEmail");
  const passwordEl = document.getElementById("loginPassword");
  const errorEl = document.getElementById("loginError");
  const btn = document.getElementById("loginBtn");

  if (!emailEl || !passwordEl) return;

  const email = emailEl.value.trim();
  const password = passwordEl.value;

  errorEl.classList.add("hidden");

  if (!email || !password) {
    errorEl.textContent = "Please fill in all fields";
    errorEl.classList.remove("hidden");
    return;
  }

  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Logging in...';
  btn.disabled = true;

  try {
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    setUser(data.user, data.token);
    closeAuth();
    showToast(`Welcome back, ${data.user.username}! 🎵`, "success");
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.classList.remove("hidden");
  } finally {
    btn.innerHTML = '<span>Log In</span><i class="fa fa-arrow-right"></i>';
    btn.disabled = false;
  }
}

async function handleRegister() {
  const usernameEl = document.getElementById("regUsername");
  const emailEl = document.getElementById("regEmail");
  const passwordEl = document.getElementById("regPassword");
  const errorEl = document.getElementById("regError");
  const btn = document.getElementById("registerBtn");

  if (!usernameEl || !emailEl || !passwordEl) return;

  const username = usernameEl.value.trim();
  const email = emailEl.value.trim();
  const password = passwordEl.value;

  errorEl.classList.add("hidden");

  if (!username || !email || !password) {
    errorEl.textContent = "Please fill in all fields";
    errorEl.classList.remove("hidden");
    return;
  }

  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Creating...';
  btn.disabled = true;

  try {
    const data = await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password })
    });
    setUser(data.user, data.token);
    closeAuth();
    showToast(`Welcome to ALMEER MUSIC, ${data.user.username}! 🎵`, "success");
    navigate("home");
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.classList.remove("hidden");
  } finally {
    btn.innerHTML = '<span>Create Account</span><i class="fa fa-arrow-right"></i>';
    btn.disabled = false;
  }
}

function setUser(user, token) {
  State.user = user;
  State.token = token;
  if (token) localStorage.setItem("almeer_token", token);

  const initial = user.username.charAt(0).toUpperCase();

  document.getElementById("sidebarUser").classList.remove("hidden");
  document.getElementById("sidebarLogin").classList.add("hidden");
  document.getElementById("sidebarAvatar").textContent = initial;
  document.getElementById("sidebarUsername").textContent = user.username;
  document.getElementById("sidebarRole").textContent = user.role;

  document.getElementById("topbarUser").classList.remove("hidden");
  document.getElementById("topbarLogin").classList.add("hidden");
  document.getElementById("topbarAvatar").textContent = initial;
  document.getElementById("topbarUsername").textContent = user.username;

  document.querySelectorAll(".auth-only").forEach(el => el.classList.remove("hidden"));
  updateBottomNav();
  loadFavorites();
}

function logout() {
  State.user = null;
  State.token = null;
  State.favorites.clear();
  localStorage.removeItem("almeer_token");

  document.getElementById("sidebarUser").classList.add("hidden");
  document.getElementById("sidebarLogin").classList.remove("hidden");
  document.getElementById("topbarUser").classList.add("hidden");
  document.getElementById("topbarLogin").classList.remove("hidden");
  document.querySelectorAll(".auth-only").forEach(el => el.classList.add("hidden"));

  closeUserMenu();
  showToast("Logged out");
  updateBottomNav();
  navigate("home");
}

async function checkAuth() {
  if (!State.token) return;
  try {
    const data = await apiFetch("/api/auth/me");
    setUser(data, State.token);
  } catch (e) {
    localStorage.removeItem("almeer_token");
    State.token = null;
  }
}

function fillDemo(email, pw) {
  const emailEl = document.getElementById("loginEmail");
  const pwEl = document.getElementById("loginPassword");
  if (emailEl) emailEl.value = email;
  if (pwEl) pwEl.value = pw;
}

// ===== AUTH MODAL =====
function showAuth() {
  document.getElementById("authOverlay").classList.remove("hidden");
  document.getElementById("loginForm").classList.remove("hidden");
  document.getElementById("registerForm").classList.add("hidden");
}

function showRegister() {
  document.getElementById("authOverlay").classList.remove("hidden");
  document.getElementById("loginForm").classList.add("hidden");
  document.getElementById("registerForm").classList.remove("hidden");
}

function showLogin() {
  document.getElementById("loginForm").classList.remove("hidden");
  document.getElementById("registerForm").classList.add("hidden");
}

function closeAuth() {
  document.getElementById("authOverlay").classList.add("hidden");
  const le = document.getElementById("loginError");
  const re = document.getElementById("regError");
  if (le) le.classList.add("hidden");
  if (re) re.classList.add("hidden");
}

function togglePw(id, icon) {
  const input = document.getElementById(id);
  if (!input) return;
  if (input.type === "password") {
    input.type = "text";
    icon.className = "fa fa-eye-slash pw-toggle";
  } else {
    input.type = "password";
    icon.className = "fa fa-eye pw-toggle";
  }
}

// ===== USER MENU =====
function toggleUserMenu() {
  document.getElementById("userMenu").classList.toggle("hidden");
}
function closeUserMenu() {
  const m = document.getElementById("userMenu");
  if (m) m.classList.add("hidden");
}
document.addEventListener("click", e => {
  if (!e.target.closest(".dropdown")) closeUserMenu();
});

// ===== SIDEBAR =====
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  sidebar.classList.toggle("open");
  if (backdrop) backdrop.classList.toggle("show");
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  sidebar.classList.remove("open");
  if (backdrop) backdrop.classList.remove("show");
}

// ===== NAVIGATION =====
function navigate(page) {
  State.currentPage = page;

  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });
  document.querySelectorAll(".bottom-nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });

  closeSidebar();

  const content = document.getElementById("pageContent");
  content.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`;

  const pages = {
    home: renderHome,
    search: renderSearch,
    trending: renderTrending,
    genres: renderGenres,
    favorites: renderFavorites,
    playlists: renderPlaylists,
    history: renderHistory
  };

  (pages[page] || renderHome)();
}

function updateBottomNav() {
  const favItem = document.getElementById("bnFav");
  const plItem = document.getElementById("bnPl");
  if (favItem) favItem.style.display = State.user ? "flex" : "none";
  if (plItem) plItem.style.display = State.user ? "flex" : "none";
}

// ===== HOME =====
async function renderHome() {
  const content = document.getElementById("pageContent");
  content.innerHTML = `
    <div class="hero-banner">
      <div class="hero-text">
        <div class="hero-badge">🔥 Now Streaming</div>
        <h1 class="hero-title">Your Music.<br/><span>Your World.</span></h1>
        <p class="hero-subtitle">Stream millions of songs free. No account needed!</p>
        <div class="hero-actions">
          <button class="btn-primary" onclick="navigate('trending')">
            <i class="fa fa-fire"></i> Trending
          </button>
          <button class="btn-outline" onclick="navigate('genres')">
            <i class="fa fa-music"></i> Genres
          </button>
        </div>
      </div>
      <div class="hero-visual">🎵</div>
    </div>

    <section class="mb-24">
      <div class="section-header">
        <h2 class="section-title">🔥 Trending Now</h2>
        <span class="section-link" onclick="navigate('trending')">See all</span>
      </div>
      <div id="homeTrending">
        <div class="spinner-wrap"><div class="spinner"></div></div>
      </div>
    </section>

    <section class="mb-24">
      <div class="section-header">
        <h2 class="section-title">🎸 Top Artists</h2>
      </div>
      <div id="homeArtists"></div>
    </section>

    <section class="mb-24">
      <div class="section-header">
        <h2 class="section-title">🎵 Genres</h2>
        <span class="section-link" onclick="navigate('genres')">See all</span>
      </div>
      ${renderGenreGrid(true)}
    </section>
  `;

  renderHomeArtists();

  try {
    const data = await apiFetch("/api/music/trending");
    const tracks = data.results || [];
    window.__homeCards = tracks;
    const el = document.getElementById("homeTrending");
    if (!el) return;
    if (tracks.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">😔</div><p>No trending data right now</p></div>`;
      return;
    }
    el.innerHTML = renderCardsGrid(tracks.slice(0, 8));
  } catch (e) {
    const el = document.getElementById("homeTrending");
    if (el) el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Failed to load. Check connection.</p></div>`;
  }
}

function renderHomeArtists() {
  const artists = ["Drake", "Taylor Swift", "Burna Boy", "Bad Bunny", "Wizkid", "Beyoncé"];
  const emojis = {
    "Drake": "🎤", "Taylor Swift": "🎸",
    "Burna Boy": "🌍", "Bad Bunny": "🐰",
    "Wizkid": "⭐", "Beyoncé": "👑"
  };
  const el = document.getElementById("homeArtists");
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;-webkit-overflow-scrolling:touch;">
      ${artists.map(a => `
        <div onclick="searchArtist('${a}')"
          style="flex-shrink:0;text-align:center;cursor:pointer;padding:14px 10px;background:var(--bg-card);border-radius:var(--radius);width:100px;">
          <div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--primary-dark));margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;">
            ${emojis[a]}
          </div>
          <div style="font-size:0.78rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a}</div>
        </div>
      `).join("")}
    </div>
  `;
}

// ===== SEARCH =====
function renderSearch() {
  const content = document.getElementById("pageContent");
  content.innerHTML = `
    <div class="search-hero">
      <h2>Search Music</h2>
      <p>Find any song, artist or album</p>
      <div class="search-big-input">
        <input id="searchBigInput" placeholder="Search songs, artists..."
          onkeyup="handleSearchBigKey(event)" autocomplete="off" />
        <button class="btn-primary" onclick="performBigSearch()">
          <i class="fa fa-search"></i>
        </button>
      </div>
    </div>
    <div class="section-header mb-24">
      <h2 class="section-title">🎸 Browse Genres</h2>
    </div>
    ${renderGenreGrid(false)}
    <div id="searchResults" style="margin-top:24px;"></div>
  `;
}

function handleSearchKey(e) {
  if (e.key === "Enter") performSearch();
}

function handleSearchBigKey(e) {
  if (e.key === "Enter") performBigSearch();
}

function performSearch() {
  const q = document.getElementById("topSearchInput").value.trim();
  if (!q) return;
  navigate("search");
  setTimeout(() => {
    const el = document.getElementById("searchBigInput");
    if (el) el.value = q;
    doSearch(q);
  }, 150);
}

function performBigSearch() {
  const el = document.getElementById("searchBigInput");
  const q = el?.value?.trim();
  if (q) doSearch(q);
}

function searchArtist(name) {
  navigate("search");
  setTimeout(() => {
    const el = document.getElementById("searchBigInput");
    if (el) el.value = name;
    doSearch(name);
  }, 150);
}

async function doSearch(q) {
  const resultsEl = document.getElementById("searchResults");
  if (!resultsEl) return;
  resultsEl.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`;

  try {
    const data = await apiFetch(`/api/music/search?q=${encodeURIComponent(q)}&limit=20`);
    const tracks = data.results || [];
    window.__currentTracks = tracks;

    if (tracks.length === 0) {
      resultsEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><h3>No results</h3><p>Try a different search</p></div>`;
      return;
    }

    resultsEl.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">Results for "${esc
