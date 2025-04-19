const path = require("path");
const dotenv = require("dotenv");
const express = require("express");
const { connectDB } = require("./config/database");
const routes = require("./routes");
const logger = require("./config/logger");
const errorHandler = require("./middleware/errorHandler");
const { initCronJobs } = require("./cron/scheduler");

// Load .env
const envPath = path.join(__dirname, ".env");
console.log(envPath)
const dotenvResult = dotenv.config({ path: envPath });
if (dotenvResult.error) {
  logger.error("Failed to load .env:", dotenvResult.error.message);
  process.exit(1);
}
logger.info(".env loaded successfully");
// Add debug logging
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "[SET]" : "[UNSET]");
console.log("SHOPIFY_ACCESS_TOKEN:", process.env.SHOPIFY_ACCESS_TOKEN ? "[SET]" : "[UNSET]");
console.log("MONGO_URI:", process.env.MONGO_URI);

const PORT = process.env.PORT || 3000;

async function startServer() {
  logger.info("Starting server...", {
    env: {
      PORT: process.env.PORT,
      MONGO_URI: process.env.MONGO_URI ? "[REDACTED]" : undefined,
      SHOPIFY_ACCESS_TOKEN: process.env.SHOPIFY_ACCESS_TOKEN ? "[REDACTED]" : undefined,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "[REDACTED]" : undefined,
    },
  });

  await connectDB();

  const app = express();
  app.use(express.json());
  app.use("/api", routes);
  app.use(errorHandler);

  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });

  initCronJobs();
}

startServer().catch((error) => {
  logger.error("Error starting server", { error });
  process.exit(1);
});