import { describe, it, expect } from 'vitest';
import { perfMark, perfMeasure, debounce, throttle, isLargeDocument, getRenderDelay } from './performance';

describe('perfMark', () => {
  it('does not throw', () => {
    expect(() => perfMark('test_mark')).not.toThrow();
  });
});

describe('perfMeasure', () => {
  it('returns duration between two marks', () => {
    performance.mark('test_start');
    performance.mark('test_end');
    const duration = perfMeasure('test_measure', 'test_start', 'test_end');
    expect(duration).toBeTypeOf('number');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('returns null for missing marks', () => {
    const result = perfMeasure('missing', 'no_start', 'no_end');
    expect(result).toBeNull();
  });
});

describe('debounce', () => {
  it('delays execution', async () => {
    let count = 0;
    const fn = debounce(() => { count++; }, 50);
    fn();
    fn();
    fn();
    expect(count).toBe(0);
    await new Promise(r => setTimeout(r, 100));
    expect(count).toBe(1);
  });
});

describe('throttle', () => {
  it('executes immediately then throttles', async () => {
    let count = 0;
    const fn = throttle(() => { count++; }, 50);
    fn();
    fn();
    fn();
    expect(count).toBe(1);
    await new Promise(r => setTimeout(r, 100));
    fn();
    expect(count).toBe(2);
  });
});

describe('isLargeDocument', () => {
  it('returns false for small content', () => {
    expect(isLargeDocument('hello')).toBe(false);
  });

  it('returns true for large content', () => {
    expect(isLargeDocument('x'.repeat(10001))).toBe(true);
  });

  it('returns false at boundary', () => {
    expect(isLargeDocument('x'.repeat(10000))).toBe(false);
  });
});

describe('getRenderDelay', () => {
  it('returns 100 for small content', () => {
    expect(getRenderDelay('x'.repeat(100))).toBe(100);
  });

  it('returns 200 for medium content', () => {
    expect(getRenderDelay('x'.repeat(10000))).toBe(200);
  });

  it('returns 300 for large content', () => {
    expect(getRenderDelay('x'.repeat(30000))).toBe(300);
  });

  it('returns 500 for very large content', () => {
    expect(getRenderDelay('x'.repeat(60000))).toBe(500);
  });
});
