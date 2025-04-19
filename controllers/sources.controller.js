const fs = require("fs");
const path = require("path");
const logger = require("../config/logger");

const getSources = (req, res, next) => {
  try {
    const configPath = path.join(__dirname, "../config/sources.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    res.json(config);
  } catch (err) {
    logger.error("Error fetching sources", { error: err.message });
    next(err);
  }
};

module.exports = { getSources };