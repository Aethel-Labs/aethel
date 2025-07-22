import { Router } from 'express';
import pool from '../utils/pgClient';
import logger from '../utils/logger';
import { authenticateToken } from '../middlewares/auth';
import { body, validationResult } from 'express-validator';

const router = Router();

router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const query = `
      SELECT id, item, done, created_at, completed_at
      FROM todos
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [userId]);

    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching todos:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/',
  body('item')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Todo item must be between 1 and 500 characters'),
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

      const { item } = req.body;

      const query = `
        INSERT INTO todos (user_id, item, done, created_at)
        VALUES ($1, $2, FALSE, NOW())
        RETURNING id, item, done, created_at, completed_at
      `;
      const result = await pool.query(query, [userId, item]);

      logger.info(`Todo created for user ${userId}: ${item}`);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error('Error creating todo:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.put(
  '/:id',
  body('done').isBoolean().withMessage('Done must be a boolean value'),
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

      const { id } = req.params as { id: string };
      const { done } = req.body;

      const checkQuery = 'SELECT id FROM todos WHERE id = $1 AND user_id = $2';
      const checkResult = await pool.query(checkQuery, [id, userId]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'Todo not found' });
      }

      const query = `
        UPDATE todos
        SET done = $1, completed_at = CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END
        WHERE id = $2 AND user_id = $3
        RETURNING id, item, done, created_at, completed_at
      `;
      const result = await pool.query(query, [done, id, userId]);

      logger.info(`Todo ${done ? 'completed' : 'uncompleted'} for user ${userId}: ${id}`);
      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Error updating todo:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { id } = req.params as { id: string };

    const checkQuery = 'SELECT id, item FROM todos WHERE id = $1 AND user_id = $2';
    const checkResult = await pool.query(checkQuery, [id, userId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    const deleteQuery = 'DELETE FROM todos WHERE id = $1 AND user_id = $2';
    await pool.query(deleteQuery, [id, userId]);

    logger.info(`Todo deleted for user ${userId}: ${checkResult.rows[0].item}`);
    res.json({ message: 'Todo deleted successfully' });
  } catch (error) {
    logger.error('Error deleting todo:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const countQuery = 'SELECT COUNT(*) as count FROM todos WHERE user_id = $1';
    const countResult = await pool.query(countQuery, [userId]);
    const todoCount = parseInt(countResult.rows[0].count);

    const deleteQuery = 'DELETE FROM todos WHERE user_id = $1';
    await pool.query(deleteQuery, [userId]);

    logger.info(`All todos cleared for user ${userId}: ${todoCount} todos deleted`);
    res.json({ message: `${todoCount} todos cleared successfully` });
  } catch (error) {
    logger.error('Error clearing todos:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const query = `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN done = TRUE THEN 1 END) as completed,
        COUNT(CASE WHEN done = FALSE THEN 1 END) as pending
      FROM todos
      WHERE user_id = $1
    `;
    const result = await pool.query(query, [userId]);

    const stats = {
      total: parseInt(result.rows[0].total),
      completed: parseInt(result.rows[0].completed),
      pending: parseInt(result.rows[0].pending),
    };

    res.json(stats);
  } catch (error) {
    logger.error('Error fetching todo stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
