import dotenv from 'dotenv';
import Groq from 'groq-sdk';

dotenv.config();

const key = process.env.GROQ_API_KEY;
const model = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

console.log("Testing Groq from Node.js...");
console.log("API Key:", key ? `${key.substring(0, 10)}...${key.substring(key.length - 6)}` : "Not Found");
console.log("Vision Model:", model);

if (!key || key.includes('your_groq_api_key_here')) {
  console.error("GROQ_API_KEY is not set correctly in your .env file!");
  process.exit(1);
}

const client = new Groq({ apiKey: key });

async function runTests() {
  try {
    console.log("\nTesting Chat Completion...");
    const chatCompletion = await client.chat.completions.create({
      messages: [{ role: 'user', content: 'Say hello!' }],
      model: 'llama-3.3-70b-versatile',
    });
    console.log("Chat Response:", chatCompletion.choices[0]?.message?.content);
  } catch (err) {
    console.error("Chat Test Failed:", err);
  }

  try {
    console.log("\nTesting Vision Completion (1x1 transparent pixel)...");
    const visionCompletion = await client.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe what you see or verify if this is a blank pixel' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==' },
            },
          ],
        },
      ],
    });
    console.log("Vision Response:", visionCompletion.choices[0]?.message?.content);
  } catch (err) {
    console.error("Vision Test Failed:", err);
  }
}

runTests();
