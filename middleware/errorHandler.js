const logger = require("../config/logger");

function errorHandler(err, req, res, next) {
  logger.error("Unhandled Error", { error: err.message, stack: err.stack });
  const status = err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
