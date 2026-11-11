/**
 * appVersion.ts — which build of the app wrote a suitcase (Phase 1.7 of
 * `PLAN_SUBMISSION_APP_FIXES_AND_REVAMP_2026-11-08`).
 *
 * `__APP_VERSION__` is the short commit the build was made from, stamped by
 * `vite.config.ts` at build time (`-dirty` appended if the tree had changes).
 * Anything that is not a Vite build, such as the test harnesses' esbuild
 * bundles, has no stamp and reads `unknown`.
 *
 * Why: three ENG 17 HW4 files were built by pre-20 October code in a tab left
 * open for weeks (ENG17-90), and nothing in them said so. The payload records
 * this as `app_version`; RELAY must accept the field before it ships (G13).
 */
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : 'unknown';
