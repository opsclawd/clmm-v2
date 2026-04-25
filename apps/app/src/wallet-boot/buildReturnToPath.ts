export type SearchParamRecord = Record<string, string | string[] | undefined>;

export function buildReturnToPath(pathname: string, search: SearchParamRecord): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(search)) {
    if (key === 'returnTo') continue;
    if (typeof value !== 'string') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.length === 0 ? pathname : `${pathname}?${parts.join('&')}`;
}