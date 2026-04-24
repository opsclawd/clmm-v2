import { describe, expect, it } from 'vitest';
import {
  buildPhantomBrowseUrl,
  buildSolflareBrowseUrl,
  isSocialAppWebView,
} from './walletDeepLinks';

describe('buildPhantomBrowseUrl', () => {
  it('encodes the current URL into the Phantom browse deep link', () => {
    const url = buildPhantomBrowseUrl('https://example.com/connect');
    expect(url).toBe('https://phantom.app/ul/v1/browse/https%3A%2F%2Fexample.com%2Fconnect');
  });

  it('does not throw on invalid URLs', () => {
    expect(() => buildPhantomBrowseUrl('not-a-url')).not.toThrow();
    const result = buildPhantomBrowseUrl('not-a-url');
    expect(result).toContain('phantom.app');
  });
});

describe('buildSolflareBrowseUrl', () => {
  it('encodes the current URL and origin ref into the Solflare browse deep link', () => {
    const url = buildSolflareBrowseUrl('https://example.com/connect');
    const encoded = encodeURIComponent('https://example.com/connect');
    const encodedRef = encodeURIComponent('https://example.com');
    expect(url).toBe(`https://solflare.com/ul/v1/browse/${encoded}?ref=${encodedRef}`);
  });

  it('does not throw on invalid URLs', () => {
    expect(() => buildSolflareBrowseUrl('just-text')).not.toThrow();
    const result = buildSolflareBrowseUrl('just-text');
    expect(result).toContain('solflare.com');
  });
});

describe('isSocialAppWebView', () => {
  it.each([
    ['Facebook iOS', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) FBAN/FBAV'],
    ['Facebook Android', 'Mozilla/5.0 (Linux; Android 14) FB_IAB/FBAV'],
    ['Instagram', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Instagram 300'],
    ['Twitter/X', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Twitter for iPhone'],
    ['TikTok', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) musical_ly/34'],
    ['LinkedIn', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) LinkedIn/10'],
    ['LINE', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Line/13'],
  ])('returns true for %s UA', (_label, ua) => {
    expect(isSocialAppWebView(ua)).toBe(true);
  });

  it.each([
    ['Safari iOS 17', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'],
    ['Chrome Android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'],
    ['Phantom mobile browser', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Phantom/1.0'],
  ])('returns false for %s UA', (_label, ua) => {
    expect(isSocialAppWebView(ua)).toBe(false);
  });
});