const Parser = require("rss-parser");
const cheerio = require("cheerio");
const axios = require("axios");
const logger = require("../../config/logger");

const parser = new Parser({
  customFields: {
    item: ["content:encoded"], // Include content:encoded tag from RSS feed
  },
});

async function scrape() {
  const feedUrl = "https://sprudge.com/news/feed";
  logger.debug("Starting scrape of Sprudge news", { feedUrl });

  try {
    const feed = await parser.parseURL(feedUrl);
    logger.debug("Successfully fetched RSS feed", { itemCount: feed.items.length });

    const articles = await Promise.all(
      feed.items.map(async (item) => {
        let imageUrl = null;
        let imageWidth = null;
        let imageHeight = null;
        let description = "";

        // Scrape the article page for OG image metadata and meta description
        try {
          const response = await axios.get(item.link, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; SprudgeScraper/1.0)",
            },
          });
          const $ = cheerio.load(response.data);

          // Extract OG image metadata
          imageUrl = $('meta[property="og:image"]').attr("content") || null;
          imageWidth = $('meta[property="og:image:width"]').attr("content")
            ? parseInt($('meta[property="og:image:width"]').attr("content"), 10)
            : null;
          imageHeight = $('meta[property="og:image:height"]').attr("content")
            ? parseInt($('meta[property="og:image:height"]').attr("content"), 10)
            : null;

          // Extract meta description as fallback
          const metaDescription = $('meta[name="description"]').attr("content") || "";

          // Process RSS description and content:encoded
          const rssDescription = item.description
            ? item.description.replace(/<[^>]+>/g, "").replace(/This article is from the coffee website Sprudge.*?RSS feed version\.\s*/, "").trim()
            : "";
          const encodedContent = item["content:encoded"]
            ? cheerio.load(item["content:encoded"]).text().trim().substring(0, 300) // Limit to 300 chars
            : "";

          // Prioritize encoded content, fall back to meta description, then RSS description
          description = encodedContent || metaDescription || rssDescription || "No description available";

          logger.debug("Scraped article page", {
            link: item.link,
            imageUrl,
            imageWidth,
            imageHeight,
            description,
          });
        } catch (err) {
          logger.warn("Failed to scrape article page", {
            link: item.link,
            error: err.message,
          });

          // Fallback to RSS content:encoded or description if page scrape fails
          const rssDescription = item.description
            ? item.description.replace(/<[^>]+>/g, "").replace(/This article is from the coffee website Sprudge.*?RSS feed version\.\s*/, "").trim()
            : "";
          const encodedContent = item["content:encoded"]
            ? cheerio.load(item["content:encoded"]).text().trim().substring(0, 300)
            : "";
          description = encodedContent || rssDescription || "No description available";
        }

        // Parse domain from link
        let domain = "sprudge.com";
        try {
          const url = new URL(item.link);
          domain = url.hostname;
        } catch (err) {
          logger.warn("Failed to parse domain", { link: item.link, error: err.message });
        }

        return {
          title: item.title?.trim() || "Untitled",
          link: item.link,
          source: "sprudge",
          domain: "sprudge.com",
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          description,
          imageUrl,
          imageWidth,
          imageHeight,
        };
      })
    );

    logger.info("Completed scraping Sprudge news", { articleCount: articles.length });
    return articles;
  } catch (err) {
    logger.error("Error scraping Sprudge news feed", { feedUrl, error: err.message });
    return [];
  }
}

module.exports = { scrape };