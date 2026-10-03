// Dates as the app prints them — one fixed locale, so the server's render and the browser's agree (a default-locale
// toLocaleString printed "Oct 3, 12:50 PM" on the server and "3 Oct, 12:50" in the browser: a hydration error).
const moment = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export const formatWhen = (iso: string) => moment.format(new Date(iso));
export const formatDay = (iso: string) => day.format(new Date(iso));
export const formatTime = (iso: string) => time.format(new Date(iso));
