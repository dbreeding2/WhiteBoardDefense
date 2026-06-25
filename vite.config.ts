import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import fs from 'fs';

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
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});