const mongoose = require("mongoose");

const ScraperSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, match: /^[a-zA-Z]+$/ },
  type: { type: String, required: true, enum: ["rss", "html", "api"] },
  url: { type: String, required: true },
  cronSchedule: { type: String, required: true },
  scraperFile: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model("Scraper", ScraperSchema);