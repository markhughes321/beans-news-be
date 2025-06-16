const Parser = require('rss-parser');
const cheerio = require('cheerio');
const axios = require('axios');
const logger = require('../../config/logger');

const parser = new Parser({
  customFields: {
    item: [['content:encoded'], ['dc:creator'], ['category', [], { keepArray: true }]],
  },
});

async function scrape() {
  const feedUrl = 'https://www.baristamagazine.com/feed/';
  const sourceName = 'baristaMagazine';

  try {
    const feed = await parser.parseURL(feedUrl);
    const articles = [];

    for (const item of feed.items) {
      try {
        // Clean link from UTM parameters
        let cleanLink = item.link;
        try {
          const url = new URL(item.link);
          url.searchParams.delete('utm_source');
          url.searchParams.delete('utm_medium');
          url.searchParams.delete('utm_campaign');
          cleanLink = url.toString();
        } catch (e) {
          logger.warn('Invalid URL in RSS item', { link: item.link, error: e.message });
        }

        // Extract image from content:encoded
        let imageUrl = null;
        let imageWidth = null;
        let imageHeight = null;
        const htmlDesc = item['content:encoded'] || item.description || '';
        const $ = cheerio.load(htmlDesc);
        const firstImg = $('img').first();

        if (firstImg.length) {
          imageUrl = firstImg.attr('src') || null;
          imageWidth = firstImg.attr('width') ? parseInt(firstImg.attr('width'), 10) : null;
          imageHeight = firstImg.attr('height') ? parseInt(firstImg.attr('height'), 10) : null;
        }

        // Fallback: Scrape article page for Open Graph image if no image found
        if (!imageUrl) {
          try {
            const response = await axios.get(cleanLink, {
              timeout: 10000,
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BeansNewsBot/1.0)' },
            });
            const page$ = cheerio.load(response.data);
            imageUrl = page$('meta[property="og:image"]').attr('content') || null;
            logger.debug('Fetched OG image from article page', { link: cleanLink, imageUrl });
          } catch (e) {
            logger.warn('Failed to fetch image from article page', { link: cleanLink, error: e.message });
          }
        }

        // Clean description
        const description = $.text().trim().slice(0, 500) || item.contentSnippet || 'No description available';

        articles.push({
          title: item.title?.trim() || 'Untitled',
          link: cleanLink,
          source: sourceName,
          domain: new URL(cleanLink).hostname || 'unknown',
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          description,
          imageUrl,
          imageWidth,
          imageHeight,
          creator: item['dc:creator'] || 'Unknown',
          categories: item.category || [],
        });
      } catch (err) {
        logger.error('Error processing RSS item', { link: item.link, error: err.message });
        continue;
      }
    }

    logger.info(`Scraped ${articles.length} articles from Barista Magazine`, { feedUrl });
    return articles;
  } catch (err) {
    logger.error('Error scraping Barista Magazine RSS feed', { feedUrl, error: err.message });
    return [];
  }
}

module.exports = { scrape };