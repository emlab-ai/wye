export const TEMPLATES = ['blank', 'prd', 'dev-design', 'test-design', 'plan', 'research', 'map', 'timeline'] as const;
export type TemplateName = typeof TEMPLATES[number];

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'doc';
}

// `kind` is the page's type (module by default, rule:page-node-line); `parent` the parent document's node id;
// `props` the type's required properties, written as empty keys at the end of the frontmatter.
export function instantiate(template: string, vars: { title: string; slug: string; parent: string; date: string; kind?: string; props?: string[] }): string {
  const v = { ...vars, kind: vars.kind || 'module' };
  let out = template.replace(/\{\{(title|slug|parent|date|kind)\}\}/g, (_, k: 'title' | 'slug' | 'parent' | 'date' | 'kind') => v[k]);
  if (vars.props?.length) out = out.replace(/^---\n([\s\S]*?)\n---/, (_, fm: string) => `---\n${fm}\n${vars.props!.map(p => `${p}:`).join('\n')}\n---`);
  return out;
}

// What the New page sheet says about each template (its picker: a list, the hovered one described on the right).
// `sections`: the headings the page starts with.
export const TEMPLATE_INFO: Record<Exclude<TemplateName, 'blank'>, { title: string; icon: string; description: string; sections: string[] }> = {
  prd: { title: 'Product requirements', icon: '📋', description: 'What a feature must do and why: the problem, the goals and what is out of scope, then requirements a person can check from outside (when / then / unless), with their coverage and the questions still open.', sections: ['Problem statement', 'Goals and non-goals', 'Requirements', 'Coverage', 'Open questions'] },
  'dev-design': { title: 'Technical design', icon: '🛠', description: 'How it is built: the entities and their fields, value objects and enums, state machines, the operations, the pages and their actions, and the rules the code enforces.', sections: ['Overview', 'Entities', 'Value objects and enums', 'State machines', 'Operations', 'Pages and actions', 'Rules'] },
  'test-design': { title: 'Test design', icon: '🧪', description: 'How it is verified: the tests, each tied to the requirement or rule it checks, collected in a verification index.', sections: ['Verification index'] },
  plan: { title: 'Plan', icon: '🗺', description: 'How the work gets done: the goal, the phases, and the tasks — the ones a runner can take are marked ready.', sections: ['Goal', 'Phases', 'Tasks'] },
  research: { title: 'Research', icon: '🔎', description: 'Before deciding: what was asked, what exists in the product today, what the outside world says, what a change would touch, and the questions it leaves.', sections: ['What was asked', 'What exists today', 'What the outside says', 'What this would touch', 'Open questions'] },
  map: { title: 'Mind map', icon: '◈', description: 'A canvas whose nodes are the page’s own blocks: drag them, link them, group them; every node stays a block in the document.', sections: ['Layout'] },
  timeline: { title: 'Timeline', icon: '▤', description: 'The page’s dated blocks — goals, tasks, milestones — laid out on a time axis, dragged to move their dates.', sections: [] },
};
