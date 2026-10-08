import { describe, it, expect } from 'vitest';
import { formatWhen, formatDay, formatTime } from './when';

// the server and the browser must print a date the same way, whatever their default locale (hydration)
describe('when', () => {
  const iso = new Date(2026, 9, 3, 12, 50).toISOString();
  it('a moment: day, short month, 24-hour time', () => { expect(formatWhen(iso)).toBe('3 Oct, 12:50'); });
  it('a day', () => { expect(formatDay(iso)).toBe('3 Oct 2026'); });
  it('a time of day', () => { expect(formatTime(iso)).toBe('12:50:00'); });
  it('a missing or invalid date is empty, not an error', () => { for (const f of [formatWhen, formatDay, formatTime]) { expect(f('')).toBe(''); expect(f('not a date')).toBe(''); expect(f(undefined)).toBe(''); } });
});
