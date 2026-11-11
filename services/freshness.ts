/**
 * freshness.ts — is the app in this tab the one that is live? Phase 1.10 of
 * `PLAN_SUBMISSION_APP_FIXES_AND_REVAMP_2026-11-08`.
 *
 * **Why.** Three ENG 17 HW4 files had no answers PDF, no `fixed_layout` and no
 * `files` map: they were built by pre-20 October code in a tab kept open for
 * weeks (ENG17-90), and a deploy does nothing to a tab already open. So on
 * load, and again before building a download, the app asks the host which
 * build is live and compares it with its own (`services/appVersion.ts`).
 *
 * **The one network request the app makes**, and it is narrow: a GET of
 * `version.json` from the app's own address, written by the same build
 * (`vite.config.ts`), sending nothing. Section 3, item 5 of the plan says the
 * app makes no network call; 1.10 cannot be built without this one, and the
 * plan asks for both. Flagged to Andre Knoesen with the commit.
 *
 * **It fails open** (standing rule, `CLAUDE.md`: a download is constructive,
 * and a guard over it that cannot be sure must let it proceed). No network, a
 * slow answer, a missing or malformed file, or an unstamped build (tests, a
 * dev server) all read `unknown`, which blocks nothing. Only a clear answer
 * naming a different build reads `stale`, and the student is then told in the
 * page and given a Reload button that keeps their work.
 */

export const VERSION_FILE = 'version.json';
export const FRESHNESS_TIMEOUT_MS = 4000;

export type Freshness =
  | { state: 'current'; live: string }
  | { state: 'stale'; live: string }
  | { state: 'unknown' };

export type FetchLike = (url: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;

/** Asks the host which build is live. Never throws. */
export const checkFreshness = async (
  running: string, base: string, fetchImpl: FetchLike, timeoutMs = FRESHNESS_TIMEOUT_MS,
): Promise<Freshness> => {
  if (!running || running === 'unknown') return { state: 'unknown' };
  try {
    const url = `${base.endsWith('/') ? base : `${base}/`}${VERSION_FILE}?t=${Date.now()}`;
    const answer = fetchImpl(url, { cache: 'no-store', credentials: 'omit' }).then(async (r) => {
      if (!r.ok) return null;
      const body = await r.json() as { app_version?: unknown };
      return typeof body?.app_version === 'string' && body.app_version ? body.app_version : null;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); });
    const live = await Promise.race([answer.catch(() => null), timeout]);
    clearTimeout(timer);
    if (!live || live === 'unknown') return { state: 'unknown' };
    return live === running ? { state: 'current', live } : { state: 'stale', live };
  } catch {
    return { state: 'unknown' };
  }
};

/**
 * WORDING: PROPOSED, NOT YET CLEARED by Andre Knoesen.
 */
export const FRESHNESS_WORDING = {
  banner:
    'A newer version of this app is available. Reload this page before you download your submission. ' +
    'Your work is kept.',
  heading: 'Reload this page before downloading',
  body:
    'A newer version of this app has been published since you opened this page, so nothing was downloaded. ' +
    'Press Reload: your pages and answers are kept, and you can download straight after.',
  reload: 'Reload',
  close: 'Close',
} as const;
