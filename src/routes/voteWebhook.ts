import { Router } from 'express';
import { recordVote } from '../utils/voteManager';
import logger from '../utils/logger';

const router = Router();

router.all('/webhooks/topgg', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== process.env.TOPGG_WEBHOOK_AUTH) {
    logger.warn('Unauthorized webhook attempt', {
      ip: req.ip,
      headers: req.headers,
      timestamp: new Date().toISOString(),
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method === 'GET') {
    return res.status(200).json({ success: true, message: 'Webhook is active' });
  }
  try {
    logger.debug('Received Top.gg webhook payload:', {
      headers: req.headers,
      body: req.body,
      query: req.query,
      params: req.params,
      ip: req.ip,
      method: req.method,
      url: req.originalUrl,
      timestamp: new Date().toISOString(),
    });

    const { user, type } = req.body;
    logger.debug(`Processing vote: user=${user}, type=${type}`);

    if (type === 'upvote') {
      const userId = user;

      const result = await recordVote(userId);
      logger.debug('Vote processing result:', { userId, result });

      if (result.success) {
        logger.info(
          `Processed vote from user ${userId}. Credits awarded: ${result.creditsAwarded}`,
        );
        return res.status(200).json({ success: true, message: 'Vote processed successfully' });
      }
      logger.info(`Vote already processed for user ${userId}`, {
        nextVote: result.nextVoteAvailable,
      });
      return res.status(200).json({
        success: false,
        message: 'Vote already processed',
        nextVote: result.nextVoteAvailable,
      });
    }

    return res.status(400).json({ success: false, message: 'Invalid vote type' });
  } catch (error) {
    logger.error('Error processing vote webhook:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
