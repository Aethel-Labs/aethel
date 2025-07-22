import crypto from 'crypto';
import { API_KEY_ENCRYPTION_SECRET } from '../config';

const ENCRYPTION_KEY = API_KEY_ENCRYPTION_SECRET;
const ALGORITHM = 'aes-256-gcm';

const getEncryptionKey = (): Buffer => {
  if (ENCRYPTION_KEY.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 characters long');
  }
  return Buffer.from(ENCRYPTION_KEY, 'utf8');
};

/**
 * Encrypts a string using AES-256-GCM
 * @param text The text to encrypt
 * @returns Base64 encoded encrypted data with IV and auth tag
 */
export const encryptApiKey = (text: string): string => {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(Buffer.from('aethel-api-key', 'utf8'));

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]);

    return combined.toString('base64');
  } catch {
    throw new Error('Failed to encrypt API key');
  }
};

/**
 * Decrypts a string that was encrypted with encryptApiKey
 * @param encryptedData Base64 encoded encrypted data
 * @returns The decrypted text
 */
export const decryptApiKey = (encryptedData: string): string => {
  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedData, 'base64');

    const extractedIv = combined.subarray(0, 16);
    const authTag = combined.subarray(16, 32);
    const encrypted = combined.subarray(32);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, extractedIv);
    decipher.setAAD(Buffer.from('aethel-api-key', 'utf8'));
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch {
    throw new Error('Failed to decrypt API key');
  }
};

/**
 * Generates a secure random encryption key
 * @returns A 32-character random string suitable for use as ENCRYPTION_KEY
 */
export const generateEncryptionKey = (): string => {
  return crypto.randomBytes(32).toString('base64').substring(0, 32);
};

/**
 * Validates that an encryption key is properly formatted
 * @param key The key to validate
 * @returns True if the key is valid
 */
export const validateEncryptionKey = (key: string): boolean => {
  return typeof key === 'string' && key.length === 32;
};
