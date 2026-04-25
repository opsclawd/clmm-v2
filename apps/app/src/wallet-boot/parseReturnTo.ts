export const RETURN_TO_FALLBACK = '/(tabs)/positions';
const MAX_LENGTH = 512;

export function parseReturnTo(raw: string | string[] | undefined): string {
  if (typeof raw !== 'string') return RETURN_TO_FALLBACK;
  if (raw.length === 0 || raw.length > MAX_LENGTH) return RETURN_TO_FALLBACK;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return RETURN_TO_FALLBACK;
  }

  if (!decoded.startsWith('/')) return RETURN_TO_FALLBACK;
  if (decoded.startsWith('//')) return RETURN_TO_FALLBACK;
  if (decoded === '/connect' || decoded.startsWith('/connect?') || decoded.startsWith('/connect/')) {
    return RETURN_TO_FALLBACK;
  }

  return decoded;
}