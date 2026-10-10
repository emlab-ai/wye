// Dates as the app prints them — one fixed locale, so the server's render and the browser's agree (a default-locale
// toLocaleString printed "Oct 3, 12:50 PM" on the server and "3 Oct, 12:50" in the browser: a hydration error).
// A value that is not a date prints as nothing: Intl throws "Invalid time value" on one, and a file's missing mtime
// or a hand-typed `due: soon` must never take the page down with it (decision:waterfall.bad-date-prints-nothing).
const moment = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
// the date a string holds, or null when it holds none
export const dateOf = (iso: string | null | undefined): Date | null => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d; };
export const isValidDate = (iso: string | null | undefined): boolean => dateOf(iso) !== null;
const print = (f: Intl.DateTimeFormat, iso: string) => { const d = dateOf(iso); return d ? f.format(d) : ''; };
export const formatWhen = (iso: string) => print(moment, iso);
export const formatDay = (iso: string) => print(day, iso);
export const formatTime = (iso: string) => print(time, iso);
