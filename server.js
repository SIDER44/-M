require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const rateLimit = require("express-rate-limit");
const { initializeDatabase } = require("./db/database");

const app = express();

initializeDatabase();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "fonts.gstatic.com", "cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "*"],
      mediaSrc: ["'self'", "*"],
      connectSrc: ["'self'", "*"]
    }
  }
}));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: "Too many requests, please try again later" }
});
app.use("/api/", apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many auth attempts, please wait 15 minutes" }
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/music", require("./routes/music"));

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    app: "ALMEER MUSIC",
    version: "1.0.0",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
🎵 ═══════════════════════════════════════════
   ALMEER MUSIC Server Running!
   Port: ${PORT}
   URL: http://localhost:${PORT}
   
   Demo Accounts:
   📧 admin@almeermusic.com / Admin@1234
   📧 demo@almeermusic.com  / Demo@1234
🎵 ═══════════════════════════════════════════
  `);
});

module.exports = app;
