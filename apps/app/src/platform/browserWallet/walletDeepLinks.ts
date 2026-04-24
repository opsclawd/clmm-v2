export function buildPhantomBrowseUrl(currentUrl: string): string {
  return `https://phantom.app/ul/v1/browse/${encodeURIComponent(currentUrl)}`;
}

export function buildSolflareBrowseUrl(currentUrl: string): string {
  const encodedUrl = encodeURIComponent(currentUrl);
  let origin: string;
  try {
    origin = new URL(currentUrl).origin;
  } catch {
    origin = currentUrl;
  }
  const encodedRef = encodeURIComponent(origin);
  return `https://solflare.com/ul/v1/browse/${encodedUrl}?ref=${encodedRef}`;
}

const SOCIAL_WEBVIEW_UA_PATTERNS = [
  /FBAN|FBAV|FB_IAB/i,
  /Instagram/i,
  /Twitter/i,
  /TikTok|musical_ly/i,
  /LinkedIn/i,
  /Line\//i,
];

export function isSocialAppWebView(userAgent: string): boolean {
  return SOCIAL_WEBVIEW_UA_PATTERNS.some((re) => re.test(userAgent));
}

export function openInExternalBrowser(currentUrl: string): 'attempted' | 'copy-only' {
  const ua = navigator.userAgent;

  if (/Android/i.test(ua)) {
    const intentUrl = `intent://${currentUrl.replace(/^https?:\/\//, '')}#Intent;scheme=https;end`;
    window.location.href = intentUrl;
    return 'attempted';
  }
  if (/iPhone|iPad/i.test(ua)) {
    window.location.href = `x-safari-${currentUrl.replace(/^http/, 'http')}`;
    return 'attempted';
  }
  return 'copy-only';
}