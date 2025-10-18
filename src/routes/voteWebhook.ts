import { Router } from 'express';
import { recordVote } from '../utils/voteManager';
import logger from '../utils/logger';

const router = Router();

interface TopGGWebhookPayload {
  bot: string;
  user: string;
  type: 'upvote' | 'test';
  isWeekend?: boolean;
  query?: string;
}

router.get('/webhooks/topgg', (_, res) => {
  return res.status(200).json({ status: 'ok', message: 'Webhook endpoint is active' });
});
router.post('/webhooks/topgg', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || authHeader !== process.env.TOPGG_WEBHOOK_AUTH) {
    logger.warn('Unauthorized webhook attempt', {
      ip: req.ip,
      headers: req.headers,
      timestamp: new Date().toISOString(),
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = req.body as TopGGWebhookPayload;
    
    logger.info('Received Top.gg webhook', {
      type: payload.type,
      userId: payload.user,
      botId: payload.bot,
      isWeekend: payload.isWeekend || false,
      query: payload.query,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    if (payload.type === 'test') {
      logger.info('Received test webhook from Top.gg');
      return res.status(200).json({ success: true, message: 'Test webhook received' });
    }

    if (payload.type === 'upvote') {
      const userId = payload.user;
      const result = await recordVote(userId);
      
      logger.info('Processed vote', {
        userId,
        creditsAwarded: result.creditsAwarded,
        nextVote: result.nextVoteAvailable.toISOString(),
        isWeekend: payload.isWeekend || false
      });

      if (result.success) {
        return res.status(200).json({ 
          success: true, 
          message: 'Vote processed successfully',
          creditsAwarded: result.creditsAwarded,
          isWeekend: payload.isWeekend || false
        });
      }

      return res.status(200).json({
        success: false,
        message: 'Vote already processed',
        nextVote: result.nextVoteAvailable.toISOString(),
      });
    }

    logger.warn('Received unknown webhook type', { type: payload.type });
    return res.status(400).json({ success: false, message: 'Invalid webhook type' });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error('Error processing webhook:', {
      error: errorMessage,
      stack: errorStack,
      headers: req.headers,
      body: req.body,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
