require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api/", limiter);

// ===== STATIC FILES =====
app.use(express.static(path.join(__dirname, "public")));

// ===== ROUTES =====
const authRoutes = require("./routes/auth");
const musicRoutes = require("./routes/music");

app.use("/api/auth", authRoutes);
app.use("/api/music", musicRoutes);

// ===== HEALTH CHECK =====
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "ALMEER MUSIC",
    time: new Date().toISOString()
  });
});

// ===== CATCH ALL - Serve frontend =====
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===== ERROR HANDLER =====
app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error"
  });
});

// ===== START SERVER =====
const { initializeDatabase } = require("./db/database");

initializeDatabase()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🎵 ALMEER MUSIC running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
    });
  })
  .catch(err => {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  });
