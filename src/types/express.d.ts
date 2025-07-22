/// <reference types="express" />

declare namespace Express {
  interface Request {
    user?: {
      userId: string;
      username: string;
      discriminator: string;
      avatar?: string;
      iat?: number;
      exp?: number;
    };
  }
}
