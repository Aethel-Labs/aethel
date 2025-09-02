declare global {
  namespace NodeJS {
    interface ProcessEnv {
      ALLOWED_ORIGINS: string;
      API_KEY_ENCRYPTION_SECRET: string;
      DATABASE_URL: string;
      OPENROUTER_API_KEY: string;
      OPENWEATHER_API_KEY: string;
      SOURCE_COMMIT: string;
      STATUS_API_KEY: string;
      TOKEN: string;
      CLIENT_ID: string;
      CLIENT_SECRET: string;
      REDIRECT_URI: string;
    }
  }
}

export { };
