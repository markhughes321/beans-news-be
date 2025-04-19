const Scraper = require("../models/Scraper");
const logger = require("../config/logger");

exports.getScrapers = async (req, res, next) => {
  try {
    const scrapers = await Scraper.find();
    res.json({ scrapers });
  } catch (err) {
    logger.error("Error fetching scrapers", { error: err.message });
    next(err);
  }
};

exports.createScraper = async (req, res, next) => {
  try {
    const { name, type, url, cronSchedule } = req.body;
    const scraperFile = `${name}Scraper`;
    const scraper = new Scraper({ name, type, url, cronSchedule, scraperFile });
    await scraper.save();
    res.status(201).json({ message: `Scraper '${name}' created`, scraper });
  } catch (err) {
    logger.error("Error creating scraper", { error: err.message });
    next(err);
  }
};