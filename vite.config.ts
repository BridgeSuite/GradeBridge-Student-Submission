import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

/**
 * The commit this build is made from, for `services/appVersion.ts` (Phase 1.7).
 * `-dirty` when the working tree has changes, so a build that is not exactly
 * a commit never claims to be one; `unknown` where git cannot be asked.
 */
const appVersion = (): string => {
  try {
    const sha = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8' }).trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return 'unknown';
  }
};

/**
 * Writes `version.json` beside `index.html`, holding the same stamp the bundle
 * carries, so an open tab can ask whether it is still the live build
 * (`services/freshness.ts`, Phase 1.10). One stamp, computed once, for both.
 */
const versionFile = (version: string) => ({
  name: 'gradebridge-version-file',
  generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify({ app_version: version })}\n` });
  },
});

export default defineConfig(({ mode }) => {
    const version = appVersion();
    const env = loadEnv(mode, '.', '');
    return {
      base: '/GradeBridge-Student-Submission/',
      server: {
        port: 3001,
        host: '0.0.0.0',
      },
      plugins: [react(), versionFile(version)],
      define: {
        __APP_VERSION__: JSON.stringify(version),
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
