/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STATUS_API_KEY: string;
  readonly VITE_FRONTEND_URL: string;
  readonly VITE_DISCORD_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
