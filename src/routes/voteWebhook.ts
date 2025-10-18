import { Router } from 'express';
import { recordVote } from '../utils/voteManager';
import logger from '../utils/logger';
import { authenticateTopGG } from '../middlewares/verifyApiKey';

const router = Router();

router.all('/webhooks/topgg', authenticateTopGG, async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ success: true, message: 'Webhook is active' });
  }
  try {
    const { user, type } = req.body;

    if (type === 'upvote') {
      const userId = user;

      const result = await recordVote(userId);

      if (result.success) {
        logger.info(
          `Processed vote from user ${userId}. Credits awarded: ${result.creditsAwarded}`,
        );
        return res.status(200).json({ success: true, message: 'Vote processed successfully' });
      }
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
