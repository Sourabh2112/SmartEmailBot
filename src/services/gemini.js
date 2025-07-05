require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function categorizeEmail(content) {
  try {
    const prompt = `
      You are an AI that categorizes emails into exactly one of these categories:
      - "Interested"
      - "Not Interested"
      - "More Information"

      Read the email content provided by the user and classify it into one of these categories.
      ONLY respond with the category name and nothing else.
      
      Email content: "${content}"
    `;

    const result = await model.generateContent(prompt);
    const category = result.response.text(); // Extract response
    return category.trim(); // Ensure clean response
  } catch (err) {
    console.error('Error categorizing email:', err.errors || err.message);
    return 'Not Interested'; // Default fallback
  }
}

module.exports = { categorizeEmail };
