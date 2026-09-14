export function KindPill({ kind }: { kind: string }) {
  return <span className="pill k" style={{ background: `var(--k-${kind}, var(--k-other))` }}>{kind}</span>;
}
export function StatusPill({ status }: { status: string }) {
  if (!status) return null;
  return <span className={`pill s ${status}`}>{status}</span>;
}
export function StubPill({ defined }: { defined: boolean }) {
  return defined ? null : <span className="pill stub">referenced only</span>;
}
export function statusMark(kind: string, status: string, tested: boolean): string {
  if (kind !== 'req') return status || 'none';
  const s = status || 'shipped';
  return s === 'shipped' && !tested ? 'unverified' : s;
}
