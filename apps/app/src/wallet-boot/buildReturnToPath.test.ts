import { describe, expect, it } from 'vitest';
import { buildReturnToPath } from './buildReturnToPath';

describe('buildReturnToPath', () => {
  it('returns plain pathname when there is no search', () => {
    expect(buildReturnToPath('/positions/abc', {})).toBe('/positions/abc');
  });

  it('joins pathname and querystring', () => {
    expect(buildReturnToPath('/preview/abc', { triggerId: 'xyz' }))
      .toBe('/preview/abc?triggerId=xyz');
  });

  it('joins multiple search params in declaration order', () => {
    expect(buildReturnToPath('/signing/abc', { previewId: 'p', triggerId: 't' }))
      .toBe('/signing/abc?previewId=p&triggerId=t');
  });

  it('strips an existing returnTo param to prevent recursion', () => {
    expect(buildReturnToPath('/preview/abc', { triggerId: 'xyz', returnTo: '/whatever' }))
      .toBe('/preview/abc?triggerId=xyz');
  });

  it('skips array-shaped params (treats only string params)', () => {
    expect(buildReturnToPath('/x', { tag: ['a', 'b'], q: 'k' }))
      .toBe('/x?q=k');
  });

  it('skips undefined values', () => {
    expect(buildReturnToPath('/x', { q: 'k', empty: undefined }))
      .toBe('/x?q=k');
  });

  it('returns plain pathname when only param is the stripped returnTo', () => {
    expect(buildReturnToPath('/x', { returnTo: '/y' })).toBe('/x');
  });

  it('URL-encodes search values', () => {
    expect(buildReturnToPath('/x', { q: 'a b/c' })).toBe('/x?q=a%20b%2Fc');
  });
});