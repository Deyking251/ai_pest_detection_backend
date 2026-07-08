import fs from 'fs/promises';
import path from 'path';
import Groq from 'groq-sdk';

const CHAT_SYSTEM_PROMPT = 'You are CropGuard AI, a friendly and highly knowledgeable agricultural chatbot. Help farmers diagnose crop diseases, provide pest management solutions, and share crop cultivation guidance. Keep answers actionable, concise, and formatted cleanly in markdown.';

const VISION_ANALYSIS_PROMPT = `You are an expert agricultural scientist and plant pathologist.
Analyze this plant/crop image carefully and provide a detailed disease or pest diagnosis.

Rules:
1. If the image shows a plant, crop, leaf, fruit, or agricultural specimen, analyze it for disease, pests, nutrient stress, or health status.
2. If the plant appears healthy, say so clearly and identify the plant name.
3. If diagnosis is uncertain, provide the best visual assessment and keep confidence lower.
4. Return only raw JSON. No markdown, no code fences.

Use this exact JSON shape:
{
  "cropName": "Name of the crop or plant",
  "issueName": "Name of the disease, pest, or condition",
  "confidence": 0.92,
  "severity": "None|Low|Moderate|High",
  "description": "Detailed 2-3 sentence description of the condition and likely cause.",
  "treatments": [
    "First specific treatment recommendation",
    "Second specific treatment recommendation",
    "Third specific treatment recommendation"
  ]
}`;

export const hasGroqKey = () => {
  const key = process.env.GROQ_API_KEY?.trim();
  return Boolean(key && key !== 'your_groq_api_key_here');
};

export const summarizeGroqError = (error) => {
  const raw = [error?.message, error?.error?.message, error?.response?.data]
    .filter(Boolean)
    .join('\n');

  if (/rate.?limit|429|quota/i.test(raw)) {
    return 'Groq quota is exhausted or rate-limited for the configured API key/project.';
  }

  if (/401|403|unauthorized|forbidden|api.?key|invalid/i.test(raw)) {
    return 'GROQ_API_KEY is missing, invalid, or not authorized on the backend.';
  }

  return 'Groq AI analysis is currently unavailable.';
};

const getGroqClient = () => {
  if (!hasGroqKey()) {
    throw new Error('GROQ_API_KEY is not configured on the backend.');
  }

  return new Groq({ apiKey: process.env.GROQ_API_KEY });
};

const normalizeHistory = (history = []) => {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((message) => message?.text)
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: String(message.text),
    }));
};

const extractJsonFromText = (text) => {
  const fenceMatch = text.match(/```(?:json)?\s*({[\s\S]*?})\s*```/i);
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1]);
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  }

  return JSON.parse(text);
};

const sanitizeDiagnosis = (diagnosis) => {
  const normalized = {
    cropName: diagnosis?.cropName || 'Unknown',
    issueName: diagnosis?.issueName || 'Unidentified Condition',
    confidence: Number(diagnosis?.confidence ?? 0.75),
    severity: diagnosis?.severity || 'Moderate',
    description: diagnosis?.description || 'The AI detected a plant condition but did not provide a full description.',
    treatments: diagnosis?.treatments || ['Consult a local agricultural expert.'],
  };

  if (normalized.confidence > 1) {
    normalized.confidence = normalized.confidence / 100;
  }
  if (!Number.isFinite(normalized.confidence)) {
    normalized.confidence = 0.75;
  }
  normalized.confidence = Math.round(Math.min(Math.max(normalized.confidence, 0), 1) * 100) / 100;

  if (!['None', 'Low', 'Moderate', 'High'].includes(normalized.severity)) {
    normalized.severity = 'Moderate';
  }

  if (typeof normalized.treatments === 'string') {
    normalized.treatments = [normalized.treatments];
  }
  if (!Array.isArray(normalized.treatments) || normalized.treatments.length === 0) {
    normalized.treatments = ['Consult a local agricultural expert.'];
  }

  return {
    cropName: String(normalized.cropName),
    issueName: String(normalized.issueName),
    confidence: normalized.confidence,
    severity: String(normalized.severity),
    description: String(normalized.description),
    treatments: normalized.treatments.map((item) => String(item)),
  };
};

const mimeTypeForImage = (imagePath) => {
  const ext = path.extname(imagePath).toLowerCase();
  if (ext === '.png') {
    return 'image/png';
  }
  if (ext === '.webp') {
    return 'image/webp';
  }
  return 'image/jpeg';
};

export const generateGroqChatReply = async ({ message, history }) => {
  const client = getGroqClient();
  const model = process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile';

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
      ...normalizeHistory(history),
      { role: 'user', content: String(message) },
    ],
    temperature: 0.7,
    max_completion_tokens: 800,
  });

  const reply = completion.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error('Groq returned an empty chat response.');
  }

  return reply;
};

export const analyzeCropImageWithGroq = async (imagePath) => {
  const client = getGroqClient();
  const model = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
  const imageBytes = await fs.readFile(imagePath);
  const base64Image = imageBytes.toString('base64');
  const mimeType = mimeTypeForImage(imagePath);

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: VISION_ANALYSIS_PROMPT },
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64Image}` },
          },
        ],
      },
    ],
    temperature: 0.2,
    max_completion_tokens: 1024,
  });

  const text = completion.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('Groq returned an empty vision response.');
  }

  return sanitizeDiagnosis(extractJsonFromText(text));
};
