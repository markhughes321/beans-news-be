const Parser = require("rss-parser");
const cheerio = require("cheerio");
const logger = require("../../config/logger");

const parser = new Parser();

async function scrape() {
  const feedUrl = "https://perfectdailygrind.com/feed/";
  logger.debug("Starting scrape of perfectDailyGrind", { feedUrl });

  try {
    const feed = await parser.parseURL(feedUrl);
    logger.debug("Successfully fetched RSS feed", { itemCount: feed.items.length });

    const articles = feed.items.map((item) => {
      // Use content:encoded for image extraction, fall back to description
      const htmlDesc = item["content:encoded"] || item.description || "";
      const $ = cheerio.load(htmlDesc);
      const firstImg = $("img").first();
      const src = firstImg.attr("src") || null;
      const width = firstImg.attr("width") || null;
      const height = firstImg.attr("height") || null;

      const imageWidth = width ? parseInt(width, 10) : null;
      const imageHeight = height ? parseInt(height, 10) : null;

      return {
        title: item.title?.trim() || "Untitled",
        link: item.link,
        source: "perfectDailyGrind",
        domain: "perfectdailygrind.com",
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        description: item.contentSnippet || item.description || "",
        imageUrl: src,
        imageWidth,
        imageHeight,
      };
    });

    logger.info("Completed scraping perfectDailyGrind", { articleCount: articles.length });
    return articles;
  } catch (err) {
    logger.error("Error scraping perfectDailyGrind feed", { feedUrl, error: err.message });
    return [];
  }
}

module.exports = { scrape };