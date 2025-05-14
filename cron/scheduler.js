const cron = require("node-cron");
const logger = require("../config/logger");
const Scraper = require("../models/Scraper");
const { scrapeSource, processArticlesWithAI } = require("../services/scraper");
const { sendArticlesToShopify } = require("../services/shopifyService");

function initCronJobs() {
  Scraper.find().then((sources) => {
    sources.forEach((source) => {
      if (!source.cronSchedule) {
        logger.warn("No cronSchedule specified, skipping", { source: source.name });
        return;
      }
      logger.info("Scheduling cron job for source", { source: source.name, schedule: source.cronSchedule });
      cron.schedule(source.cronSchedule, async () => {
        logger.info("CRON: Starting scrape", { source: source.name });
        try {
          const { newCount } = await scrapeSource(source);
          logger.info("CRON: Scrape completed", { source: source.name, newArticles: newCount });

          // Immediately process scraped articles with AI
          logger.info("CRON: Starting AI processing", { source: source.name });
          const { processedCount } = await processArticlesWithAI(source.name);
          logger.info("CRON: AI processing completed", { source: source.name, processedCount });
        } catch (err) {
          logger.error("CRON: Error in scrape or AI processing", { source: source.name, error: err.message });
        }
      });
    });
  });

  const publishShopifySchedule = "0 8 * * *"; // Daily at 8:00 AM
  if (publishShopifySchedule) {
    logger.info("Scheduling Shopify publish", { schedule: publishShopifySchedule });
    cron.schedule(publishShopifySchedule, async () => {
      logger.info("CRON: Starting Shopify publish");
      try {
        await sendArticlesToShopify(); // Publishes all aiProcessed articles
        logger.info("CRON: Shopify publish completed");
      } catch (err) {
        logger.error("CRON: Shopify publish error", { error: err.message });
      }
    });
  } else {
    logger.warn("No publishShopifySchedule set");
  }
}

module.exports = { initCronJobs };