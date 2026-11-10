import path from 'path';
import { readFile } from 'node:fs/promises';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The SIL Open Font Licence for the self-hosted typeface, copied into the build
 * from the installed package: the site distributes the Figtree binaries, and
 * OFL 1.1 requires its notice to travel with them.
 */
const fontLicence = (): Plugin => ({
  name: 'gb-font-licence',
  async generateBundle() {
    const source = await readFile(path.resolve(__dirname, 'node_modules/@fontsource/figtree/LICENSE'), 'utf8');
    this.emitFile({ type: 'asset', fileName: 'fonts/Figtree-OFL.txt', source });
  },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/GradeBridge-Student-Submission/',
      server: {
        port: 3001,
        host: '0.0.0.0',
      },
      plugins: [react(), fontLicence()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
