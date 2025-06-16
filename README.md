# Beans News Backend

A Node.js backend for scraping coffee news articles, processing them with AI, and publishing to Shopify.

## Features
- Scrapes articles from sources like Sprudge, Standart, Daily Coffee News, and Perfect Daily Grind.
- Uses OpenAI to categorize, geotag, and enhance articles.
- Publishes articles to Shopify as metaobjects.
- Schedules tasks with cron jobs.
- Logs to `./logs/beans-news-*.log`.

## Prerequisites
- Node.js (v16+)
- Docker (for MongoDB)
- Shopify Admin access (for API token)
- OpenAI API key

## Setup
1. **Clone Repository**:
   ```bash
   git clone <repository-url>
   cd beans-news-be
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Set Up MongoDB with Docker**:
   ```bash
   docker run -d --name mongodb -p 27017:27017 -v mongodb_data:/data/db arm64v8/mongo:5.0
   ```

4. **Create `.env` File**:
   ```bash
   touch .env
   ```
   Add:
   ```
   PORT=3020
   MONGO_URI=mongodb://localhost:27017/beansnews
   SHOPIFY_ACCESS_TOKEN=<your-shopify-token>
   OPENAI_API_KEY=<your-openai-key>
   ```

5. **Start Server**:
   ```bash
   npm run start
   ```
   Or with PM2:
   ```bash
   npm install -g pm2
   npm run start:pm2
   npm run save:pm2
   npm run startup:pm2
   ```

## Usage
- **Scrape Articles**:
   ```bash
   curl -X POST "http://localhost:3020/api/system/scrape?source=sprudge"
   ```
- **Process with AI**:
   ```bash
   curl -X POST "http://localhost:3020/api/system/process-ai?source=sprudge"
   ```
- **Publish to Shopify**:
   ```bash
   curl -X POST "http://localhost:3020/api/system/publish-shopify?source=sprudge"
   ```
- **View Logs**:
   ```bash
   npm run logs:pm2
   ```
- **Backup Database**:
   ```bash
   npm run db:backup
   ```

## Project Structure
- `server.js`: Entry point.
- `services/scraper/`: Scraping logic for sources.
- `services/ai/`: AI processing with OpenAI.
- `services/shopifyService.js`: Shopify API integration.
- `cron/scheduler.js`: Cron jobs for automation.
- `models/`: Mongoose schemas for `Article` and `Scraper`.

## Notes
- Runs on port `3020`.
- MongoDB database: `beansnews`.
- Secure API keys in `.env` (never commit).
- Monitor performance on Raspberry Pi due to resource constraints.