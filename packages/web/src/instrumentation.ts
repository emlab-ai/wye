// Once per server process (Next's instrumentation hook): the hooks clock (decision:ea.time-based-hooks) — a tick every
// 60 s over every product, one at startup for the slots missed while the app was down. Node runtime only.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.WF_HOOKS === '0') return;
  const { startClock } = await import('./lib/hooks-clock');
  startClock();
}
