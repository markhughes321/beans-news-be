const Parser = require("rss-parser");
const cheerio = require("cheerio");
const logger = require("../../config/logger");
const parser = new Parser();

async function scrapeRss(feedUrl, sourceName) {
  try {
    const feed = await parser.parseURL(feedUrl);
    const articles = feed.items.map((item) => {
      const htmlDesc = item.content || item.description || "";
      const $ = cheerio.load(htmlDesc);
      const firstImgSrc = $("img").first().attr("src") || null;

      return {
        title: item.title?.trim() || "Untitled",
        link: item.link,
        source: sourceName,
        domain: new URL(item.link).hostname || "unknown",
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        description: item.contentSnippet || item.description || "",
        imageUrl: firstImgSrc
      };
    });

    return articles;
  } catch (err) {
    logger.error("Error scraping RSS feed", { feedUrl, error: err });
    return [];
  }
}

module.exports = { scrapeRss };
