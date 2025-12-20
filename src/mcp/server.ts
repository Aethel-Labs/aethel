import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PORT as defaultPort } from '@/config';
import mcpRoutes from '@/routes/mcp';
import logger from '@/utils/logger';

const app = express();

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(helmet());
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
  }),
);
app.use(express.json({ limit: '2mb' }));

app.use('/mcp', mcpRoutes);

const MCP_PORT = parseInt(process.env.MCP_PORT || '', 10) || Number(defaultPort) + 1;

app.listen(MCP_PORT, () => {
  logger.info(`MCP server listening on http://localhost:${MCP_PORT}/mcp`);
});
