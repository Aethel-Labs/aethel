import { Router } from 'express';
import pool from '../utils/pgClient';
import logger from '../utils/logger';
import { authenticateToken } from '../middlewares/auth';
import { body, validationResult } from 'express-validator';
import { encrypt as encryptApiKey } from '../utils/encrypt';

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
  }
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
  }
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

      const fullApiUrl = apiUrl || 'https://api.openai.com/v1/chat/completions';
      const testModel = model || 'gpt-3.5-turbo';

      const testResponse = await fetch(fullApiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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
        }),
      });

      if (!testResponse.ok) {
        const errorData = await testResponse.json().catch(() => ({}));
        const errorMessage =
          errorData.error?.message || `HTTP ${testResponse.status}: ${testResponse.statusText}`;

        logger.warn(`API key test failed for user ${userId}: ${errorMessage}`);
        return res.status(400).json({
          error: `API key test failed: ${errorMessage}`,
        });
      }

      const responseData = await testResponse.json();
      const testMessage = responseData.choices?.[0]?.message?.content || 'Test completed';

      logger.info(`API key test successful for user ${userId}`);
      res.json({
        success: true,
        message: 'API key test successful!',
        testResponse: testMessage.substring(0, 100),
      });
    } catch (error) {
      logger.error('Error testing API key:', error);

      if (error instanceof TypeError && error.message.includes('fetch')) {
        return res
          .status(400)
          .json({ error: 'Failed to connect to API endpoint. Please check the URL.' });
      }

      res.status(500).json({ error: 'API key test failed due to server error' });
    }
  }
);

export default router;
