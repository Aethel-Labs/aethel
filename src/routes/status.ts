import express from 'express';
import getGitCommitHash from '@/utils/getGitCommitHash';
import BotClient from '@/services/Client';

export default (client: BotClient) => {
  const status = express.Router();

  status.get('/', async (req, res) => {
    const uptimeSeconds = Math.floor(process.uptime());
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;

    const uptimeFormatted = {
      days,
      hours,
      minutes,
      seconds,
    };

    const status = {
      status: 'online',
      uptime: uptimeFormatted,
      botStatus: client.isReady() ? 'connected' : 'disconnected',
      ping: client.ws.ping,
      lastReady: client.readyTimestamp ? new Date(client.readyTimestamp).toISOString() : null,
      commitHash: getGitCommitHash(),
    };

    res.json(status);
  });

  return status;
};
