// The system prompt every agent started by Wye receives: the shared contract (prompts/agent-system.md) plus
// the product's own instructions (data/products/<product>/_agent.md) when present.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './products';
import { readdir } from 'node:fs/promises';

export async function agentSystemPrompt(product: string, productDir: string, wfUrl: string): Promise<string> {
  let base = '';
  try { base = await readFile(path.join(REPO_ROOT, 'prompts/agent-system.md'), 'utf8'); } catch { base = '# Wye contract\nWye is the source of truth for product knowledge. Read it before acting (`wf context`, `wf resolve`) and record every decision, requirement, rule and task back into it.'; }
  let own = '';
  try { own = await readFile(path.join(productDir, '_agent.md'), 'utf8'); } catch { /* none */ }
  // every project's plan document (`plan.md`, else the one file named plan-ish that is not a request's `plan-<slug>.md`
  // or the Plans page), so follow-ups have a named home
  const plans: string[] = [];
  try { for (const proj of await readdir(path.join(productDir, 'projects'))) { try { const files = await readdir(path.join(productDir, 'projects', proj, 'docs')); const plan = files.find(f => f === 'plan.md') ?? files.find(f => /plan/i.test(f) && !/^plans?[-.]/i.test(f)); if (plan) plans.push(`- project \`${proj}\`: ${path.join(REPO_ROOT, 'data/products', product, 'projects', proj, 'docs', plan)}`); } catch { /* no docs */ } } } catch { /* no projects */ }
  const env = `\n\n## This product\n- product: \`${product}\` (WF_PRODUCT=${product}); Wye repo: ${REPO_ROOT}; app: ${wfUrl}\n- documents: ${REPO_ROOT}/data/products/${product}/projects/<project>/docs/*.md; graph check: \`ctx --root data/products/${product} check\` (run from ${REPO_ROOT})\n- the \`wf\` CLI is on PATH (WF_URL=${wfUrl})${plans.length ? `\n- plan documents (follow-ups go here as task lines):\n${plans.join('\n')}` : ''}`;
  return base.trim() + env + (own.trim() ? `\n\n## Product instructions\n${own.trim()}` : '') + '\n';
}
