const { createLogger, format, transports } = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const fs = require("fs");
const path = require("path");

// Directory for logs
const logDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Daily log file configuration
const fileTransport = new DailyRotateFile({
  filename: path.join(logDir, "beans-news-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  maxFiles: "7d", // Keep logs for 7 days
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.json()
  ),
  level: "debug", // Capture all levels including debug
});

// Logger instance
const logger = createLogger({
  level: "debug",
  format: format.combine(format.timestamp(), format.json()),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      ),
    }),
    fileTransport,
  ],
});

// Cleanup function to ensure old logs are removed (redundant with maxFiles, but added for robustness)
function cleanOldLogs() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  fs.readdir(logDir, (err, files) => {
    if (err) {
      logger.error("Failed to read log directory for cleanup", { error: err });
      return;
    }
    files.forEach((file) => {
      const filePath = path.join(logDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          logger.error("Failed to stat log file", { file, error: err });
          return;
        }
        if (stats.mtime < sevenDaysAgo) {
          fs.unlink(filePath, (err) => {
            if (err) {
              logger.error("Failed to delete old log file", { file, error: err });
            } else {
              logger.info("Deleted old log file", { file });
            }
          });
        }
      });
    });
  });
}

// Run cleanup on startup and schedule daily
cleanOldLogs();
require("node-cron").schedule("0 0 * * *", cleanOldLogs, { scheduled: true });

module.exports = logger;