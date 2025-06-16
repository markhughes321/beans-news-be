const Parser = require('rss-parser');
const cheerio = require('cheerio');
const axios = require('axios');
const logger = require('../../config/logger');

const parser = new Parser({
  customFields: {
    item: [
      ['dc:creator', 'creator'],
      ['category', 'categories', { keepArray: true }],
      ['description', 'description'], // Ensure description is parsed for images
    ],
  },
});

async function scrape() {
  const feedUrl = 'https://coffeegeek.com/feed/';
  const sourceName = 'coffeeGeek';

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

        // Extract image from description with better error handling
        let imageUrl = null;
        let imageWidth = null;
        let imageHeight = null;

        // Debug: Log the raw description to see what we're working with
        logger.debug('Raw description content', { 
          link: cleanLink, 
          descriptionLength: item.description?.length || 0,
          hasDescription: !!item.description 
        });

        if (item.description) {
          try {
            // Parse the CDATA content properly
            const $ = cheerio.load(item.description);
            const firstImg = $('img').first();
            
            if (firstImg.length > 0) {
              imageUrl = firstImg.attr('src');
              const widthAttr = firstImg.attr('width');
              const heightAttr = firstImg.attr('height');
              
              imageWidth = widthAttr ? parseInt(widthAttr, 10) : null;
              imageHeight = heightAttr ? parseInt(heightAttr, 10) : null;
              
              // Ensure we have a valid URL
              if (imageUrl && !imageUrl.startsWith('http')) {
                if (imageUrl.startsWith('//')) {
                  imageUrl = 'https:' + imageUrl;
                } else if (imageUrl.startsWith('/')) {
                  imageUrl = 'https://coffeegeek.com' + imageUrl;
                }
              }
              
              logger.debug('Successfully extracted image from description', { 
                link: cleanLink, 
                imageUrl,
                imageWidth,
                imageHeight,
                imgTag: firstImg.toString()
              });
            } else {
              logger.debug('No img tag found in description', { link: cleanLink });
            }
          } catch (cheerioError) {
            logger.error('Error parsing description HTML with Cheerio', { 
              link: cleanLink, 
              error: cheerioError.message,
              description: item.description?.substring(0, 200) + '...'
            });
          }
        }

        // Fallback: Scrape article page for Open Graph image
        if (!imageUrl) {
          try {
            logger.debug('No image found in RSS, attempting to fetch from article page', { link: cleanLink });
            
            const response = await axios.get(cleanLink, {
              timeout: 10000,
              headers: { 
                'User-Agent': 'Mozilla/5.0 (compatible; BeansNewsBot/1.0; +https://example.com/bot)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
              },
            });
            
            const page$ = cheerio.load(response.data);
            
            // Try multiple selectors for images
            imageUrl = page$('meta[property="og:image"]').attr('content') || 
                      page$('meta[name="twitter:image"]').attr('content') ||
                      page$('article img').first().attr('src') ||
                      page$('.wp-post-image').attr('src') ||
                      null;
                      
            if (imageUrl) {
              logger.debug('Fetched image from article page', { link: cleanLink, imageUrl });
              
              // Clean up relative URLs
              if (imageUrl && !imageUrl.startsWith('http')) {
                if (imageUrl.startsWith('//')) {
                  imageUrl = 'https:' + imageUrl;
                } else if (imageUrl.startsWith('/')) {
                  imageUrl = 'https://coffeegeek.com' + imageUrl;
                }
              }
            } else {
              logger.debug('No image found on article page either', { link: cleanLink });
            }
          } catch (fetchError) {
            logger.warn('Failed to fetch image from article page', { 
              link: cleanLink, 
              error: fetchError.message,
              status: fetchError.response?.status || 'unknown'
            });
          }
        }

        // Clean description - handle CDATA properly
        let description = 'No description available';
        if (item.description) {
          try {
            const $ = cheerio.load(item.description);
            // Remove images and extract clean text
            $('img').remove();
            $('div').remove(); // Remove wrapper divs
            description = $.text().trim();
            
            // If still empty, try contentSnippet
            if (!description || description.length < 10) {
              description = item.contentSnippet?.trim() || 'No description available';
            }
            
            // Limit length
            if (description.length > 500) {
              description = description.substring(0, 500).trim() + '...';
            }
          } catch (descError) {
            logger.warn('Error cleaning description', { 
              link: cleanLink, 
              error: descError.message 
            });
            description = item.contentSnippet?.trim()?.substring(0, 500) || 'No description available';
          }
        }

        // Handle categories - they might be strings or objects
        let categories = [];
        if (item.categories) {
          categories = item.categories.map(cat => 
            typeof cat === 'string' ? cat : (cat._ || cat.name || String(cat))
          ).filter(Boolean);
        } else if (item.category) {
          // Fallback for single category
          categories = Array.isArray(item.category) ? item.category : [item.category];
          categories = categories.map(cat => 
            typeof cat === 'string' ? cat : (cat._ || cat.name || String(cat))
          ).filter(Boolean);
        }

        const article = {
          title: item.title?.trim() || 'Untitled',
          link: cleanLink,
          source: sourceName,
          domain: new URL(cleanLink).hostname || 'unknown',
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          description,
          imageUrl,
          imageWidth,
          imageHeight,
          creator: item.creator || item['dc:creator'] || 'Unknown',
          categories,
        };

        articles.push(article);
        
        // Log successful article processing
        logger.debug('Successfully processed article', {
          title: article.title,
          link: cleanLink,
          hasImage: !!imageUrl,
          imageUrl: imageUrl ? imageUrl.substring(0, 100) + '...' : null,
          categoriesCount: categories.length
        });

      } catch (err) {
        logger.error('Error processing RSS item', { 
          link: item.link, 
          title: item.title,
          error: err.message,
          stack: err.stack
        });
        continue;
      }
    }

    logger.info(`Scraped ${articles.length} articles from CoffeeGeek`, { 
      feedUrl,
      articlesWithImages: articles.filter(a => a.imageUrl).length,
      totalArticles: articles.length
    });
    
    return articles;
  } catch (err) {
    logger.error('Error scraping CoffeeGeek RSS feed', { 
      feedUrl, 
      error: err.message,
      stack: err.stack
    });
    return [];
  }
}

// Export both the scrape function and a test function for debugging
module.exports = { 
  scrape,
  // Test function to debug a single RSS item
  testSingleItem: async (itemIndex = 0) => {
    try {
      const feed = await parser.parseURL('https://coffeegeek.com/feed/');
      const item = feed.items[itemIndex];
      
      console.log('=== RSS Item Debug ===');
      console.log('Title:', item.title);
      console.log('Link:', item.link);
      console.log('Description length:', item.description?.length || 0);
      console.log('Description preview:', item.description?.substring(0, 300) + '...');
      
      if (item.description) {
        const $ = cheerio.load(item.description);
        const imgs = $('img');
        console.log('Images found:', imgs.length);
        imgs.each((i, img) => {
          console.log(`Image ${i}:`, {
            src: $(img).attr('src'),
            width: $(img).attr('width'),
            height: $(img).attr('height'),
            alt: $(img).attr('alt')
          });
        });
      }
      
      return item;
    } catch (err) {
      console.error('Test failed:', err.message);
      return null;
    }
  }
};