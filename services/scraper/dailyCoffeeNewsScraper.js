const Parser = require("rss-parser");
const cheerio = require("cheerio");
const logger = require("../../config/logger");

const parser = new Parser();

async function scrape() {
  const feedUrl = "https://dailycoffeenews.com/feed/";
  logger.debug("Starting scrape of dailyCoffeeNews", { feedUrl });

  try {
    const feed = await parser.parseURL(feedUrl);
    logger.debug("Successfully fetched RSS feed", { itemCount: feed.items.length });

    const articles = feed.items.map((item) => {
      const htmlDesc = item.content || item.description || "";
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
        source: "dailyCoffeeNews",
        domain: "dailycoffeenews.com",
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        description: item.contentSnippet || item.description || "",
        imageUrl: src,
        imageWidth,
        imageHeight,
      };
    });

    logger.info("Completed scraping dailyCoffeeNews", { articleCount: articles.length });
    return articles;
  } catch (err) {
    logger.error("Error scraping dailyCoffeeNews feed", { feedUrl, error: err.message });
    return [];
  }
}

module.exports = { scrape };