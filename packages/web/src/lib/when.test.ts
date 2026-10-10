import { describe, it, expect } from 'vitest';
import { dateOf, formatDay, formatTime, formatWhen, isValidDate } from './when';

describe('dates as the app prints them', () => {
  it('prints a date in one fixed locale', () => {
    expect(formatDay('2026-10-09T15:30:00.000Z')).toBe('9 Oct 2026');
    expect(formatWhen('2026-10-09T15:30:00.000Z')).toMatch(/^9 Oct, \d\d:\d\d$/);
    expect(formatTime('2026-10-09T15:30:05.000Z')).toMatch(/^\d\d:\d\d:05$/);
  });
  it('prints nothing for what is not a date, instead of throwing', () => {
    for (const bad of ['', 'soon', '2026-13-45', 'Invalid Date', '   ']) {
      expect(formatDay(bad)).toBe('');
      expect(formatWhen(bad)).toBe('');
      expect(formatTime(bad)).toBe('');
      expect(isValidDate(bad)).toBe(false);
      expect(dateOf(bad)).toBeNull();
    }
    expect(formatDay(undefined as unknown as string)).toBe('');
    expect(isValidDate('2026-10-09')).toBe(true);
  });
});
