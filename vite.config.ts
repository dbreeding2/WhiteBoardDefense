import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

// Read .env manually to bypass dotenvx interception
function readEnvFile(): Record<string, string> {
  try {
    const content = fs.readFileSync('.env', 'utf8').replace(/^\uFEFF/, '');
    const vars: Record<string, string> = {};
    content.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) vars[match[1].trim()] = match[2].trim();
    });
    return vars;
  } catch { return {}; }
}

export default defineConfig(() => {
  const env = readEnvFile();
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_APP_URL': JSON.stringify(env.VITE_APP_URL || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR must bypass the proxy and connect directly to the dev server
      hmr: process.env.DISABLE_HMR !== 'true'
        ? {
          host: 'localhost',
          port: 5173,
          protocol: 'ws',
        }
        : false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
