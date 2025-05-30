const express = require("express");
const router = express.Router();
const articleController = require("../controllers/article.controller");
const systemController = require("../controllers/system.controller");
const sourcesController = require("../controllers/sources.controller");
const scrapersController = require("../controllers/scrapers.controller");
router.get("/articles", articleController.getAllArticles);
router.get("/articles/:uuid", articleController.getArticle);
router.put("/articles/:uuid", articleController.updateArticle);
router.post("/articles/bulk-edit", articleController.bulkEditArticles);
router.post("/system/scrape", systemController.triggerScrape);
router.post("/system/process-ai", systemController.triggerAIProcessing);
router.post("/system/publish-shopify", systemController.triggerShopifyPublish);
router.post("/system/push-to-shopify/:uuid", systemController.pushArticleToShopify);
router.put("/system/edit-on-shopify/:uuid", systemController.editArticleOnShopify);
router.post("/system/process-single-ai/:uuid", systemController.processSingleArticleWithAI);
router.get("/system/scrapers", scrapersController.getScrapers);
router.post("/system/scrapers", scrapersController.createScraper);
router.get("/system/sources", sourcesController.getSources);
module.exports = router;