import * as config from "@/config";
import { RequestHandler } from "express";

const authenticateApiKey: RequestHandler = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || typeof apiKey != 'string') {
    res.status(401).json({ error: 'Unauthorized: Missing API key' });
    return
  }
  const clientKey = Buffer.from(apiKey);
  const serverKey = Buffer.from(config.STATUS_API_KEY);

  if (clientKey.length !== serverKey.length) {
    res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    return
  }

  let mismatch = 0;
  for (let i = 0; i < clientKey.length; i++) {
    mismatch |= clientKey[i] ^ serverKey[i];
  }

  if (mismatch) {
    res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    return
  }

  next();
};

export default authenticateApiKey;
