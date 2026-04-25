import { describe, expect, it } from 'vitest';
import { parseReturnTo, RETURN_TO_FALLBACK } from './parseReturnTo';

describe('parseReturnTo', () => {
  it('returns fallback when input is undefined', () => {
    expect(parseReturnTo(undefined)).toBe(RETURN_TO_FALLBACK);
  });

  it('returns fallback when input is an array (expo-router shape for repeated keys)', () => {
    expect(parseReturnTo(['/positions', '/alerts'])).toBe(RETURN_TO_FALLBACK);
  });

  it('returns fallback for empty string', () => {
    expect(parseReturnTo('')).toBe(RETURN_TO_FALLBACK);
  });

  it('returns fallback for input above 512 chars', () => {
    const long = '/' + 'a'.repeat(600);
    expect(parseReturnTo(long)).toBe(RETURN_TO_FALLBACK);
  });

  it('returns fallback when input cannot be decoded', () => {
    expect(parseReturnTo('%E0%A4%A')).toBe(RETURN_TO_FALLBACK);
  });

  it('returns fallback for an absolute URL', () => {
    expect(parseReturnTo(encodeURIComponent('https://evil.com/x'))).toBe(RETURN_TO_FALLBACK);
  });

  it('returns fallback for a protocol-relative URL', () => {
    expect(parseReturnTo(encodeURIComponent('//evil.com/x'))).toBe(RETURN_TO_FALLBACK);
  });

  it('returns fallback for /connect (loop prevention)', () => {
    expect(parseReturnTo(encodeURIComponent('/connect'))).toBe(RETURN_TO_FALLBACK);
  });

  it('returns fallback for /connect with query string', () => {
    expect(parseReturnTo(encodeURIComponent('/connect?returnTo=/x'))).toBe(RETURN_TO_FALLBACK);
  });

  it('decodes and returns a valid relative path', () => {
    expect(parseReturnTo(encodeURIComponent('/positions/abc'))).toBe('/positions/abc');
  });

  it('decodes and returns a valid path with query string', () => {
    expect(parseReturnTo(encodeURIComponent('/preview/abc?triggerId=xyz')))
      .toBe('/preview/abc?triggerId=xyz');
  });

  it('returns fallback for a path that does not start with /', () => {
    expect(parseReturnTo(encodeURIComponent('positions/abc'))).toBe(RETURN_TO_FALLBACK);
  });
});