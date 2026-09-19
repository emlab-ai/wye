// The impact run (decision:exec.impact-run, decision:exec.impact-trigger) — filled in by E.3; the watcher calls
// scheduleImpact with the change records a rebuild produced.
import type { ChangeRecord } from './changes';
export function scheduleImpact(productDir: string, product: string, records: ChangeRecord[], log: (m: string) => void = () => {}): void { void productDir; void product; void records; void log; }
