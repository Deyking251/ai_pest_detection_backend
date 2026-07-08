import dotenv from 'dotenv';
import Groq from 'groq-sdk';

dotenv.config();

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function listModels() {
  try {
    const list = await client.models.list();
    console.log("=== Active Groq Models ===");
    for (const model of list.data) {
      if (model.id.includes('vision') || model.id.includes('llama')) {
        console.log(`- ${model.id} (Created by: ${model.owned_by})`);
      }
    }
  } catch (err) {
    console.error("Failed to list models:", err);
  }
}

listModels();
