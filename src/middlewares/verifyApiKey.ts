import * as config from '@/config';
import { RequestHandler } from 'express';
import { createHmac } from 'crypto';

export const authenticateApiKey: RequestHandler = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || typeof apiKey !== 'string') {
    res.status(401).json({ error: 'Unauthorized: Missing API key' });
    return;
  }
  const clientKey = Buffer.from(apiKey);
  const serverKey = Buffer.from(config.STATUS_API_KEY);

  if (clientKey.length !== serverKey.length) {
    res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    return;
  }

  let mismatch = 0;
  for (let i = 0; i < clientKey.length; i++) {
    mismatch |= clientKey[i] ^ serverKey[i];
  }

  if (mismatch) {
    res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    return;
  }

  next();
};

export const authenticateTopGG: RequestHandler = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const signature = req.headers['x-signature-sha256'];

    if (!authHeader || !signature || typeof signature !== 'string') {
      return res.status(401).json({ error: 'Missing authentication headers' });
    }

    const hmac = createHmac('sha256', process.env.TOPGG_WEBHOOK_SECRET || '');
    const digest = hmac.update(JSON.stringify(req.body)).digest('hex');

    if (signature !== digest) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || token !== process.env.TOPGG_WEBHOOK_AUTH) {
      return res.status(401).json({ error: 'Invalid authorization header' });
    }

    next();
  } catch (error) {
    console.error('Top.gg webhook auth error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

export default authenticateApiKey;
