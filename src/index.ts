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

config();

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise);
  console.error('📄 Reason:', reason);
});

const app = e();

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

app.use('/api/auth', authRoutes);
app.use('/api/todos', todosRoutes);
app.use('/api/user/api-keys', apiKeysRoutes);
app.use('/api/reminders', remindersRoutes);

app.use('/api/status', authenticateApiKey, status(bot));

app.use(e.static('web/dist'));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile('index.html', { root: 'web/dist' });
});

setInterval(
  () => {
    resetOldStrikes().catch(console.error);
  },
  60 * 60 * 1000,
);

app.listen(PORT, () => {
  console.log('Aethel is live on', `http://localhost:${PORT}`);
});
