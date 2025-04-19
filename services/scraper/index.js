const path = require("path");
const fs = require("fs");
const logger = require("../../config/logger");
const Article = require("../../models/Article");
const Scraper = require("../../models/Scraper");
const { processArticleAI } = require("../ai");

async function scrapeSource(sourceConfig) {
  const { name, url, scraperFile } = sourceConfig;
  logger.info("Initiating scrape for source", { source: name });
  if (!scraperFile) throw new Error(`No scraperFile specified for source '${name}'`);
  const scraperPath = path.join(__dirname, `${scraperFile}.js`);
  if (!fs.existsSync(scraperPath)) throw new Error(`Scraper file '${scraperFile}.js' not found for source '${name}'`);
  const scraperModule = require(scraperPath);
  if (typeof scraperModule.scrape !== "function") throw new Error(`Scraper '${scraperFile}.js' must export a 'scrape' function`);
  const rawArticles = await scraperModule.scrape();
  if (!Array.isArray(rawArticles)) throw new Error(`Scraper '${scraperFile}.js' must return an array of articles`);
  logger.debug("Processing scraped articles", { count: rawArticles.length });
  let newCount = 0;
  let updatedCount = 0;
  for (const raw of rawArticles) {
    try {
      const exists = await Article.findOne({ link: raw.link });
      if (exists) {
        if (exists.moderationStatus === "scraped") {
          await Article.updateOne(
            { link: raw.link },
            {
              $set: {
                title: raw.title,
                source: raw.source,
                domain: raw.domain,
                publishedAt: raw.publishedAt || new Date(),
                description: raw.description || "",
                imageUrl: raw.imageUrl || null,
                imageWidth: raw.imageWidth || null,
                imageHeight: raw.imageHeight || null,
                category: raw.category || null, // No default "Market"
              },
            }
          );
          updatedCount++;
          logger.debug("Updated existing scraped article", { link: raw.link });
        }
        continue;
      }
      const newArticle = new Article({
        ...raw,
        category: raw.category || null, // No default "Market"
        moderationStatus: "scraped",
      });
      await newArticle.save();
      newCount++;
      logger.info("Saved new article", { title: raw.title, uuid: newArticle.uuid });
    } catch (err) {
      logger.error("Error saving/updating scraped article", { link: raw.link, error: err.message });
    }
  }
  logger.info("Scrape completed for source", { source: name, newArticles: newCount, updatedArticles: updatedCount });
  return { newCount, updatedCount };
}

async function processArticlesWithAI(sourceName) {
  logger.info("Initiating AI processing for source", { source: sourceName });
  const articles = await Article.find({ source: sourceName, moderationStatus: "scraped" });
  if (articles.length === 0) {
    logger.info("No unprocessed articles found for AI processing", { source: sourceName });
    return { processedCount: 0 };
  }
  let processedCount = 0;
  for (const article of articles) {
    try {
      logger.debug("Processing article with AI", { title: article.title });
      const aiData = await processArticleAI({
        title: article.title,
        description: article.description,
        imageUrl: article.imageUrl,
        moderationStatus: article.moderationStatus,
      });
      if (!aiData) continue;
      await Article.updateOne(
        { _id: article._id },
        {
          $set: {
            category: aiData.category,
            geotag: aiData.geotag,
            tags: aiData.tags,
            improvedDescription: aiData.improvedDescription,
            seoTitle: aiData.seoTitle,
            seoDescription: aiData.seoDescription,
            moderationStatus: "aiProcessed",
          },
        }
      );
      processedCount++;
      logger.info("Article processed by AI", { title: article.title });
    } catch (err) {
      logger.error("Error processing article with AI", { title: article.title, error: err.message });
    }
  }
  logger.info("AI processing completed", { source: sourceName, processedCount });
  return { processedCount };
}

async function scrapeSourceByName(sourceName) {
  logger.info("Manual scrape triggered", { source: sourceName });
  const src = await Scraper.findOne({ name: sourceName });
  if (!src) throw new Error(`Source '${sourceName}' not found in database`);
  return await scrapeSource(src);
}

module.exports = { scrapeSource, scrapeSourceByName, processArticlesWithAI };