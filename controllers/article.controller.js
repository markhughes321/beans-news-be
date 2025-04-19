const Article = require("../models/Article");
const logger = require("../config/logger");

exports.getAllArticles = async (req, res, next) => {
  try {
    const { moderationStatus, source, search } = req.query;
    const query = {};

    if (moderationStatus) {
      let parsedStatus;
      try {
        parsedStatus = typeof moderationStatus === "string" ? JSON.parse(moderationStatus) : moderationStatus;
      } catch (e) {
        parsedStatus = moderationStatus; // Fallback to raw value if parsing fails
      }
      if (Array.isArray(parsedStatus)) {
        query.moderationStatus = { $in: parsedStatus };
      } else if (typeof parsedStatus === "object" && parsedStatus !== null) {
        if (parsedStatus.$in) query.moderationStatus = { $in: parsedStatus.$in };
        if (parsedStatus.$nin) query.moderationStatus = { ...query.moderationStatus, $nin: parsedStatus.$nin };
      } else {
        query.moderationStatus = parsedStatus;
      }
    }

    if (source) query.source = source;

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } }, // Case-insensitive search on title
        { description: { $regex: search, $options: "i" } }, // Case-insensitive search on description
        { improvedDescription: { $regex: search, $options: "i" } }, // Case-insensitive search on improvedDescription
      ];
    }

    const articles = await Article.find(query).sort({ publishedAt: -1 });
    res.json(articles);
  } catch (err) {
    logger.error("Error fetching articles", { error: err });
    next(err);
  }
};

exports.getArticle = async (req, res, next) => {
  try {
    const { uuid } = req.params;
    const article = await Article.findOne({ uuid });
    if (!article) return res.status(404).json({ error: "Article not found" });
    res.json(article);
  } catch (err) {
    logger.error("Error fetching article", { error: err });
    next(err);
  }
};

exports.updateArticle = async (req, res, next) => {
  try {
    const { uuid } = req.params;
    const updated = await Article.findOneAndUpdate({ uuid }, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: "Article not found" });
    res.json(updated);
  } catch (err) {
    logger.error("Error updating article", { error: err });
    next(err);
  }
};

exports.bulkEditArticles = async (req, res, next) => {
  try {
    const { uuids, updates } = req.body;
    if (!Array.isArray(uuids) || uuids.length === 0) {
      return res.status(400).json({ error: "No UUIDs provided for bulk edit" });
    }
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No updates provided for bulk edit" });
    }
    const result = await Article.updateMany(
      { uuid: { $in: uuids } },
      { $set: updates },
      { new: true }
    );
    res.json({ message: `${result.modifiedCount} articles updated.` });
  } catch (err) {
    logger.error("Error bulk editing articles", { error: err });
    next(err);
  }
};