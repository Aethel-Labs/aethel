import * as config from '@/config';
import crypto from 'crypto';
import logger from './logger';

const ALGO = 'aes-256-gcm';
const KEY = crypto.createHash('sha256').update(config.API_KEY_ENCRYPTION_SECRET).digest();
const IV_LENGTH = 12;
const MAX_ENCRYPTED_LENGTH = 10000;

class EncryptionError extends Error {
  constructor(
    message: string,
    public readonly operation: 'encrypt' | 'decrypt',
  ) {
    super(message);
    this.name = 'EncryptionError';
  }
}

function encrypt(text: string): string {
  if (!text || typeof text !== 'string') {
    throw new EncryptionError('Invalid input: text must be a non-empty string', 'encrypt');
  }

  if (text.length > 5000) {
    throw new EncryptionError('Input text too large for encryption', 'encrypt');
  }

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGO, KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const tag = cipher.getAuthTag();

    const result = `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted}`;

    if (result.length > MAX_ENCRYPTED_LENGTH) {
      throw new EncryptionError('Encrypted data exceeds maximum length', 'encrypt');
    }

    logger.debug('Data encrypted successfully');
    return result;
  } catch (err) {
    if (err instanceof EncryptionError) {
      throw err;
    }
    logger.error('Encryption failed:', err);
    throw new EncryptionError('Failed to encrypt data', 'encrypt');
  }
}

function decrypt(encrypted: string): string {
  if (!encrypted || typeof encrypted !== 'string') {
    throw new EncryptionError(
      'Invalid input: encrypted data must be a non-empty string',
      'decrypt',
    );
  }

  if (encrypted.length > MAX_ENCRYPTED_LENGTH) {
    throw new EncryptionError('Encrypted data exceeds maximum length', 'decrypt');
  }

  try {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      logger.warn('Invalid encrypted data format - expected 3 parts separated by colons');
      throw new EncryptionError('Invalid encrypted data format', 'decrypt');
    }

    const [ivB64, tagB64, data] = parts;

    if (!ivB64 || !tagB64 || !data) {
      throw new EncryptionError('Missing encryption components', 'decrypt');
    }

    let iv: Buffer, tag: Buffer;
    try {
      iv = Buffer.from(ivB64, 'base64');
      tag = Buffer.from(tagB64, 'base64');
    } catch {
      throw new EncryptionError('Invalid base64 encoding in encrypted data', 'decrypt');
    }

    if (iv.length !== IV_LENGTH) {
      throw new EncryptionError(
        `Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`,
        'decrypt',
      );
    }

    if (tag.length !== 16) {
      throw new EncryptionError(
        `Invalid auth tag length: expected 16, got ${tag.length}`,
        'decrypt',
      );
    }

    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    logger.debug('Data decrypted successfully');
    return decrypted;
  } catch (error) {
    if (error instanceof EncryptionError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.message.includes('Unsupported state or unable to authenticate data')) {
        logger.warn(
          'Authentication failed during decryption - data may be corrupted or key changed',
        );
        throw new EncryptionError(
          'Authentication failed - data may be corrupted or encryption key changed',
          'decrypt',
        );
      }
      if (error.message.includes('Invalid key length')) {
        logger.error('Invalid encryption key length');
        throw new EncryptionError('Invalid encryption key configuration', 'decrypt');
      }
    }

    logger.error('Decryption failed:', error);
    throw new EncryptionError('Failed to decrypt data', 'decrypt');
  }
}

function canDecrypt(encrypted: string): boolean {
  try {
    decrypt(encrypted);
    return true;
  } catch {
    return false;
  }
}

function isValidEncryptedFormat(encrypted: string): boolean {
  if (!encrypted || typeof encrypted !== 'string') {
    return false;
  }

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    return false;
  }

  const [ivB64, tagB64, data] = parts;

  try {
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');

    return iv.length === IV_LENGTH && tag.length === 16 && data.length > 0;
  } catch {
    return false;
  }
}

export { encrypt, decrypt, canDecrypt, isValidEncryptedFormat, EncryptionError };
