import winston from 'winston';
import { LOG_LEVEL, NODE_ENV } from '@/config/index';
import path from 'path';

const sanitizeFormat = winston.format((info) => {
  const sensitiveKeys = ['password', 'token', 'api_key', 'secret', 'authorization'];

  const sanitize = (obj: unknown): unknown => {
    if (typeof obj !== 'object' || obj === null) return obj;

    const sanitized = { ...obj } as Record<string, unknown>;
    for (const key in sanitized) {
      if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = sanitize(sanitized[key]);
      }
    }
    return sanitized;
  };

  return sanitize(info) as winston.Logform.TransformableInfo;
});

const logger = winston.createLogger({
  level: LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    sanitizeFormat(),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'Aethel',
    version: process.env.npm_package_version || '2.0.0',
    environment: NODE_ENV,
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`;
        })
      ),
    }),
  ],
  exitOnError: false,
});

if (NODE_ENV === 'production') {
  const logsDir = path.join(process.cwd(), 'logs');

  logger.add(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    })
  );

  logger.add(
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    })
  );
}

logger.exceptions.handle(
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
  })
);

logger.rejections.handle(
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
  })
);

export default logger;
