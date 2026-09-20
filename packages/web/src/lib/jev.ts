// The app's Jev client (Jev auto-linking design §1): lib/jev.js bound to the key the settings hold — shared with the
// CLI and the eval suite through createRequire like the judge. Disabled without a key: every method returns the
// empty result and makes no call.
import { createRequire } from 'node:module';
import path from 'node:path';
import { REPO_ROOT } from './products';
import { jevKey } from './settings';

/* eslint-disable @typescript-eslint/no-explicit-any */
const req = createRequire(path.join(REPO_ROOT, 'package.json'));
type Lib = { jev: (o: { key: string; model?: string }) => JevClient; LINK_MIN: number; promptVersion: () => string; DEFAULT_MODEL: string };
const lib = () => req('./lib/jev.js') as Lib;

export type JevClient = {
  enabled: boolean; model: string;
  ask: (state: unknown, questions: Record<string, unknown>, o?: { timeoutMs?: number }) => Promise<{ model: string; answers: Record<string, any>; usage: { input_tokens?: number; output_tokens?: number } }>;
  judgeLinks: (text: string, candidates: { id: string; text: string }[]) => Promise<{ id: string; p: number }[]>;
  judgeKind: (text: string) => Promise<{ kind: string; p: number }>;
};
export const LINK_MIN = () => lib().LINK_MIN;
export const promptVersion = () => lib().promptVersion();
export async function jevClient(): Promise<JevClient> { return lib().jev({ key: await jevKey() }); }
