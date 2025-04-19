const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "../../.env") });

const logger = require("../../config/logger");
const OpenAI = require("openai");
const { articleProcessingPrompt } = require("./prompts");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const articleSchema = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: [
        "Sustainability",
        "Design",
        "Origin",
        "Culture",
        "Market",
        "Innovation",
        "Roastery",
        "Competition",
        "Recipes",
      ],
      description: "The category of the article, must be one of the specified values.",
    },
    geotag: {
      type: ["string", "null"],
      description: "A single real country name if found, else null.",
    },
    tags: {
      type: ["array", "null"],
      items: { type: "string", description: "A relevant tag (e.g., people, cafe, roastery, company)." },
      description: "An array of up to two relevant tags, or null if none.",
    },
    improvedDescription: {
      type: "string",
      description: "A short summary of the article, up to 300 characters, must end with a period.",
    },
    seoDescription: {
      type: "string",
      description: "A unique, clear, and concise SEO description, maximum 150 characters, no dashes.",
    },
  },
  required: ["category", "geotag", "tags", "improvedDescription", "seoDescription"],
  additionalProperties: false,
};

async function processArticleAI({ title, description, imageUrl, moderationStatus }) {
  if (moderationStatus === "rejected") {
    logger.info("Skipping AI processing for rejected article", { title });
    return null;
  }
  logger.debug("Starting AI processing for article", { title });
  try {
    const formattedPrompt = articleProcessingPrompt
      .replace("{{title}}", title)
      .replace("{{description}}", description || "No description provided.")
      .replace("{{imageUrl}}", imageUrl || "No image provided.");
    const response = await openai.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "system", content: "You are a helpful assistant that processes coffee news articles." },
        { role: "user", content: formattedPrompt },
      ],
      temperature: 0.7,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "article_processing",
          schema: articleSchema,
          strict: true,
        },
      },
    });
    const result = JSON.parse(response.choices[0].message.content);
    logger.debug("Received AI response", { title, result });
    if (response.choices[0].message.refusal) {
      logger.warn("OpenAI refused to process the article", { title, refusal: response.choices[0].message.refusal });
      throw new Error(`OpenAI refused to process the article: ${response.choices[0].message.refusal}`);
    }
    let improvedDescription = result.improvedDescription;
    if (!improvedDescription.trim().endsWith(".")) improvedDescription += ".";
    let seoDesc = result.seoDescription;
    if (seoDesc.length > 150) seoDesc = seoDesc.substring(0, 147) + "...";
    seoDesc = seoDesc.replace(/-/g, " ");
    logger.info("AI processing completed", { title, category: result.category });
    return {
      category: result.category,
      geotag: result.geotag,
      tags: result.tags,
      improvedDescription,
      seoTitle: `${title} | BEANS News`,
      seoDescription: seoDesc,
    };
  } catch (err) {
    logger.error("OpenAI processing error", { title, error: err.message });
    return {
      category: null, 
      geotag: null,
      tags: null,
      improvedDescription: description || "",
      seoTitle: `${title} | BEANS News`,
      seoDescription: description ? description.substring(0, 150).replace(/-/g, " ") : "",
    };
  }
}

module.exports = { processArticleAI };