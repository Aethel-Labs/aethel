import { Router } from 'express';
import axios from 'axios';
import pool from '../utils/pgClient';
import logger from '../utils/logger';
import { authenticateToken } from '../middlewares/auth';
import { body, validationResult } from 'express-validator';
import { encrypt as encryptApiKey } from '../utils/encrypt';
import OpenAI from 'openai';

const ALLOWED_API_HOSTS = [
  'api.openai.com',
  'openrouter.ai',
  'generativelanguage.googleapis.com',
  'api.anthropic.com',
  'api.mistral.ai',
  'api.deepseek.com',
  'api.together.xyz',
  'api.perplexity.ai',
  'api.groq.com',
  'api.lepton.ai',
  'api.deepinfra.com',
  'api.moonshot.ai',
  'api.x.ai',
];

function getOpenAIClient(apiKey: string, baseURL?: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: baseURL || 'https://api.openai.com/v1',
    defaultHeaders:
      new URL(baseURL || '').hostname === 'openrouter.ai'
        ? {
            'HTTP-Referer': 'https://aethel.xyz',
            'X-Title': 'Aethel Discord Bot',
          }
        : {},
  });
}

const router = Router();

router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const query = `
      SELECT custom_model, custom_api_url, 
             CASE WHEN api_key_encrypted IS NOT NULL THEN TRUE ELSE FALSE END as has_api_key
      FROM users
      WHERE user_id = $1
    `;
    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      hasApiKey: user.has_api_key,
      model: user.custom_model,
      apiUrl: user.custom_api_url,
    });
  } catch (error) {
    logger.error('Error fetching API key info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/',
  body('apiKey')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('API key is required and must be less than 1000 characters'),
  body('model')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Model name must be less than 100 characters'),
  body('apiUrl')
    .optional()
    .trim()
    .isURL({ require_protocol: true })
    .withMessage('API URL must be a valid URL with protocol'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { apiKey, model, apiUrl } = req.body;

      const encryptedApiKey = encryptApiKey(apiKey);

      const query = `
        UPDATE users
        SET api_key_encrypted = $1,
            custom_model = $2,
            custom_api_url = $3
        WHERE user_id = $4
        RETURNING user_id
      `;
      const result = await pool.query(query, [
        encryptedApiKey,
        model || null,
        apiUrl || null,
        userId,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      logger.info(`API key updated for user ${userId}`);
      res.json({ message: 'API key updated successfully' });
    } catch (error) {
      logger.error('Error updating API key:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.put(
  '/',
  body('apiKey')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('API key is required and must be less than 1000 characters'),
  body('model')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Model name must be less than 100 characters'),
  body('apiUrl')
    .optional()
    .trim()
    .isURL({ require_protocol: true })
    .withMessage('API URL must be a valid URL with protocol'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { apiKey, model, apiUrl } = req.body;

      const encryptedApiKey = encryptApiKey(apiKey);

      const query = `
        UPDATE users
        SET api_key_encrypted = $1,
            custom_model = $2,
            custom_api_url = $3
        WHERE user_id = $4
        RETURNING user_id
      `;
      const result = await pool.query(query, [
        encryptedApiKey,
        model || null,
        apiUrl || null,
        userId,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      logger.info(`API key updated for user ${userId}`);
      res.json({ message: 'API key updated successfully' });
    } catch (error) {
      logger.error('Error updating API key:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.delete('/', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const query = `
      UPDATE users
      SET api_key_encrypted = NULL,
          custom_model = NULL,
          custom_api_url = NULL
      WHERE user_id = $1
      RETURNING user_id
    `;
    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info(`API key deleted for user ${userId}`);
    res.json({ message: 'API key deleted successfully' });
  } catch (error) {
    logger.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/test',
  body('apiKey').trim().isLength({ min: 1 }).withMessage('API key is required'),
  body('model').optional().trim(),
  body('apiUrl')
    .optional()
    .trim()
    .isURL({ require_protocol: true })
    .withMessage('API URL must be a valid URL with protocol'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { apiKey, model, apiUrl } = req.body;
      const userId = req.user?.userId;

      const fullApiUrl = apiUrl || 'https://openrouter.ai/api/v1';

      let parsedUrl;
      try {
        parsedUrl = new URL(fullApiUrl);
      } catch {
        logger.warn(`Blocked invalid API URL for user ${userId}: ${fullApiUrl}`);
        return res.status(400).json({
          error:
            'API URL is invalid. Please use a supported API endpoint (OpenAI, OpenRouter, Anthropic, or Google Gemini).',
        });
      }
      if (!ALLOWED_API_HOSTS.includes(parsedUrl.hostname)) {
        logger.warn(`Blocked potentially malicious API URL for user ${userId}: ${fullApiUrl}`);
        return res.status(400).json({
          error:
            'API URL not allowed. Please use a supported API endpoint (OpenAI, OpenRouter, Anthropic, or Google Gemini).',
        });
      }

      const isGemini = parsedUrl.hostname === 'generativelanguage.googleapis.com';

      if (isGemini) {
        const listModelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

        try {
          const listResponse = await axios.get(listModelsUrl, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
          });

          interface ModelInfo {
            name: string;
            supportedGenerationMethods?: string[];
            [key: string]: unknown;
          }

          const availableModels: ModelInfo[] = listResponse.data?.models || [];
          const workingModel = availableModels.find((m) =>
            m.supportedGenerationMethods?.includes('generateContent'),
          );

          if (!workingModel) {
            throw new Error('No models found that support generateContent');
          }

          const testPrompt =
            'Hello! This is a test message. Please respond with "API key test successful!"';
          const generateUrl = `https://generativelanguage.googleapis.com/v1beta/${workingModel.name}:generateContent?key=${apiKey}`;

          const response = await axios.post(
            generateUrl,
            {
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: testPrompt,
                    },
                  ],
                },
              ],
            },
            {
              headers: { 'Content-Type': 'application/json' },
              timeout: 10000,
            },
          );

          const testMessage =
            response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Test completed';

          logger.info(
            `Gemini API key test successful for user ${userId} using model ${workingModel.name}`,
          );
          return res.json({
            success: true,
            message: 'Gemini API key is valid and working!',
            testResponse: testMessage,
            model: workingModel.name.split('/').pop(),
          });
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          const response =
            error && typeof error === 'object' && 'response' in error
              ? (error as { response?: { status?: number; data?: unknown } }).response
              : undefined;

          logger.warn(`Gemini API key test failed for user ${userId}:`, {
            error: errorMessage,
            status: response?.status,
            data: response?.data,
          });
          return res.status(400).json({
            error: `Gemini API key test failed: ${errorMessage}`,
            details:
              response?.data && typeof response.data === 'object' && response.data !== null
                ? (response.data as { error?: { details?: unknown } }).error?.details
                : undefined,
          });
        }
      } else {
        const testModel = model || 'gpt-5-nano';
        const client = getOpenAIClient(apiKey, fullApiUrl);

        try {
          const response = await client.chat.completions.create({
            model: testModel,
            messages: [
              {
                role: 'user',
                content:
                  'Hello! This is a test message. Please respond with "API key test successful!"',
              },
            ],
            max_tokens: 50,
            temperature: 0.1,
          });

          const testMessage = response.choices?.[0]?.message?.content || 'Test completed';

          logger.info(`API key test successful for user ${userId}`);
          return res.json({
            success: true,
            message: 'API key is valid and working!',
            testResponse: testMessage,
          });
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          logger.warn(`API key test failed for user ${userId}: ${errorMessage}`);
          return res.status(400).json({
            error: `API key test failed: ${errorMessage}`,
          });
        }
      }
    } catch (error) {
      logger.error('Error testing API key:', error);

      if (error instanceof TypeError && error.message.includes('fetch')) {
        return res
          .status(400)
          .json({ error: 'Failed to connect to API endpoint. Please check the URL.' });
      }

      res.status(500).json({ error: 'API key test failed due to server error' });
    }
  },
);

export default router;
