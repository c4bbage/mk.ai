import { describe, it, expect } from 'vitest';
import { isHtmlDifferent } from './dom-patch';

describe('isHtmlDifferent', () => {
  it('returns false for identical strings', () => {
    expect(isHtmlDifferent('<p>hello</p>', '<p>hello</p>')).toBe(false);
  });

  it('returns true for different strings', () => {
    expect(isHtmlDifferent('<p>hello</p>', '<p>world</p>')).toBe(true);
  });

  it('treats null and empty as equal', () => {
    expect(isHtmlDifferent(null, '')).toBe(false);
    expect(isHtmlDifferent(undefined, '')).toBe(false);
    expect(isHtmlDifferent(null, undefined)).toBe(false);
  });

  it('treats null and non-empty as different', () => {
    expect(isHtmlDifferent(null, '<p>x</p>')).toBe(true);
  });
});
