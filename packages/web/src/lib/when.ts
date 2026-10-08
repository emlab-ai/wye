// Dates as the app prints them — one fixed locale, so the server's render and the browser's agree (a default-locale
// toLocaleString printed "Oct 3, 12:50 PM" on the server and "3 Oct, 12:50" in the browser: a hydration error).
const moment = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
// A missing or unparsable date prints as nothing: Intl's format throws a RangeError on an invalid Date, and one bad
// timestamp in a log or a list must not take the page down.
const fmt = (f: Intl.DateTimeFormat) => (iso?: string) => { const d = new Date(iso ?? ''); return Number.isNaN(d.getTime()) ? '' : f.format(d); };
export const formatWhen = fmt(moment);
export const formatDay = fmt(day);
export const formatTime = fmt(time);
