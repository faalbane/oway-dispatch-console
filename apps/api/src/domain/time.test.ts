import { describe, expect, it } from 'vitest';
import { formatHHMM, parseHHMM } from './time';

describe('time helpers', () => {
  it('parses HH:MM correctly', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('06:30')).toBe(390);
    expect(parseHHMM('23:59')).toBe(1439);
  });

  it('rejects invalid HH:MM strings', () => {
    expect(() => parseHHMM('25:00')).toThrow();
    expect(() => parseHHMM('6:30')).toThrow();
    expect(() => parseHHMM('not-a-time')).toThrow();
  });

  it('formats minutes back to HH:MM', () => {
    expect(formatHHMM(0)).toBe('00:00');
    expect(formatHHMM(390)).toBe('06:30');
    expect(formatHHMM(1439)).toBe('23:59');
  });

  it('rounds fractional minutes to nearest whole minute', () => {
    // Regression: routing produced "06:6.54..." before this fix
    expect(formatHHMM(366.5)).toBe('06:07');
    expect(formatHHMM(366.4)).toBe('06:06');
  });

  it('caps overflow at 23:59 (no overnight rollover in v1)', () => {
    expect(formatHHMM(1500)).toBe('23:59');
    expect(formatHHMM(2000)).toBe('23:59');
  });
});
