declare module 'vite/client';

/**
 * Vite injects these at build time. The project's tsconfig sets `types: ["node"]`,
 * which excludes vite/client's own globals, so the ones actually used are declared here.
 */
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
