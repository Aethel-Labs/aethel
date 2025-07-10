// Very super duper smart encryption

import * as config from "@/config";
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const KEY = crypto.createHash('sha256').update(config.API_KEY_ENCRYPTION_SECRET).digest();
const IV_LENGTH = 12;

function encrypt(text: string) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted}`;
}

function decrypt(encrypted: string) {
  const [ivB64, tagB64, data] = encrypted.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(data, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export { encrypt, decrypt };
