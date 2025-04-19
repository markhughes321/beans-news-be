const logger = require("../config/logger");
const { scrapeSourceByName, processArticlesWithAI } = require("../services/scraper");
const { sendArticlesToShopify, updateArticleInShopify } = require("../services/shopifyService");
const { processArticleAI } = require("../services/ai");
const Article = require("../models/Article");
const axios = require("axios");
const SHOPIFY_API_URL = "https://b4cd1f-0d.myshopify.com/admin/api/2023-04/graphql.json";
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
async function triggerScrape(req, res, next) {
  const sourceName = req.query.source || req.body.source;
  logger.info("Manual scrape requested", { source: sourceName });
  try {
    if (!sourceName) return res.status(400).json({ error: "Missing source parameter." });
    const result = await scrapeSourceByName(sourceName);

    // Fetch the newly created and updated articles from the database
    const articles = await Article.find({
      source: sourceName,
      moderationStatus: "scraped",
      updatedAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes to capture recent changes
    }).select("title link source domain publishedAt description imageUrl category uuid");

    res.json({
      message: `Scrape triggered for ${sourceName}`,
      newArticlesCount: result.newCount,
      updatedArticlesCount: result.updatedCount,
      articles: articles.map(article => ({
        uuid: article.uuid,
        title: article.title,
        link: article.link,
        source: article.source,
        domain: article.domain,
        publishedAt: article.publishedAt,
        description: article.description,
        imageUrl: article.imageUrl,
        category: article.category,
      })),
    });
  } catch (err) {
    next(err);
  }
}
async function triggerAIProcessing(req, res, next) {
  const sourceName = req.query.source || req.body.source;
  logger.info("Manual AI processing requested", { source: sourceName });
  try {
    if (!sourceName) return res.status(400).json({ error: "Missing source parameter." });
    const result = await processArticlesWithAI(sourceName);
    res.json({ message: `AI processing triggered for ${sourceName}`, processedCount: result.processedCount });
  } catch (err) {
    next(err);
  }
}
async function triggerShopifyPublish(req, res, next) {
  const sourceName = req.query.source || req.body.source;
  logger.info("Manual Shopify publish requested", { source: sourceName });
  try {
    await sendArticlesToShopify(sourceName); // Pass sourceName to service
    res.json({ message: `Shopify publish completed${sourceName ? ` for ${sourceName}` : ""}.` });
  } catch (err) {
    next(err);
  }
}
async function pushArticleToShopify(req, res, next) {
  const { uuid } = req.params;
  logger.info("Pushing single article to Shopify", { uuid });
  try {
    const article = await Article.findOne({ uuid }).lean();
    if (!article) return res.status(404).json({ error: "Article not found" });
    if (article.moderationStatus === "rejected") {
      return res.status(400).json({ error: "Rejected articles cannot be sent to Shopify" });
    }
    if (article.moderationStatus !== "aiProcessed" && article.moderationStatus !== "sentToShopify") {
      return res.status(400).json({ error: "Article must be AI processed before sending to Shopify" });
    }

    const handleBase = article.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-");
    const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const handle = `${handleBase}-${dateStr}`;

    const fields = [
      { key: "uuid", value: article.uuid || "" },
      { key: "publishdate", value: article.publishedAt ? article.publishedAt.toISOString() : new Date().toISOString() },
      { key: "title", value: article.title || "Untitled" },
      { key: "description", value: article.improvedDescription || "No description available." },
      { key: "url", value: article.link || "" },
      { key: "domain", value: article.domain || "unknown" },
      { key: "image", value: article.imageUrl || "" },
      { key: "tags", value: article.tags && article.tags.length > 0 ? article.tags.join(", ") : "" },
      { key: "attribution", value: article.source || "Unknown Source" },
      { key: "geotag", value: article.geotag || "" },
      { key: "category", value: article.category || "Market" },
      { key: "seotitle", value: article.seoTitle || `${article.title} | BEANS News` },
      { key: "seodescription", value: article.seoDescription || "" },
    ];

    let mutation, variables;
    if (article.shopifyMetaobjectId) {
      mutation = `
        mutation UpdateMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
          metaobjectUpdate(id: $id, metaobject: $metaobject) {
            metaobject { id handle type }
            userErrors { field message }
          }
        }
      `;
      variables = {
        id: article.shopifyMetaobjectId,
        metaobject: { fields },
      };
    } else {
      mutation = `
        mutation MetaobjectCreate($input: MetaobjectCreateInput!) {
          metaobjectCreate(metaobject: $input) {
            metaobject { id handle type }
            userErrors { field message }
          }
        }
      `;
      variables = {
        input: { handle, type: "news_articles", capabilities: { publishable: { status: "ACTIVE" } }, fields },
      };
    }

    const response = await axios.post(
      SHOPIFY_API_URL,
      { query: mutation, variables },
      { headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN, "Content-Type": "application/json" } }
    );

    const { data } = response;
    if (data.errors) throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    const resultKey = article.shopifyMetaobjectId ? "metaobjectUpdate" : "metaobjectCreate";
    const { metaobject, userErrors } = data.data[resultKey];

    if (userErrors && userErrors.length > 0) throw new Error(`Shopify user errors: ${JSON.stringify(userErrors)}`);
    if (!metaobject) throw new Error("No metaobject returned from Shopify");

    await Article.updateOne(
      { _id: article._id },
      { shopifyMetaobjectId: metaobject.id, moderationStatus: "sentToShopify" }
    );
    res.json({ message: `Article ${article.shopifyMetaobjectId ? "updated" : "sent"} to Shopify: ${article.link}` });
  } catch (err) {
    next(err);
  }
}
async function editArticleOnShopify(req, res, next) {
  const { uuid } = req.params;
  const updatedArticle = req.body;
  logger.info("Editing article on Shopify", { uuid });

  try {
    const article = await Article.findOne({ uuid }).lean();
    if (!article) return res.status(404).json({ error: "Article not found" });
    if (article.moderationStatus !== "sentToShopify") {
      return res.status(400).json({ error: "Article must be sent to Shopify first" });
    }
    if (!article.shopifyMetaobjectId) {
      logger.error("Article has no Shopify metaobject ID despite being sentToShopify", { uuid });
      return res.status(400).json({ error: "Article is missing Shopify metaobject ID" });
    }

    const updated = await Article.findOneAndUpdate({ uuid }, updatedArticle, { new: true });
    await updateArticleInShopify(updated);
    res.json({ message: `Article updated in Shopify: ${updated.link}`, article: updated });
  } catch (err) {
    logger.error("Error in editArticleOnShopify", { uuid, error: err.message });
    next(err);
  }
}
async function processSingleArticleWithAI(req, res, next) {
  const { uuid } = req.params;
  logger.info("Processing single article with AI", { uuid });
  try {
    const article = await Article.findOne({ uuid });
    if (!article) return res.status(404).json({ error: "Article not found" });
    if (article.moderationStatus !== "scraped") {
      return res.status(400).json({ error: "Article must be in 'scraped' status to process with AI" });
    }
    const aiData = await processArticleAI({
      title: article.title,
      description: article.description,
      imageUrl: article.imageUrl,
      moderationStatus: article.moderationStatus,
    });
    if (!aiData) return res.status(400).json({ error: "Article processing skipped" });
    const updatedArticle = await Article.findOneAndUpdate(
      { uuid },
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
      },
      { new: true }
    );
    res.json({ message: "Article processed with AI", article: updatedArticle });
  } catch (err) {
    next(err);
  }
}
module.exports = {
  triggerScrape,
  triggerAIProcessing,
  triggerShopifyPublish,
  pushArticleToShopify,
  editArticleOnShopify,
  processSingleArticleWithAI,
};