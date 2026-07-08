import pool from '../config/db.js';
import { exec } from 'child_process';
import path from 'path';
import { analyzeCropImageWithGroq, hasGroqKey, summarizeGroqError } from '../services/groqService.js';

const isEnabled = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

const hasGeminiKey = () => {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'your_gemini_api_key_here');
};

const preferredImageProvider = () => (
  process.env.AI_IMAGE_PROVIDER ||
  process.env.AI_PROVIDER ||
  ''
).toLowerCase();

const imageProviderOrder = () => {
  const provider = preferredImageProvider();
  if (provider === 'gemini') {
    return ['gemini', 'groq'];
  }
  if (provider === 'groq') {
    return ['groq', 'gemini'];
  }

  return hasGroqKey() ? ['groq', 'gemini'] : ['gemini', 'groq'];
};

const summarizeAIError = (error) => {
  if (error?.providerSummary) {
    return error.providerSummary;
  }

  const raw = [error?.stderr, error?.message].filter(Boolean).join('\n');

  if (/RESOURCE_EXHAUSTED|quota|429/i.test(raw)) {
    return 'Gemini quota is exhausted or rate-limited for the configured API key/project.';
  }

  if (/GEMINI_API_KEY/i.test(raw)) {
    return 'GEMINI_API_KEY is missing or invalid on the backend.';
  }

  if (/google-genai/i.test(raw)) {
    return 'google-genai is not installed in the backend Python environment.';
  }

  return 'Online AI analysis is currently unavailable.';
};

const createUnavailableDiagnosis = (message) => ({
  cropName: 'Unknown',
  issueName: 'AI Analysis Unavailable',
  confidence: 0.0,
  severity: 'None',
  description: `${message} This image was not diagnosed. Retry later or configure a Groq/Gemini key or project with available quota.`,
  treatments: [
    'Check Groq/Gemini quota and billing for the backend API key.',
    'Retry after the provider rate limit or daily quota resets.',
    'For demo-only behavior, set ENABLE_SIMULATED_ANALYSIS=true in backend/.env.'
  ]
});

// Helper to execute Python script for Gemini Vision AI inference
const runAIModel = (imagePath) => {
  return new Promise((resolve, reject) => {
    const pythonScriptPath = path.join(process.cwd(), 'src', 'predict.py');
    const venvPythonPath = path.join(process.cwd(), 'venv', 'bin', 'python');
    
    // Pass GEMINI_API_KEY explicitly to ensure Python subprocess can access it
    const env = { ...process.env, GEMINI_API_KEY: process.env.GEMINI_API_KEY || '' };
    
    exec(`"${venvPythonPath}" "${pythonScriptPath}" "${imagePath}"`, { env, timeout: 60000 }, (error, stdout, stderr) => {
      if (stderr) {
        console.log('Python debug output:', stderr);
      }
      if (error) {
        error.stderr = stderr;
        console.error('AI Inference Execution Error:', error);
        return reject(error);
      }
      try {
        const startIdx = stdout.indexOf('{');
        const endIdx = stdout.lastIndexOf('}');
        if (startIdx === -1 || endIdx === -1) {
          throw new Error('No JSON output found in python response: ' + stdout);
        }
        const jsonStr = stdout.substring(startIdx, endIdx + 1);
        const result = JSON.parse(jsonStr);
        resolve(result);
      } catch (parseError) {
        console.error('AI Inference Parse Error:', parseError, 'Raw stdout:', stdout);
        reject(parseError);
      }
    });
  });
};


const runConfiguredAIModel = async (imagePath) => {
  let lastError;

  for (const provider of imageProviderOrder()) {
    try {
      if (provider === 'groq') {
        if (!hasGroqKey()) {
          continue;
        }
        return await analyzeCropImageWithGroq(imagePath);
      }

      if (provider === 'gemini') {
        if (!hasGeminiKey()) {
          continue;
        }
        return await runAIModel(imagePath);
      }
    } catch (error) {
      if (provider === 'groq') {
        error.providerSummary = summarizeGroqError(error);
      }
      lastError = error;
      console.warn(`${provider} image analysis failed, trying next provider:`, error.providerSummary || error.message);
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('No AI image provider is configured. Add GROQ_API_KEY or GEMINI_API_KEY to backend/.env.');
};


// Predefined outcomes for the mock AI analyzer
const ANALYSIS_OUTCOMES = [
  {
    cropName: 'Tomato',
    issueName: 'Leaf Blight',
    confidence: 0.94,
    severity: 'Moderate',
    description: 'Early blight is caused by the fungus Alternaria solani. It affects leaves, stems, and fruit. Symptoms include dark spots with concentric rings developing on older leaves first.',
    treatments: [
      'Apply a copper-based fungicide at the first sign of disease.',
      'Remove lower infected leaves to prevent upward splash dispersal.',
      'Improve air circulation by pruning and spacing plants correctly.'
    ]
  },
  {
    cropName: 'Grape',
    issueName: 'Black Rot',
    confidence: 0.89,
    severity: 'High',
    description: 'Black rot is a destructive fungal disease caused by Guignardia bidwellii. It attacks all green parts of the vine, causing small brown spots on leaves and shriveling berries into hard black mummies.',
    treatments: [
      'Prune and destroy infected canes and mummified berries.',
      'Keep the vine canopy open to sunlight and air circulation.',
      'Apply preventative fungicide sprays during the early spring bloom period.'
    ]
  },
  {
    cropName: 'Corn',
    issueName: 'Common Rust',
    confidence: 0.96,
    severity: 'Low',
    description: 'Common rust is caused by the fungus Puccinia sorghi. It is characterized by reddish-brown pustules on both upper and lower leaf surfaces, which rupture to release dusty spores.',
    treatments: [
      'Plant resistant corn hybrids when available.',
      'Fungicides are rarely necessary unless infection is severe and occurs early.',
      'Maintain balanced soil fertility (avoid excess nitrogen).'
    ]
  },
  {
    cropName: 'Tomato',
    issueName: 'Healthy Leaf',
    confidence: 0.98,
    severity: 'None',
    description: 'The leaf shows normal cellular structure, high chlorophyll content, and no signs of bacterial, fungal, or viral infection.',
    treatments: [
      'Continue current watering and fertilizing schedules.',
      'Prune dead outer branches to maintain airflow.'
    ]
  },
  {
    cropName: 'Apple',
    issueName: 'Apple Scab',
    confidence: 0.91,
    severity: 'Moderate',
    description: 'Apple scab is a disease of Malus trees caused by the ascomycete fungus Venturia inaequalis. It produces dull olive-green or brown lesions on leaves and scabby lesions on fruit.',
    treatments: [
      'Rake and destroy fallen leaves in autumn to remove overwintering spores.',
      'Apply lime-sulfur or other suitable fungicides during green tip and pink bud stages.'
    ]
  }
];

/**
 * @desc    Upload crop image & run AI analysis
 * @route   POST /api/analyze
 * @access  Public (Optional Authentication)
 */
export const analyzeCropImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an image file.'
      });
    }

    // Determine user ID if authenticated
    const userId = req.user ? req.user.id : null;

    // Relative path to store in DB and return to client
    const relativeImagePath = `/uploads/${req.file.filename}`;

    // Run plant disease inference through the configured backend AI provider
    let diagnosis;
    try {
      diagnosis = await runConfiguredAIModel(req.file.path);
    } catch (aiError) {
      const aiMessage = summarizeAIError(aiError);
      console.error('AI Model failed:', aiMessage);

      if (isEnabled(process.env.ENABLE_SIMULATED_ANALYSIS)) {
        console.warn('ENABLE_SIMULATED_ANALYSIS is enabled; returning a simulated diagnosis.');
        diagnosis = ANALYSIS_OUTCOMES[Math.floor(Math.random() * ANALYSIS_OUTCOMES.length)];
      } else {
        diagnosis = createUnavailableDiagnosis(aiMessage);
      }
    }

    const scanId = `scan-${Date.now()}-${Math.round(Math.random() * 1e5)}`;
    const now = new Date();

    // Prepare database fields
    const cropName = diagnosis.cropName;
    const issueName = diagnosis.issueName;
    const confidence = diagnosis.confidence;
    const severity = diagnosis.severity;
    const description = diagnosis.description;
    const treatments = JSON.stringify(diagnosis.treatments);
    const isBookmarked = false;

    // Insert scan into database
    try {
      await pool.query(
        `INSERT INTO scans (id, user_id, crop_name, issue_name, confidence, severity, description, treatments, image_path, is_bookmarked, date_time) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [scanId, userId, cropName, issueName, confidence, severity, description, treatments, relativeImagePath, isBookmarked, now]
      );
    } catch (dbError) {
      console.warn('Resilient Warning: Database insert failed, but returning AI prediction results:', dbError.message);
    }

    // Return ScanModel JSON matching the Flutter client fields exactly
    res.status(200).json({
      id: scanId,
      cropName,
      issueName,
      confidence,
      severity,
      description,
      treatments: diagnosis.treatments,
      dateTime: now.toISOString(),
      imagePath: relativeImagePath,
      isBookmarked
    });
  } catch (error) {
    console.error('Analysis Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze crop image.',
      error: error.message
    });
  }
};

/**
 * @desc    Get user's scan history
 * @route   GET /api/history
 * @access  Private
 */
export const getScanHistory = async (req, res) => {
  const userId = req.user.id;

  try {
    const [rows] = await pool.query(
      'SELECT * FROM scans WHERE user_id = ? ORDER BY date_time DESC',
      [userId]
    );

    // Map database rows to the camelCase JSON model expected by Flutter
    const scanHistory = rows.map(row => ({
      id: row.id,
      cropName: row.crop_name,
      issueName: row.issue_name,
      confidence: parseFloat(row.confidence),
      severity: row.severity,
      description: row.description,
      treatments: typeof row.treatments === 'string' ? JSON.parse(row.treatments) : row.treatments,
      dateTime: new Date(row.date_time).toISOString(),
      imagePath: row.image_path,
      isBookmarked: Boolean(row.is_bookmarked)
    }));

    res.status(200).json(scanHistory);
  } catch (error) {
    console.error('Fetch History Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch scan history.',
      error: error.message
    });
  }
};

/**
 * @desc    Delete a scan
 * @route   DELETE /api/history/:id
 * @access  Private
 */
export const deleteScan = async (req, res) => {
  const userId = req.user.id;
  const scanId = req.params.id;

  try {
    // Confirm ownership before deleting
    const [scans] = await pool.query(
      'SELECT id FROM scans WHERE id = ? AND user_id = ?',
      [scanId, userId]
    );

    if (scans.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Scan not found or not authorized to delete.'
      });
    }

    await pool.query('DELETE FROM scans WHERE id = ?', [scanId]);

    res.status(200).json({
      success: true,
      message: 'Scan deleted successfully.'
    });
  } catch (error) {
    console.error('Delete Scan Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete scan.',
      error: error.message
    });
  }
};

/**
 * @desc    Toggle scan bookmark status
 * @route   PATCH /api/history/:id/bookmark
 * @access  Private
 */
export const toggleBookmark = async (req, res) => {
  const userId = req.user.id;
  const scanId = req.params.id;

  try {
    // Confirm ownership
    const [scans] = await pool.query(
      'SELECT is_bookmarked FROM scans WHERE id = ? AND user_id = ?',
      [scanId, userId]
    );

    if (scans.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Scan not found or not authorized.'
      });
    }

    const currentBookmarkStatus = scans[0].is_bookmarked;
    const newBookmarkStatus = !currentBookmarkStatus;

    await pool.query(
      'UPDATE scans SET is_bookmarked = ? WHERE id = ?',
      [newBookmarkStatus, scanId]
    );

    res.status(200).json({
      success: true,
      message: newBookmarkStatus ? 'Scan bookmarked.' : 'Scan removed from bookmarks.',
      isBookmarked: newBookmarkStatus
    });
  } catch (error) {
    console.error('Toggle Bookmark Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle bookmark status.',
      error: error.message
    });
  }
};
