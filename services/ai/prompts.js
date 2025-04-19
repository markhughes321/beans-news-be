const articleProcessingPrompt = `
You are analyzing a coffee news article to extract and generate information based on the provided schema. Use both the **title** and **description** to determine the article's **overall objective**, prioritizing the main theme over incidental details like names or keywords.
- category: Classify the article into **exactly one** of these categories: Sustainability, Design, Origin, Culture, Market, Innovation, Roasting, Competition, Recipes. Follow these guidelines:
  - **Sustainability**: Articles about environmental impact, green practices, or eco-friendly coffee production (e.g., "Making coffee greener").
  - **Design**: Articles focused on aesthetics, packaging, or equipment design (e.g., coffee machine innovations).
  - **Origin**: Articles about coffee-growing regions, their stories, or production specifics (e.g., "Colombian coffee farms").
  - **Culture**: Articles about coffee scenes, communities, or workplace culture (e.g., "Berlin’s coffee scene", "Creating community around coffee").
  - **Market**: Articles on market trends, consumer behavior, or analytical data (e.g., "Coffee sales rise in 2023").
  - **Innovation**: Articles on new studies, techniques, or creative advancements (e.g., "Color in coffee packaging study", "50 years of craftsmanship innovation").
  - **Roasting**: Articles about coffee roasters, roasting tools, techniques, or roasting stories (e.g., "How roasters make high-quality lots stand out", "Designing a roasting facility").
  - **Competition**: Articles about coffee contests or events (e.g., "World Barista Championship").
  - **Recipes**: Articles about coffee recipes or brew guides (e.g., "How to make cold brew", "Improve your pour over technique", "Dial in espresso").
  - Rules:
    - Use both **title** and **description** to identify the primary focus.
    - Do **not** default to "Roasting" just because a roaster is mentioned; prioritize the article’s broader intent.
    - Avoid misclassifying based on single keywords (e.g., "market" doesn’t always mean Market category).
- geotag: A **single official country name**, in Title Case (e.g., "Brazil", "United Kingdom"). 
  Do **not** include states, regions, provinces, cities, counties, or territories. 
  Return null if no country is clearly mentioned.
  Acceptable examples: "United States", "Colombia", "Ireland", "Peru"
  Unacceptable examples: "California", "Kintamani", "Scotland", "Europe", "Latin America"
- tags: Provide up to two relevant tags (title case only). Tags should refer to:
  1. **People** (e.g., "James Hoffmann")
  2. **Cafes** (e.g., "Origin", "April Coffee")
  3. **Roasteries** (e.g., "Tim Wendelboe", "Onyx", "Black & White")
  4. **Companies** (e.g., "La Marzocco", "Hario", "SCA")
  Rules:
  - Tags must be in **Title Case** (e.g., "James Hoffmann", not "james hoffmann" or "JAMES HOFFMANN").
  - Tags must be **unique** (no duplicates).
  - A maximum of **2 tags**. Return **1 tag** or **null** if no meaningful tags apply.
  - Only include a tag if it is clearly **mentioned or directly implied** and adds value.
  - Avoid generic terms like "coffee", "Roasteries", "business", or "origin" as tags.
  - Remove unnecessary special characters (e.g., "Coffee Bros." becomes "Coffee Bros").
  Example:
  If the article mentions Tim Wendelboe’s roastery and La Marzocco’s machine, tags are: ["Tim Wendelboe", "La Marzocco"]
- improvedDescription: Write a short, refined excerpt or direct statement based on the article. 
  Do **not** summarize. Extract a sentence or passage and enhance it slightly for clarity and tone.
  Rules:
  - Must read like a natural sentence.
  - Must be no more than **300 characters**.
  - Must **end with a full stop**.
  - Avoid generic phrases like "The article discusses..." or "This article is about..."
  Examples:
  ✓ "Producers now share fermentation techniques for transparent, traceable coffee."
  ✓ "April Coffee’s roastery blends minimalist design with a focus on quality."
- seoDescription: Create a unique, clear, and concise SEO description (maximum 150 characters, no dashes).
Title: "{{title}}"
Description: "{{description}}"
Image: "{{imageUrl}}"
`;
module.exports = { articleProcessingPrompt };