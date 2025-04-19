const mongoose = require("mongoose");
const logger = require("./logger");

async function connectDB() {
  mongoose.set("strictQuery", true); // Explicitly set to suppress warning
  const maxRetries = 5;
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      logger.info("Connected to MongoDB");
      return;
    } catch (error) {
      attempt++;
      logger.error(`MongoDB connection attempt ${attempt} failed`, { error });
      if (attempt === maxRetries) {
        throw new Error("Failed to connect to MongoDB after retries");
      }
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
    }
  }
}

module.exports = { connectDB };