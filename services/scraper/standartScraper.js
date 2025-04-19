const axios = require("axios");
const cheerio = require("cheerio");
const logger = require("../../config/logger");

async function fetchArticleDate(articleUrl) {
  try {
    const response = await axios.get(articleUrl, {
      timeout: 10000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BeansNewsBot/1.0)" },
    });
    const $ = cheerio.load(response.data);

    // 1. Primary source: <time datetime="..."> in article-meta__date
    const timeElement = $(".article-meta__date time").attr("datetime");
    if (timeElement) {
      const publishedAt = new Date(timeElement);
      if (!isNaN(publishedAt)) {
        logger.debug("Extracted publish date from datetime", { url: articleUrl, date: publishedAt });
        return publishedAt;
      }
    }

    // 2. Fallback: Open Graph meta tag
    const ogDate = $("meta[property='article:published_time']").attr("content");
    if (ogDate) {
      const publishedAt = new Date(ogDate);
      if (!isNaN(publishedAt)) {
        logger.debug("Extracted publish date from Open Graph", { url: articleUrl, date: publishedAt });
        return publishedAt;
      }
    }

    // 3. Fallback: Text inside <time> tag (e.g., "Nov 29, 2024")
    const timeText = $(".article-meta__date time").text().trim();
    if (timeText) {
      const publishedAt = new Date(timeText);
      if (!isNaN(publishedAt)) {
        logger.debug("Extracted publish date from time text", { url: articleUrl, date: publishedAt });
        return publishedAt;
      }
    }

    // 4. Default to current date if not found
    logger.debug("No publish date found, using current date", { url: articleUrl });
    return new Date();
  } catch (err) {
    logger.error("Error fetching article date", { url: articleUrl, error: err.message });
    return new Date(); // Fallback on error
  }
}

async function scrape() {
  const baseUrl = "https://standartmag.com/blogs/journal";
  const articles = [];
  let page = 1;
  let hasMorePages = true;

  logger.debug("Starting scrape of Standart Magazine", { baseUrl });

  // Step 1: Scrape homepage for article summaries
  while (hasMorePages) {
    const url = `${baseUrl}?page=${page}`;
    try {
      logger.debug("Fetching page", { url });
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BeansNewsBot/1.0)" },
      });
      const $ = cheerio.load(response.data);

      const blogItems = $("article.blog-item");
      logger.debug("Found blog items", { count: blogItems.length, page });

      if (blogItems.length === 0) {
        logger.debug("No articles found on this page", { page });
        hasMorePages = false;
        break;
      }

      blogItems.each((i, element) => {
        const $item = $(element);

        const titleElement = $item.find(".blog-item__title-holder a");
        const title = titleElement.find("span").first().text().replace(/\s+/g, " ").trim() || "Untitled";
        const relativeLink = titleElement.attr("href");
        const link = relativeLink ? `https://standartmag.com${relativeLink}` : null;

        const imgElement = $item.find(".blog-item__image img");
        const imageUrl = imgElement.attr("src") || null;
        const imageWidth = parseInt(imgElement.attr("width"), 10) || null;
        const imageHeight = parseInt(imgElement.attr("height"), 10) || null;

        const descriptionElement = $item.find(".blog-item__excerpt");
        const description = descriptionElement
          .contents()
          .filter((_, el) => el.nodeType === 3 || (el.tagName && el.tagName.toLowerCase() !== "strong"))
          .text()
          .replace(/\s+/g, " ")
          .trim() || "";

        if (link) {
          articles.push({
            title,
            link,
            source: "standart",
            domain: "standartmag.com",
            description,
            imageUrl: imageUrl ? `https:${imageUrl}` : null,
            imageWidth,
            imageHeight,
          });
          logger.debug("Extracted article", { title, link, page });
        }
      });

      const nextPageLink = $(".pagination .next").attr("href");
      logger.debug("Next page link", { nextPageLink, page });
      hasMorePages = !!nextPageLink && page < 10; // Cap at 10 pages
      page++;
    } catch (err) {
      logger.error("Error scraping Standart page", { url, error: err.message });
      hasMorePages = false;
    }
  }

  // Step 2: Fetch publication dates concurrently
  const concurrencyLimit = 5; // Limit concurrent requests
  const articlePromises = [];
  for (let i = 0; i < articles.length; i += concurrencyLimit) {
    const batch = articles.slice(i, i + concurrencyLimit).map(async (article) => {
      const publishedAt = await fetchArticleDate(article.link);
      article.publishedAt = publishedAt;
      return article;
    });
    articlePromises.push(...batch);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second delay between batches
  }

  await Promise.all(articlePromises);

  logger.info("Completed scraping Standart Magazine", { articleCount: articles.length });
  return articles;
}

module.exports = { scrape };