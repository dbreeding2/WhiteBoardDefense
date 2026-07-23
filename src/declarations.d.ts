declare module "*.css";

interface ImportMeta {
  readonly env: {
    readonly BASE_URL: string;
    readonly MODE: string;
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly SSR: boolean;
    readonly VITE_APP_URL: string;
    readonly VITE_BASE_PATH: string;
  };
}
