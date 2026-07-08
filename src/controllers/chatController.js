import dotenv from 'dotenv';
import { generateGroqChatReply, hasGroqKey, summarizeGroqError } from '../services/groqService.js';

dotenv.config();

const CHAT_SYSTEM_PROMPT = 'You are CropGuard AI, a friendly and highly knowledgeable agricultural chatbot. Help farmers diagnose crop diseases, provide pest management solutions, and share general crop cultivation guidelines. Keep answers highly actionable, clean, concise, and format them nicely in markdown.';

const preferredChatProvider = () => (
  process.env.AI_CHAT_PROVIDER ||
  process.env.AI_PROVIDER ||
  ''
).toLowerCase();

const shouldTryGroqFirst = () => {
  const provider = preferredChatProvider();
  return provider === 'groq' || (!provider && hasGroqKey());
};

const buildGeminiContents = (message, history) => {
  const contents = [];

  if (Array.isArray(history)) {
    history.forEach((item) => {
      if (!item?.text) {
        return;
      }

      contents.push({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(item.text) }],
      });
    });
  }

  contents.push({
    role: 'user',
    parts: [{ text: String(message) }],
  });

  return contents;
};

const generateGeminiChatReply = async ({ message, history }) => {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiKey || geminiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const geminiModel = process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': geminiKey,
    },
    body: JSON.stringify({
      contents: buildGeminiContents(message, history),
      systemInstruction: {
        parts: [{ text: CHAT_SYSTEM_PROMPT }],
      },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API returned status ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!reply) {
    throw new Error('Gemini returned an empty chat response.');
  }

  return reply;
};

const generateHuggingFaceReply = async ({ message, history }) => {
  const hfToken = process.env.HF_API_TOKEN?.trim();
  if (!hfToken || hfToken === 'your_huggingface_token_here') {
    throw new Error('HF_API_TOKEN is not configured.');
  }

  let prompt = '<|system|>\nYou are CropGuard AI, a helpful agricultural assistant. Help farmers with crop care, pest treatment, and farming questions. Keep answers concise, clear, and action-oriented.</s>\n';

  if (Array.isArray(history)) {
    history.forEach((item) => {
      if (!item?.text) {
        return;
      }

      prompt += item.role === 'assistant'
        ? `<|assistant|>\n${item.text}</s>\n`
        : `<|user|>\n${item.text}</s>\n`;
    });
  }

  prompt += `<|user|>\n${message}</s>\n<|assistant|>\n`;

  const response = await fetch(
    'https://router.huggingface.co/hf-inference/models/Qwen/Qwen2.5-7B-Instruct',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 512,
          temperature: 0.7,
          return_full_text: false,
        },
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Hugging Face API returned status ${response.status}: ${errText}`);
  }

  const data = await response.json();
  let reply = '';
  if (Array.isArray(data) && data[0]?.generated_text) {
    reply = data[0].generated_text;
  } else if (data.generated_text) {
    reply = data.generated_text;
  }

  reply = reply.replace(/<\|system\|>|<\|user\|>|<\|assistant\|>|<\/s>/g, '').trim();
  if (!reply) {
    throw new Error('Hugging Face returned an empty chat response.');
  }

  return reply;
};

const localFallbackReply = (message, apiWarning) => {
  let reply = `Hello! I am **CropGuard AI**, your virtual farming assistant.

To activate **live online answers**, configure an API key in your backend \`.env\` file:
\`\`\`env
# Recommended for this setup
GROQ_API_KEY=your_groq_api_key_here
AI_PROVIDER=groq

# Optional alternatives
GEMINI_API_KEY=your_gemini_api_key_here
HF_API_TOKEN=your_hugging_face_token_here
\`\`\`

Ask me about crop symptoms, pest treatment, irrigation, soil, or plant care.`;

  const lowerMsg = message.toLowerCase();
  if (lowerMsg.includes('tomato') || lowerMsg.includes('spot') || lowerMsg.includes('blight')) {
    reply = `Tomato Leaf Blight is a common fungal issue caused by high humidity.

**Recommended actions:**
1. Prune infected lower leaves.
2. Water at the base to keep leaves dry.
3. Apply copper-based fungicide early in the morning.`;
  } else if (lowerMsg.includes('weather') || lowerMsg.includes('rain')) {
    reply = `Weather conditions strongly affect crop health:
* Heavy rain can wash nutrients away and increase root disease risk.
* High heat increases evaporation, so water early and consider mulch.`;
  } else if (lowerMsg.includes('corn') || lowerMsg.includes('maize')) {
    reply = 'For corn/maize, maintain nitrogen-rich soil and watch for Fall Armyworm, Common Rust, and Gray Leaf Spot symptoms.';
  }

  if (apiWarning) {
    reply += `\n\n_(Online AI connection failed: ${apiWarning}. Using local offline simulator.)_`;
  }

  return reply;
};

/**
 * @desc    Send chat message to AI (Groq, Gemini, Hugging Face, or local fallback)
 * @route   POST /v1/chat
 * @access  Public (Optionally authenticated)
 */
export const handleChat = async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a message.',
    });
  }

  let apiWarning = '';

  try {
    const providerOrder = shouldTryGroqFirst()
      ? ['groq', 'gemini', 'huggingface']
      : ['gemini', 'groq', 'huggingface'];

    for (const provider of providerOrder) {
      try {
        if (provider === 'groq' && hasGroqKey()) {
          const reply = await generateGroqChatReply({ message, history });
          return res.status(200).json({ success: true, provider: 'Groq', reply });
        }

        if (provider === 'gemini') {
          const reply = await generateGeminiChatReply({ message, history });
          return res.status(200).json({ success: true, provider: 'Gemini', reply });
        }

        if (provider === 'huggingface') {
          const reply = await generateHuggingFaceReply({ message, history });
          return res.status(200).json({ success: true, provider: 'Hugging Face', reply });
        }
      } catch (providerError) {
        const summary = provider === 'groq'
          ? summarizeGroqError(providerError)
          : providerError.message;
        console.warn(`${provider} chat failed, falling back:`, summary);
        apiWarning = `${provider} failed: ${summary}`;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 600));
    return res.status(200).json({
      success: true,
      provider: 'Simulation Mode (configure backend API keys for live AI responses)',
      reply: localFallbackReply(String(message), apiWarning),
    });
  } catch (error) {
    console.error('Chat Assistant Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate chat assistant reply.',
      error: error.message,
    });
  }
};
