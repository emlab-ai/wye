// A small progress bar; undefined means "not known".
export function ProgressBar({ value, width = 90 }: { value: number | undefined; width?: number }) {
  const v = value === undefined ? 0 : Math.max(0, Math.min(100, value));
  return <span className={`pbar ${value === undefined ? 'unknown' : ''}`} style={{ width }} role="progressbar" aria-valuenow={v}><i style={{ width: `${v}%` }} /></span>;
}
