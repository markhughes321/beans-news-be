const Parser = require('rss-parser');
const cheerio = require('cheerio');
const axios = require('axios');
const logger = require('../../config/logger');

const parser = new Parser({
  customFields: {
    item: [
      ['dc:creator'],
      ['category', [], { keepArray: true }],
      ['media:content', [], { keepArray: true }],
      ['media:thumbnail'],
      ['content:encoded'],
    ],
  },
});

// Function to validate and filter image URLs
function isValidImageUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return false;
  }

  // Patterns to exclude unwanted images
  const excludePatterns = [
    // Emoji and Unicode character URLs
    /\/emoji\//i,
    /unicode/i,
    /emoji/i,
    /\b[0-9a-f]{4,8}\.(png|jpg|jpeg|gif|webp)/i, // Hex-named files (often emoji)
    
    // Generic placeholder patterns
    /placeholder/i,
    /default/i,
    /avatar/i,
    /gravatar/i,
    /loading/i,
    /spinner/i,
    /blank\.(png|jpg|jpeg|gif)/i,
    
    // Social media and sharing icons
    /facebook/i,
    /twitter/i,
    /instagram/i,
    /linkedin/i,
    /social/i,
    /share/i,
    /icon/i,
    /logo/i,
    
    // WordPress core and theme images
    /wp-includes/i,
    /wp-admin/i,
    /themes\/.*\/images/i,
    
    // Common generic image names
    /1x1\.(png|jpg|jpeg|gif)/i,
    /pixel\.(png|jpg|jpeg|gif)/i,
    /transparent\.(png|jpg|jpeg|gif)/i,
    /spacer\.(png|jpg|jpeg|gif)/i,
    
    // Specific problematic URLs
    /s\.w\.org\/images\/core\/emoji/i, // WordPress emoji CDN
    /twemoji/i, // Twitter emoji
    /feeds\.feedburner\.com/i, // Feedburner tracking pixels
    /googleusercontent\.com.*\/proxy/i, // Google proxy images
  ];

  // Check if URL matches any exclude pattern
  if (excludePatterns.some(pattern => pattern.test(imageUrl))) {
    return false;
  }

  // Check image dimensions if available in URL
  const dimensionMatch = imageUrl.match(/(\d+)x(\d+)/);
  if (dimensionMatch) {
    const width = parseInt(dimensionMatch[1], 10);
    const height = parseInt(dimensionMatch[2], 10);
    
    // Exclude very small images (likely icons or pixels)
    if (width < 100 || height < 100) {
      return false;
    }
  }

  // Check for valid image extensions
  const validExtensions = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;
  if (!validExtensions.test(imageUrl)) {
    return false;
  }

  return true;
}

// Function to validate image dimensions from HTML attributes
function hasValidDimensions(width, height) {
  if (!width || !height) return true; // Allow if dimensions unknown
  
  const w = parseInt(width, 10);
  const h = parseInt(height, 10);
  
  // Exclude very small images (likely icons, social buttons, etc.)
  if (w < 100 || h < 100) return false;
  
  // Exclude very wide/thin images (likely banners or decorative elements)
  const aspectRatio = w / h;
  if (aspectRatio > 5 || aspectRatio < 0.2) return false;
  
  return true;
}

// Enhanced image extraction function
async function extractBestImage(item, cleanLink) {
  let bestImage = null;
  
  // Priority 1: media:content with valid dimensions
  if (item['media:content'] && Array.isArray(item['media:content'])) {
    for (const media of item['media:content']) {
      if (media.$.medium === 'image' && media.$.url) {
        const imageUrl = media.$.url;
        const width = media.$.width ? parseInt(media.$.width, 10) : null;
        const height = media.$.height ? parseInt(media.$.height, 10) : null;
        
        if (isValidImageUrl(imageUrl) && hasValidDimensions(width, height)) {
          return {
            imageUrl,
            imageWidth: width,
            imageHeight: height,
            source: 'media:content'
          };
        }
      }
    }
  }

  // Priority 2: media:thumbnail (if valid)
  if (item['media:thumbnail'] && item['media:thumbnail'].$ && item['media:thumbnail'].$.url) {
    const thumbnailUrl = item['media:thumbnail'].$.url;
    if (isValidImageUrl(thumbnailUrl)) {
      const width = item['media:thumbnail'].$.width ? parseInt(item['media:thumbnail'].$.width, 10) : null;
      const height = item['media:thumbnail'].$.height ? parseInt(item['media:thumbnail'].$.height, 10) : null;
      
      if (hasValidDimensions(width, height)) {
        bestImage = {
          imageUrl: thumbnailUrl,
          imageWidth: width,
          imageHeight: height,
          source: 'media:thumbnail'
        };
      }
    }
  }

  // Priority 3: content:encoded - find the best image
  if (item['content:encoded']) {
    const $ = cheerio.load(item['content:encoded']);
    const images = $('img').toArray();
    
    for (const img of images) {
      const src = $(img).attr('src');
      const width = $(img).attr('width');
      const height = $(img).attr('height');
      const alt = $(img).attr('alt') || '';
      const className = $(img).attr('class') || '';
      
      // Skip images with suspicious class names or alt text
      const suspiciousPatterns = /emoji|icon|avatar|social|share|button|arrow|bullet/i;
      if (suspiciousPatterns.test(alt) || suspiciousPatterns.test(className)) {
        continue;
      }
      
      if (src && isValidImageUrl(src) && hasValidDimensions(width, height)) {
        const imageResult = {
          imageUrl: src,
          imageWidth: width ? parseInt(width, 10) : null,
          imageHeight: height ? parseInt(height, 10) : null,
          source: 'content:encoded'
        };
        
        // Prefer larger images
        if (!bestImage || 
            (imageResult.imageWidth && bestImage.imageWidth && 
             imageResult.imageWidth > bestImage.imageWidth)) {
          bestImage = imageResult;
        }
      }
    }
  }

  // Priority 4: Scrape article page for Open Graph image (last resort)
  if (!bestImage) {
    try {
      const response = await axios.get(cleanLink, {
        timeout: 10000,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (compatible; BeansNewsBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
      });
      
      const page$ = cheerio.load(response.data);
      
      // Try multiple OG image selectors
      const ogImageSelectors = [
        'meta[property="og:image"]',
        'meta[property="og:image:url"]',
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:src"]'
      ];
      
      for (const selector of ogImageSelectors) {
        const ogImage = page$(selector).attr('content');
        if (ogImage && isValidImageUrl(ogImage)) {
          // Additional validation for OG images - check if it's from the same domain
          try {
            const articleDomain = new URL(cleanLink).hostname;
            const imageDomain = new URL(ogImage).hostname;
            
            // Prefer images from the same domain or known CDNs
            const trustedDomains = [articleDomain, 'cdn.', 'assets.', 'images.', 'media.'];
            const isTrustedDomain = trustedDomains.some(domain => 
              imageDomain.includes(domain) || domain.includes(imageDomain)
            );
            
            if (isTrustedDomain) {
              bestImage = {
                imageUrl: ogImage,
                imageWidth: null,
                imageHeight: null,
                source: `og:${selector.split('"')[1]}`
              };
              break;
            }
          } catch (e) {
            // If URL parsing fails, still consider the image but with lower priority
            if (!bestImage) {
              bestImage = {
                imageUrl: ogImage,
                imageWidth: null,
                imageHeight: null,
                source: `og:${selector.split('"')[1]}`
              };
            }
          }
        }
      }
      
      logger.debug('Scraped article page for image', { 
        link: cleanLink, 
        imageUrl: bestImage?.imageUrl,
        source: bestImage?.source 
      });
    } catch (e) {
      logger.warn('Failed to fetch image from article page', { 
        link: cleanLink, 
        error: e.message 
      });
    }
  }

  return bestImage;
}

async function scrape() {
  const feedUrl = 'https://europeancoffeetrip.com/feed/';
  const sourceName = 'europeanCoffeeTrip';

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

        // Extract best image using enhanced function
        const imageResult = await extractBestImage(item, cleanLink);

        // Clean description
        const htmlDesc = item.description || '';
        const $ = cheerio.load(htmlDesc);
        const description = $.text().trim().slice(0, 500) || item.contentSnippet || 'No description available';

        const article = {
          title: item.title?.trim() || 'Untitled',
          link: cleanLink,
          source: sourceName,
          domain: new URL(cleanLink).hostname || 'unknown',
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          description,
          creator: item['dc:creator'] || 'Unknown',
          categories: item.category || [],
        };

        // Only add image fields if we found a valid image
        if (imageResult) {
          article.imageUrl = imageResult.imageUrl;
          article.imageWidth = imageResult.imageWidth;
          article.imageHeight = imageResult.imageHeight;
          article.imageSource = imageResult.source; // For debugging
        } else {
          article.imageUrl = null;
          article.imageWidth = null;
          article.imageHeight = null;
          logger.debug('No valid image found for article', { title: item.title, link: cleanLink });
        }

        articles.push(article);
      } catch (err) {
        logger.error('Error processing RSS item', { link: item.link, error: err.message });
        continue;
      }
    }

    logger.info(`Scraped ${articles.length} articles from European Coffee Trip`, { 
      feedUrl,
      articlesWithImages: articles.filter(a => a.imageUrl).length,
      articlesWithoutImages: articles.filter(a => !a.imageUrl).length
    });
    return articles;
  } catch (err) {
    logger.error('Error scraping European Coffee Trip RSS feed', { feedUrl, error: err.message });
    return [];
  }
}

module.exports = { scrape };