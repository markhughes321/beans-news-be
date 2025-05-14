const path = require("path");
const dotenv = require("dotenv");
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./config/database");
const routes = require("./routes");
const logger = require("./config/logger");
const errorHandler = require("./middleware/errorHandler");
const { initCronJobs } = require("./cron/scheduler");

// Suppress punycode deprecation warning
process.on("warning", (warning) => {
  if (warning.name === "DeprecationWarning" && warning.message.includes("punycode")) {
    // Suppress silently or log to debug only
    logger.debug("Suppressed punycode deprecation warning", { warning: warning.message });
  }
});

// Load .env
const envPath = path.join(__dirname, ".env");
const dotenvResult = dotenv.config({ path: envPath });
if (dotenvResult.error) {
  logger.error("Failed to load .env", { error: dotenvResult.error.message });
  process.exit(1);
}
logger.info(".env loaded successfully");

const PORT = process.env.PORT || 3000;

async function startServer() {
  logger.info(`Starting server on port ${PORT}`);
  await connectDB();
  const app = express();
  const allowedOrigins = [
    "http://localhost:3010",
    "https://beans-news-fe.netlify.app",
    "https://beans.ie",
    "http://192.168.0.44:3020"
  ];
  app.use(cors({
    origin: (origin, callback) => {
      logger.debug("CORS check", { origin, allowedOrigins });
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn("CORS rejected", { origin });
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false
  }));
  app.use(express.json());
  app.use("/api", routes);
  app.use(errorHandler);
  app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
  });
  initCronJobs();
}

startServer().catch((error) => {
  logger.error("Error starting server", { error: error.message });
  process.exit(1);
});