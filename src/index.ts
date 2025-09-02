import { config } from 'dotenv';
import e from 'express';
import helmet from 'helmet';
import cors from 'cors';

import BotClient from './services/Client';
import { ALLOWED_ORIGINS, PORT, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX } from './config';
import rateLimit from 'express-rate-limit';
import authenticateApiKey from './middlewares/verifyApiKey';
import status from './routes/status';
import authRoutes from './routes/auth';
import todosRoutes from './routes/todos';
import apiKeysRoutes from './routes/apiKeys';
import remindersRoutes from './routes/reminders';
import { resetOldStrikes } from './utils/userStrikes';
import logger from './utils/logger';

config();

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('🔥 Unhandled Rejection at:', promise);
  logger.error('📄 Reason:', reason);
});

const app = e();
const startTime = Date.now();

app.use(helmet());
app.use(
  cors({
    origin: ALLOWED_ORIGINS
      ? ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000', 'http://localhost:8080'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization', 'Cache-Control', 'Pragma'],
    credentials: true,
    maxAge: 86400,
  }),
);
app.set('trust proxy', 1);
app.use(
  rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use(e.json({ limit: '10mb' }));
app.use(e.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  } else {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https:",
    );
  }
  next();
});

const bot = new BotClient();
bot.init();

app.use(async (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info(`API [${req.method}] ${req.originalUrl} ${res.statusCode} ${durMs.toFixed(1)}ms`); // log the api request
  });
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/todos', todosRoutes);
app.use('/api/user/api-keys', apiKeysRoutes);
app.use('/api/reminders', remindersRoutes);

app.use('/api/status', authenticateApiKey, status(bot));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  return res.status(404).json({ status: 404, message: 'Not Found' });
});

setInterval(
  () => {
    resetOldStrikes().catch(logger.error);
  },
  60 * 60 * 1000,
);

const server = app.listen(PORT, async () => {
  logger.debug('Aethel is live on', `http://localhost:${PORT}`);

  const { sendDeploymentNotification } = await import('./utils/sendDeploymentNotification');
  await sendDeploymentNotification(startTime);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
