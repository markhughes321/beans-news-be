const axios = require("axios");
const logger = require("../config/logger");
const Article = require("../models/Article");
const SHOPIFY_API_URL = "https://b4cd1f-0d.myshopify.com/admin/api/2023-04/graphql.json";
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
if (!SHOPIFY_ACCESS_TOKEN) {
  logger.error("SHOPIFY_ACCESS_TOKEN is not defined in environment variables");
  throw new Error("SHOPIFY_ACCESS_TOKEN is required");
}
async function updateArticleInShopify(article) {
  logger.debug("Updating article in Shopify", { link: article.link, shopifyId: article.shopifyMetaobjectId });
  if (!article.shopifyMetaobjectId || typeof article.shopifyMetaobjectId !== "string" || !article.shopifyMetaobjectId.startsWith("gid://shopify/Metaobject/")) {
    logger.error("Invalid or missing Shopify metaobject ID", { uuid: article.uuid, shopifyMetaobjectId: article.shopifyMetaobjectId });
    throw new Error(`Invalid or missing Shopify metaobject ID for article: ${article.link}`);
  }
  const handleBase = article.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").substring(0, 50);
  const timestamp = article.publishedAt ? article.publishedAt.toISOString().split("T")[0].replace(/-/g, "") : new Date().toISOString().split("T")[0].replace(/-/g, "");
  const reversedTimestamp = (99999999 - parseInt(timestamp)).toString().padStart(8, "0");
  const handle = `${reversedTimestamp}-${handleBase}`;
  const metaobject = {
    handle,
    fields: [
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
    ],
  };
  const mutation = `
    mutation UpdateMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject {
          id
          handle
          type
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;
  const requestPayload = {
    query: mutation,
    variables: {
      id: article.shopifyMetaobjectId,
      metaobject,
    },
  };
  logger.debug("GraphQL request payload to Shopify", { payload: JSON.stringify(requestPayload, null, 2) });
  try {
    const response = await axios.post(
      SHOPIFY_API_URL,
      requestPayload,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );
    const { data } = response;
    if (data.errors) {
      logger.error("GraphQL response errors", { errors: data.errors });
      throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
    }
    const { metaobject: updatedMetaobject, userErrors } = data.data.metaobjectUpdate;
    if (userErrors && userErrors.length > 0) {
      logger.error("Shopify user errors", { userErrors });
      throw new Error(`Shopify user errors: ${JSON.stringify(userErrors)}`);
    }
    if (!updatedMetaobject) {
      logger.error("No metaobject returned", { response: data.data });
      throw new Error("No metaobject returned from Shopify after update");
    }
    await Article.updateOne(
      { _id: article._id },
      { shopifyHandle: updatedMetaobject.handle }
    );
    logger.info("Successfully updated article in Shopify", { link: article.link, shopifyId: updatedMetaobject.id });
  } catch (error) {
    logger.error("Failed to update article in Shopify", {
      link: article.link,
      shopifyId: article.shopifyMetaobjectId,
      error: error.message,
      response: error.response?.data,
    });
    throw error;
  }
}
async function sendArticlesToShopify(sourceName) {
  logger.info("Starting Shopify publish process", { source: sourceName });
  const query = { moderationStatus: "aiProcessed" };
  if (sourceName) query.source = sourceName;
  const articles = await Article.find(query)
    .select("uuid title link source publishedAt improvedDescription seoTitle seoDescription domain imageUrl tags geotag category shopifyMetaobjectId _id")
    .lean();
  if (articles.length === 0) {
    logger.info("No eligible articles to send to Shopify", { source: sourceName });
    return;
  }
  logger.debug("Processing articles for Shopify", { count: articles.length });
  const failedArticles = [];
  for (const article of articles) {
    try {
      if (article.shopifyMetaobjectId) {
        await updateArticleInShopify(article);
        await Article.updateOne({ _id: article._id }, { moderationStatus: "sentToShopify" });
        continue;
      }
      const handleBase = article.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").substring(0, 50);
      const timestamp = article.publishedAt ? article.publishedAt.toISOString().split("T")[0].replace(/-/g, "") : new Date().toISOString().split("T")[0].replace(/-/g, "");
      const reversedTimestamp = (99999999 - parseInt(timestamp)).toString().padStart(8, "0");
      const handle = `${reversedTimestamp}-${handleBase}`;
      const input = {
        handle,
        type: "news_articles",
        capabilities: { publishable: { status: "ACTIVE" } },
        fields: [
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
        ],
      };
      const mutation = `
        mutation MetaobjectCreate($input: MetaobjectCreateInput!) {
          metaobjectCreate(metaobject: $input) {
            metaobject { id handle type }
            userErrors { field message }
          }
        }
      `;
      const response = await axios.post(
        SHOPIFY_API_URL,
        { query: mutation, variables: { input } },
        { headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN, "Content-Type": "application/json" } }
      );
      const { data } = response;
      if (data.errors) throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      const { metaobject, userErrors } = data.data.metaobjectCreate;
      if (userErrors && userErrors.length > 0) {
        const duplicateError = userErrors.find((err) => err.message.includes("Value is already assigned to another metafield"));
        if (duplicateError) {
          logger.warn("Article is a duplicate in Shopify, marking as sent", { uuid: article.uuid, link: article.link });
          await Article.updateOne({ _id: article._id }, { moderationStatus: "sentToShopify" });
          continue;
        }
        throw new Error(`Shopify user errors: ${JSON.stringify(userErrors)}`);
      }
      if (!metaobject) throw new Error("No metaobject returned from Shopify");
      await Article.updateOne(
        { _id: article._id },
        { shopifyMetaobjectId: metaobject.id, shopifyHandle: metaobject.handle, moderationStatus: "sentToShopify" }
      );
      logger.info("Successfully sent article to Shopify", { link: article.link, shopifyId: metaobject.id });
    } catch (error) {
      logger.error("Failed to process article for Shopify", { link: article.link, error: error.message });
      failedArticles.push({ link: article.link, error: error.message });
    }
  }
  if (failedArticles.length > 0) {
    logger.warn("Some articles failed to process for Shopify", { failedCount: failedArticles.length, details: failedArticles });
  } else {
    logger.info("All articles processed for Shopify successfully", { source: sourceName });
  }
}
module.exports = { sendArticlesToShopify, updateArticleInShopify };