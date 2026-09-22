/**
 * identityGuard.ts — a submission payload never names the student.
 *
 * `WORKORDER_SS_PIPELINE_RECALIBRATION_2026-09-21` §5.
 *
 * The app de-identifies by construction: there is no identity field anywhere in
 * its source, and none has been since 2026-09-03. This guard exists to keep it
 * that way, and it differs from what it replaced in two ways that matter.
 *
 * - **It refuses rather than strips.** The old strip deleted four fields the app
 *   never set, on one encoding path only. A strip hides the defect that put the
 *   field there; a refusal names it. The export fails loudly and the person who
 *   added the field finds out the day they add it.
 * - **It runs on every path.** `buildSubmissionPackage` calls it once, after the
 *   payload is assembled and before anything is written, for a handwritten and
 *   an electronic submission alike.
 *
 * It walks every key at every depth, because `crops` is keyed by `region_id`
 * and a region id comes from an instructor's layout map, not from this code.
 */

/**
 * Identity-shaped keys, compared after lower-casing and removing everything but
 * letters and digits — so `student_name`, `studentName` and `Student-Name` are
 * one entry. Exact matches only: a substring rule would trip on `pdf_filename`
 * and `region_id`, and a guard that fires on correct payloads gets deleted.
 */
const IDENTITY_KEYS = new Set([
  'name', 'fullname', 'firstname', 'lastname', 'givenname', 'familyname', 'surname',
  'studentname', 'displayname', 'username', 'login', 'userid', 'user',
  'email', 'emailaddress', 'mail', 'studentemail',
  'sid', 'studentid', 'studentnumber', 'studentno', 'netid', 'ucdid', 'kerberos',
  'phone', 'phonenumber',
]);

const normalise = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '');

/** True for a key that names a person, however it is spelled. */
export const isIdentityKey = (key: string): boolean => IDENTITY_KEYS.has(normalise(key));

/** Every identity-shaped key in `value`, as a dotted path. Empty when there are none. */
export const identityKeysIn = (value: unknown, path = ''): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => identityKeysIn(v, `${path}[${i}]`));
  }
  if (value === null || typeof value !== 'object') return [];
  const found: string[] = [];
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key;
    if (isIdentityKey(key)) found.push(here);
    found.push(...identityKeysIn(v, here));
  }
  return found;
};

export const IDENTITY_IN_PAYLOAD = 'IdentityInPayload';

/** Throws, naming every offending key, if the payload carries anything identity-shaped. */
export const assertNoIdentityKeys = (payload: unknown): void => {
  const found = identityKeysIn(payload);
  if (found.length === 0) return;
  const e = new Error(
    `The submission was not built: its payload carries identity-shaped keys ` +
    `(${found.join(', ')}). A submission never names the student; identity comes from ` +
    `the account the work is submitted from. This is a defect in the app or in the assignment's layout map.`);
  e.name = IDENTITY_IN_PAYLOAD;
  throw e;
};
