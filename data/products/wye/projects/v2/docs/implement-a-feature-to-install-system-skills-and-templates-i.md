---
node: module:implement-a-feature-to-install-system-skills-and-templates-i
title: Implement a feature to install system skills and templates, i would like to store templates in the system, and — research
status: proposed
owner: unassigned
last-verified: 2026-09-22
part-of: run:feature-1
---

# Implement a feature to install system skills and templates, i would like to store templates in the system, and — research

## 0. module:implement-a-feature-to-install-system-skills-and-templates-i

```yaml
- id: module:implement-a-feature-to-install-system-skills-and-templates-i
  purpose: >
    What is true around this idea — what the product already says, what the code does, what the outside claims,
    what a change would reach, and what is still undecided. No requirements here: they are the PRD's.
```

## What was asked

The idea, in the person's words (goal:new-650, task:new-202):

> Implement a feature to install system skills and templates, i would like to store templates in the system, and
>  install them optionally to the project, think about update, unisnstall etc

Three things are asked for, and they are not the same thing:

- **System skills and templates exist as things Wye ships** — a catalogue, not a side effect. Today the shipped prompts are already skills (decision:wf2.hooks-and-skills) and the Feature pipeline is already a workflow (decision:wf2.workflow-is-a-skill); what is missing is that they are *offered* rather than simply written.
- **Templates are **value:stored** in the system.** Today page templates are files of the Wye repository (`templates/docs/*.md`) and the picker's list is a constant in the app's code — a person cannot see, edit or add one. Skills went the other way a day earlier: they became documents so a person could read and edit them. question:install.templates-as-knowledge
- **Install, update, uninstall are a lifecycle.** Today there is only install, it happens without being asked for, it never runs again, and it cannot be undone.

This research is what is true around that. It writes no requirements — those are the PRD's.

## What exists today

### What the knowledge says

- decision:wf2.hooks-and-skills (approved) — "The shipped prompts are written there as skill:refine, skill:build, skill:describe-module (plus skill:define-tests) **the first time a product opens**"; and "Every product gets a Skills folder and a Hooks link in the rail, five system documents written on first open." So the current behaviour is decided, not accidental: installation is automatic and unconditional. Nothing in the decision says what happens when the shipped prompt changes afterwards, or how a product stops carrying one.
- decision:wf2.workflow-is-a-skill (approved) — the Feature pipeline "shipped with workflow:feature … as five editable skills and one workflow document; **every product gets them on first open**." Same act, more documents.
- type:template (schema/base-ontology.md) exists already, but only for the blocks a hook adds: "`body` is markdown with {{node}}, {{slug}}, {{title}}". There is no type for a *page* template.
- req:wf2.page.new-dialog (shipped) — the New page sheet offers "Template (prd, dev design, test design, plan)". That list is the one a person sees; it is closed.
- task:wf2.definition.template (open) — "The layered tree … as `templates/product/`, so a new product starts with the same pages and the view blocks in place" — a *product-shaped* template, already planned, with no installer.
- constraint:wf2.text-canonical — a product's knowledge is its markdown documents and nothing is stored apart that the documents do not say. An install record therefore cannot live in `_settings.json` (lib:settings — machine-local, gitignored, mode 0600); it has to be in the documents.
- constraint:wf2.local-first — no hosting surface, so a "catalogue" is what this repository ships, not a remote registry. Anything marketplace-shaped is out of scope until that constraint changes.

### What the code does

**Install is a side effect of rendering a page.** `app/[product]/layout.tsx#ProductLayout` calls, on every render of every product:

```
await ensureViewPages(viewProject); const m = mainOf(viewProject);
await ensureBaseSkills(viewProject, m); await ensureBaseWorkflows(viewProject, m); await ensureHooksPage(viewProject, m);
```

- lib:skills (`lib/skills.ts#ensureBaseSkills`) walks `BASE_SKILLS` — twelve entries today, each naming a `prompts/*.md` file — and writes `skill-<slug>.md` **when the file is missing**, `continue` otherwise. `lib/skills.ts#ensureBaseWorkflows` does the same for `BASE_WORKFLOWS` (`['feature']`) from `templates/docs/workflow-feature.md`. `lib/skills.ts#ensurePage` writes `skills.md` / `hooks.md` from `templates/docs/{skills,hooks}.md`.
- `templates/docs/hooks.md` is not an empty page: it ships three `hook:` cards (two `status: active`, one paused) and one template:test-card card. So opening a product for the first time installs *behaviour* — hook:req-approved-tests starts an agent session the next time a requirement is approved — with nothing asked and nothing shown.
- There is no `uninstall`: `exists → skip` means deleting a skill document brings it back on the next page render.
- There is no `update`: the same `exists → skip` means a product's copy is frozen at the version of the day it was first opened. `lib/skills.ts#skillBody` then prefers the document over the file — "the file stays the fallback" — so the frozen copy is what the agents actually follow.

**The freeze has already bitten, in every product including Wye's own.** Commit 40e115e changed how the librarian is told to write a rule (`statement` as a child block under the card, decision:wf2.parts-are-content) in `prompts/librarian-system.md`. Every installed copy still carries the old wording:

```
$ diff <installed skill:refine> <prompts/librarian-system.md>
- A **rule** (`rule:`) is an invariant the code enforces … with `statement` and `source: file#symbol`.
+ A **rule** (`rule:`) is an invariant the code enforces … with `source: file#symbol` on the card and what it
+   guarantees as a `- statement:<slug> …` block under it.
```

— identical drift in `data/products/wye/projects/evaluation/docs/skill-refine.md`, `eval-mab/projects/cr`, `yessensei/projects/inventory`, `yessensei/projects/offline`, `zz-import/projects/main`. None of those five was edited by a person: the divergence is entirely the installer's. Every librarian session in every product is following an instruction Wye stopped shipping.

**Where an install lands is whichever project happens to hold the PRs page.** `layout.tsx` picks `viewProject = scope.projects.find(p => … prsPageId(p.slug)) ?? scope.projects[0]`. Consequences visible on disk:

- Wye's own twelve skills and `workflow-feature.md` live in `projects/evaluation/docs/`, not in `v2` — the project where the work is. (This session's skill:research was read from there.)
- yessensei has **two** installed sets, 7 skills in `projects/inventory` and 12 in `projects/offline`, written at two different times because the chosen project changed. Both define skill:refine, skill:build, skill:describe-module with the same ids. `wye check --root data/products/yessensei` reports 0 errors: duplicate *type* ids are an error (`lib/parse.js` "duplicate type"), duplicate *node* ids are not. The two lookups then disagree — `lib/graph.ts` builds `byId` with `new Map(g.nodes.map(…))` (last wins) while `lib/skills.ts#skillBody` uses `graph.modules.find(…)` (first wins) — so which of the two copies an agent runs depends on which code path asked.
- eval-mab is still on the pre-workflow set of six: it was opened before the Feature pipeline shipped, and the six new skills only arrive if someone opens it again.

**Page templates are files and a hardcoded list.** `lib/templates.ts` is `export const TEMPLATES = ['blank', 'prd', 'dev-design', 'test-design', 'plan', 'research'] as const`, read by component:new-page (`components/NewPage.tsx`) for the picker; lib:doc-create (`lib/doc-create.ts#createDocFromTemplate`) reads `templates/docs/<name>.md` from `REPO_ROOT` and fails with `unknown template` for anything else. lib:runs-run (`lib/runs-run.ts`) instantiates a stage's `produces:` documents from the same folder, `lib/pr-docs.ts` the PR page, `lib/comments.ts` and the types routes the blank page. Nothing reads a template from the product. A person cannot add a template, cannot see one, cannot change the picker.

**Block templates are half-way there already.** lib:hooks-run (`lib/hooks-run.ts#addFromTemplate`) resolves `add <template>` as "a `template:<name>` card in the product, **else** `templates/hooks/<name>.md`" — exactly the document-first, file-fallback shape that `skillBody` uses. That precedent is the cheapest answer to "store templates in the system", and it is already shipped for one of the three kinds.

**The surfaces that exist.** op:api.skills (`api/[product]/skills/route.ts`) is GET list / GET one / POST new (`lib/skills.ts#createSkillDoc` from `templates/docs/skill.md`); component:skill-folder has a `+` and no delete; the CLI has `wye skills` and `wye skill <id>`, whose empty-list message is the current model stated out loud: `no skills — open the product in the app once: the base skills are written then`. type:skill and type:hook are `open: true`, so an install record on the card needs no schema change (`source:` is already written and undeclared).

## What the outside says

Three sources, each checked, each answering a different part of the lifecycle.

**Copier — ****`copier update` (https://copier.readthedocs.io/en/stable/updating/).** Claims that a generated project can be updated from an evolved template by regenerating a fresh project at the current template version, diffing that fresh copy against the user's current project, applying the template's changes and re-applying the user's diff on top — a three-way merge. The version and the answers that produced the project are recorded in *`.copier-answers.yml`*, and the docs warn: "Never update *`.copier-answers.yml`* manually. This will trick Copier, making it believe that those modified answers produced the current subproject." What this says for Wye: an update that must survive the person's edits needs *the version it was installed from* recorded and trusted; without it, update is guesswork. Wye's skill cards record `source: prompts/librarian-system.md` — the origin, never the version.

**cruft (https://cruft.github.io/cruft/).** Exists because Cookiecutter stops at generation: "once created, most leave you with that copy-and-pasted code to manage through the life of your project." cruft claims to keep the project "in-sync with the template it came from", with `cruft update` applying template changes for review, and records the *git hash* of the template plus the variables in `.cruft.json`. What this says for Wye: the gap between "scaffold once" and "stays in sync" is a known, named gap that tools are built to close — and the fix is always a recorded hash plus a reviewable diff, not a re-run of the generator.

**Claude Code's plugin store, as installed on this machine (**`~/.claude/plugins/`**).** Two files, and the split is the point. `known_marketplaces.json` is the catalogue — where things may come from (`{"claude-plugins-official": {"source": {"source": "github", "repo": "anthropics/claude-plugins-official"}, …}`). `installed_plugins.json` is the ledger of what is actually installed, one record per plugin per scope: `{"scope": "user", "installPath": "…/cache/claude-plugins-official/agent-sdk-dev/c447c3207a42", "version": "c447c3207a42", "installedAt": "2026-02-22T…", "lastUpdated": "2026-09-18T…"}`. The installed copy sits in a cache keyed by version, separate from anything the user writes; update means fetching another version and rewriting the record, uninstall means dropping both. What this says for Wye: the catalogue and the ledger are different things, and an install record wants origin + version + when. What it does **not** transfer: Claude Code's installed copy is read-only vendor content, so update can replace it wholesale. Wye's installed skill is a *document the person is invited to edit* (decision:wf2.hooks-and-skills: "so a person edits what the agents follow") — which is precisely why Wye's update problem is Copier's, not Claude Code's.

No source was found for the specific case of installing knowledge documents into a knowledge graph; the three above cover files on disk. Wye has one advantage none of them has: it already owns a review mechanism for a changed block — the change record and the Inbox — which is a plausible home for "the shipped version moved on" (see the open questions).

## What this would touch

`wye impact lib:skills` with "the base skills, workflows and templates are installed by the person's choice rather than written on first open; they can be updated and uninstalled" returns nine candidates: two **update** — decision:wf2.hooks-and-skills and its choice:wf2.hooks-and-skills, whose text says the prompts are written "the first time a product opens" — and seven unaffected (req:wf2.hooks, req:wf2.workflows, decision:wf2.workflow-is-a-skill, decision:wf2.traceability-is-the-verb, req:wf2.pr, test:web-lib). The mechanism of hooks, workflows and traceability does not change; only when and by whose choice the documents appear.

**Knowledge that would be edited or added**

- decision:wf2.hooks-and-skills [approved] — the sentence about writing the prompts on first open. An approved decision: a new decision that supersedes the clause, not an edit in place.
- decision:wf2.workflow-is-a-skill [approved] — "every product gets them on first open", same clause, same treatment.
- type:skill, type:hook, type:template (schema/base-ontology.md) — both skill and hook are `open: true`, so an install record as card properties needs no schema change; declaring it does.
- req:wf2.page.new-dialog [shipped] (module:req-documents) — "Template (prd, dev design, test design, plan)" stops being a closed list the moment templates come from the product.
- task:wf2.definition.template [open] — the product-shaped template it plans is the first thing an installer would install; it should become part of this feature rather than a parallel path.
- constraint:wf2.text-canonical and constraint:wf2.local-first — both hold: the record is in markdown, the catalogue is what this repository ships.

**Code a change would reach**

- lib:skills (`lib/skills.ts`) — `BASE_SKILLS`, `BASE_WORKFLOWS`, `ensureBaseSkills`, `ensureBaseWorkflows`, `ensurePage`, `skillBody`, `createSkillDoc`. The centre of it.
- `app/[product]/layout.tsx#ProductLayout` — the render-time `ensure*` calls and `viewProject` / `mainOf`, which is where "which project gets it" is decided today.
- lib:templates (`lib/templates.ts`) — `TEMPLATES`, `instantiate`; lib:doc-create (`lib/doc-create.ts#createDocFromTemplate`); component:new-page (`components/NewPage.tsx`) — the picker.
- lib:hooks-run (`lib/hooks-run.ts#addFromTemplate`) — already document-first, file-fallback; the pattern to generalise, and a consumer if page templates become cards.
- lib:runs-run (`lib/runs-run.ts`) — a stage's `produces:` documents come from `templates/docs`; the runs page itself is created the same way.
- `lib/pr-docs.ts`, `lib/comments.ts`, `api/[product]/types/**` — the other readers of `templates/docs/*.md`.
- op:api.skills (`api/[product]/skills/route.ts`) and component:skill-folder — where install / update / uninstall would be operated; the CLI's `wye skills` message ("open the product in the app once") would go.
- lib:settings (`lib/settings.ts`) — named to be ruled out: `_settings.json` is machine-local and gitignored, so it cannot hold the install record (constraint:wf2.text-canonical).

**Documents**

data/products/wye/projects/v2/docs/librarian.md (both decisions), app-storage.md (lib:skills), app-documents.md and requirements-documents.md (the New page sheet), plan.md (task:wf2.definition.template), schema/base-ontology.md (the types), and the five products on disk that already carry an installed set — wye/projects/evaluation, eval-mab/projects/cr, yessensei/projects/inventory **and** /offline, zz-import/projects/main. Any change needs a migration story for those, including yessensei's duplicate ids.

## Open questions

Seven forks. The PRD cannot be written past them; each is answerable by a person in a sentence.

```yaml
- id: question:install.opt-in-or-opt-out
  q: >
    Does a product get the system skills, workflow and hooks only when someone installs them, or does it keep getting them automatically with an uninstall afterwards?
  context: >
    The idea says "install them optionally to the project". Today `layout.tsx#ProductLayout` writes twelve skill
    documents, a workflow document and a hooks page with two active hook cards on the first render of any product,
    and decision:wf2.hooks-and-skills says so on purpose. Opt-in means an empty new product and a visible act;
    opt-out means the product is useful immediately and the act is removal. It also decides what the first run of a
    hook means: `templates/docs/hooks.md` ships `hook:req-approved-tests`, which starts an agent session.
  about: decision:wf2.hooks-and-skills, decision:wf2.workflow-is-a-skill
  status: resolved
```

  any new project must be fresh with no hooks, skills, unless project created from a template

  ## Answer

  yes, only when installed, unless there it is marked a system package

```yaml
- id: question:install.unit
  q: >
    Is the thing a person installs one skill, or a named bundle (the Feature workflow, the layered product tree)?
  context: >
    Today one act writes twelve skills + workflow:feature + a hooks page. Claude Code installs plugins — bundles —
    from a marketplace, and lists them one record per plugin. workflow:feature is only meaningful with its five
    stage skills, so those five travel together; skill:import-code does not. task:wf2.definition.template plans a
    whole product tree as a template, which is a bundle of documents. The answer shapes the catalogue, the ledger
    and what uninstall removes.
  about: decision:wf2.workflow-is-a-skill
  status: resolved
```

  single package, which can contain multiple files, skill, workflows etc

  bundle, which has just a folder with files (can be any md file inside, template, skill, workflow etc)

```yaml
- id: question:install.record-home
  q: >
    Where is the record of what is installed, at which version — on each installed document's own card, or one
    manifest per product?
  context: >
    Update is impossible without it: Copier keeps `.copier-answers.yml`, cruft the template's git hash in
    `.cruft.json`, Claude Code a record per plugin in `installed_plugins.json` with version, installedAt and
    lastUpdated. Wye writes `source: prompts/librarian-system.md` on the skill card — the origin, no version.
    constraint:wf2.text-canonical rules out `_settings.json` (machine-local, gitignored). type:skill is `open: true`,
    so card properties cost nothing; a manifest would be a new document and a new kind.
  about: constraint:wf2.text-canonical, type:skill
  status: resolved
```

  no, we just copy, or do symlink, or add project.wye file?

  a file in the folder under .wye hidden folder .wye/plugins?

```yaml
- id: question:install.update-vs-edits
  q: When the shipped version moves on and the person has edited their copy, what does update do?
  context: >
    This is not hypothetical: commit 40e115e changed prompts/librarian-system.md, and all five installed copies of
    skill:refine — including Wye's own — still carry the old rule wording, which is what every librarian session
    follows, because `lib/skills.ts#skillBody` prefers the document over the file. The options are Copier's
    three-way merge, overwrite-with-a-diff-to-review, or Wye's own mechanism: the new version as a change record in
    the Inbox, where every other edit of a typed node already goes. The last is the most Wye-like and the least
    proven — a skill's body is document prose, not a card property, and the change record carries card values.
  about: lib:skills, decision:wf2.hooks-and-skills
  status: resolved
```

  symlink is the answer, or if later we will do version of packages, user will need to update

  replace

```yaml
- id: question:install.where-it-lands
  q: Are the system skills installed once per product, or once per project as they are now?
  context: >
    `layout.tsx` installs into `viewProject` — the project that holds the PRs page, else the first. That is why
    Wye's own skills live in projects/evaluation rather than v2, and why yessensei has two sets, 7 skills in
    inventory and 12 in offline, both defining skill:refine. `wye check` passes: duplicate node ids are not an
    error, and the two lookups disagree about which copy wins (`graph.ts` byId last-wins, `skills.ts#skillBody`
    modules.find first-wins). Whatever the answer, those two existing products need a migration.
  about: lib:skills
  status: resolved
```

  once per project

  project

```yaml
- id: question:install.templates-as-knowledge
  q: >
    Do page templates become blocks or documents in the product — the way skills did — or do they stay files of
    the Wye repository with the picker merely reading them?
  context: >
    "i would like to store templates in the system" is the phrase. Three kinds of template exist: page templates
    (`templates/docs/*.md`, read by lib:doc-create, lib:runs-run, pr-docs, comments, the types routes, with the
    picker's list hardcoded in `lib/templates.ts#TEMPLATES`), block templates (`templates/hooks/*.md`, already
    overridable by a `template:<name>` card — lib/hooks-run.ts#addFromTemplate — the document-first, file-fallback
    shape), and the product tree of task:wf2.definition.template. Making page templates knowledge lets a person add
    their own and edit the PRD skeleton; it also means a template's own `{{title}}` blocks live in a document the
    parser reads as nodes.
  about: lib:templates, type:template, req:wf2.page.new-dialog
  status: resolved
```

  just docs

```yaml
- id: question:install.uninstall-semantics
  q: >
    What does uninstall leave behind — the documents it wrote, the blocks its hooks added, the runs that cite it?
  context: >
    A base skill cannot really be uninstalled today: delete the document and `skillBody` falls back to
    `prompts/*.md`, so the behaviour stays and the next render rewrites the file. A workflow or a hook has no
    fallback and simply stops. Blocks written by a hook carry `by: hook:<slug>` and stay; a run: card cites
    stage ids that would no longer resolve; a session in flight holds the skill's body already. Does uninstall mean
    remove the documents, or retire them (status) so the history still resolves?
  about: lib:skills, lib:hooks-run, lib:runs-run
  status: resolved
```

  symlink removed, and project file cleared

## Problem statement

Wye writes twelve skill documents, the Feature workflow and a hooks page with two active hooks into a project the first time anyone opens its product, without being asked (decision:wf2.hooks-and-skills, decision:wf2.workflow-is-a-skill). The copy is frozen on that day: when Wye changes a shipped prompt, no project follows. Commit 40e115e changed the librarian prompt, and five installed copies still carry the old wording, which every librarian session follows. Deleting a copy brings it back on the next page load, and yessensei holds two sets with the same ids. Page templates are files of the Wye repository behind a fixed list in the New page sheet, so a person can neither see, edit nor add one. The problem belongs to the person who runs a product in Wye: they cannot choose what their projects carry, cannot keep it current and cannot remove it. It is solved when a new project starts empty, a person installs a package into a project and removes it again, every installed project follows the version Wye ships without a manual copy, and the templates are documents a person can open in the app.

## Goals and non-goals

Goals:

- A new project starts empty: no skill, workflow or hook is in it until a person puts it there (decision:install.fresh-project).
- The thing a person installs is a package — a named set of skills, workflows, hooks and templates that travel together (decision:install.package-is-the-unit).
- Install and uninstall are acts a person takes on one project, from the app or the command line (decision:install.per-project).
- An installed project follows the version Wye ships without anyone copying it again (decision:install.linked-not-copied).
- Page templates are documents a person can open in the app, and the New page sheet offers what the system and the project's packages hold, not a fixed list.

Non-goals:

- No remote catalogue, marketplace or download: the packages are what this repository ships (constraint:wf2.local-first).
- No package versions, pinning or three-way merge in this feature. A later version scheme would make update an act the person takes; until then an installed package is always the shipped one.
- No change to how skills, workflows and hooks run once they are in a project: decision:wf2.hooks-and-skills and decision:wf2.workflow-is-a-skill keep their mechanism; only when and by whose choice the documents appear changes.
- No automatic install when a product or project is opened, including for the products already on disk; what happens to those is question:install.existing-products.

## Requirements

One behaviour per node, each observable from outside the product. The ids are dotted paths: `req:install.library.templates` refines `req:install.library`.

### The system library

req:install.library A person sees every package Wye ships, what each one holds and which projects of the product have it installed. #approved (verified-by: [test:install.library-every-package, test:install.library-contents, test:install.library-installed-in, test:install.library-this-product, ui-test:install.library-view])
  - when:install.library a person opens the system library in the app
  - then:install.library each package is listed with its skills, workflows, hooks and templates, and the projects it is installed in
  - [x] task:wye.define-test-cases-for-a-person-3 Define test cases for A person sees every package Wye ships, what each one holds and which projects of the product have it installed (by: hook:req-approved-tests, since: 2026-09-22, part-of: req:install.library, worker: claude-code, session: 38bd32de4d, produced: module:wf2-test)
    - [ ] task:wye.fix-dotted-req-when-then `wye node req:install.library` shows the when/then of req:install.library.templates and its `has` lists the child's when/then instead of its own (when:install.library, then:install.library); the same for req:install.install ← req:install.install.preview. A dotted child requirement's parts attach to the parent. part of goal:exec.work-and-impact

req:install.library.templates Page templates are documents in the system library that a person opens, reads and edits in the app. #approved (verified-by: [test:install.templates-open-as-document, test:install.templates-edit-lands-in-file, test:install.templates-edit-next-page, test:install.templates-graph-clean, ui-test:install.templates-open-edit])
  - when:install.library.templates a person opens a template from the system library
  - then:install.library.templates it reads like any other document, and a change saved to it is what the next page made from that template starts with
  - question:install.template-placeholders A page template carries `{{title}}`, `{{slug}}` and `{{kind}}` placeholders, and the PRD and plan skeletons carry typed blocks whose ids hold them. Once a template is a document the parser reads, are those blocks nodes of the graph (and how do two templates avoid defining the same `module:{{slug}}` under constraint:wf2.one-defining-place), or is a template document read as text only? test:install.templates-graph-clean assumes no placeholder id reaches the graph. #resolved

    ok

  - [x] task:wye.define-test-cases-for-page-templates Define test cases for Page templates are documents in the system library that a person opens, reads and edits in the app. (by: hook:req-approved-tests, since: 2026-09-22, part-of: req:install.library.templates, worker: claude-code, session: c35cb64ed4, produced: module:wf2-test run:feature-1)

req:install.library.new-template A person adds a page template of their own to the system library, and from then on it is offered wherever a template is chosen. #approved (verified-by: [test:install.new-template-offered-next-open, test:install.new-template-every-chooser, test:install.new-template-stays, ui-test:install.new-template-add-and-pick])
  - when:install.library.new-template a person creates a new template in the system library
  - then:install.library.new-template the New page sheet offers it the next time it opens
  - [x] task:wye.define-test-cases-for-a-person-4 Define test cases for A person adds a page template of their own to the system library, and from then on it is offered wherever a te (by: hook:req-approved-tests, since: 2026-09-22, part-of: req:install.library.new-template, worker: claude-code, session: ccc85b8eae, produced: module:wf2-test)

### A new project starts empty

req:install.fresh A new project has no skills, workflows or hooks until a person installs a package into it. #approved (verified-by: [test:install.fresh-new-project-empty, test:install.fresh-open-writes-nothing, test:install.fresh-no-hook-fires, test:install.fresh-other-project-installed, ui-test:install.fresh-empty-in-app])
  - when:install.fresh a person creates a project, or opens a product whose project has nothing installed
  - then:install.fresh the project's Skills folder and Hooks page are empty, and no hook fires on anything done in it
  - unless:install.fresh the project was created from a project template, which brings the packages it names (req:install.fresh.from-template)
  - [x] task:wye.define-test-cases-for-a-new Define test cases for A new project has no skills, workflows or hooks until a person installs a package into it. (by: hook:req-approved-tests, since: 2026-09-22, part-of: req:install.fresh, worker: claude-code, session: f6eb8aebd5, produced: module:wf2-test)

req:install.fresh.from-template A project created from a project template starts with the packages the template names already installed. #approved (verified-by: [test:install.from-template-packages-installed, test:install.from-template-same-as-install, test:install.from-template-pages-in-place, test:install.from-template-hooks-live, test:install.from-template-other-projects, test:install.from-template-no-packages, ui-test:install.from-template-in-app])
  - when:install.fresh.from-template a person creates a project and picks a project template
  - then:install.fresh.from-template the project opens with the template's pages in place and the template's packages listed as installed
  - question:install.project-template What is a project template — where does it live (the system library, a package?), who can add one, and how does it name its pages and its packages? Nothing in the code or the documents defines it yet, and the New project action has no template choice. The tests under req:install.fresh.from-template assume a template in the system library that lists its pages and names its packages. #resolved

    package

  - [x] task:wye.define-test-cases-for-a-project Define test cases for A project created from a project template starts with the packages the template names already installed. (by: hook:req-approved-tests, since: 2026-09-22, part-of: req:install.fresh.from-template, worker: claude-code, session: f14d91c1cd, produced: module:wf2-test run:feature-1)

### Install

req:install.install A person installs a package into one project, and its skills, workflows, hooks and templates appear in that project. #approved (verified-by: [test:install.install-places, test:install.install-workflow-runs, test:install.install-hook-fires, test:install.install-template-offered, test:install.install-already-installed, test:install.install-survives-restart, ui-test:install.install-in-app])
  - when:install.install a person chooses Install on a package for a project
  - then:install.install the package's skills show in the project's Skills folder, its workflows can be run, its hooks show on the Hooks page, and the package shows as installed in that project
  - unless:install.install the package is already installed in that project: the person is told so and nothing changes
  - [x] task:wye.define-test-cases-for-a-person-5 Define test cases for A person installs a package into one project, and its skills, workflows, hooks and templates appear in that pr (by: hook:req-approved-tests, since: 2026-09-22, part-of: req:install.install, worker: claude-code, session: 53d4cb6c85, produced: module:wf2-test)

req:install.install.preview Before a package is installed, the person sees what it will put in the project, and which of its hooks start agent sessions. #approved (verified-by: [test:install.preview-lists-contents, test:install.preview-hooks-agent, test:install.preview-nothing-until-confirm, test:install.preview-matches-install, ui-test:install.preview-in-app])
  - when:install.install.preview a person is about to install a package
  - then:install.install.preview the skills, workflows, templates and hooks it holds are listed, each hook with what it fires on and whether it starts an agent session, and nothing is installed until the person confirms
  - question:install.preview-cli Does the command-line install (req:install.cli) show the same preview and wait for a confirmation, or does it install at once? An agent can run it, and a package's hooks can start agent sessions; if the command installs without a person seeing the preview, req:install.install.preview holds only in the app. The tests under req:install.install.preview check the app's path and the preview call it makes. #resolved

    jsut install

  - [x] task:wye.define-test-cases-for-before-a Define test cases for Before a package is installed, the person sees what it will put in the project, and which of its hooks start a (by: hook:req-approved-tests, since: 2026-09-22, part-of: req:install.install.preview, worker: claude-code, session: 86ef4dee27, produced: module:wf2-test run:feature-1)

req:install.install.other-projects Installing a package in one project changes nothing in the product's other projects. #approved (verified-by: [test:install.other-projects-files, test:install.other-projects-skills-workflows, test:install.other-projects-hooks, test:install.other-projects-templates, test:install.other-projects-same-package, ui-test:install.other-projects-in-app])
  - when:install.install.other-projects a package is installed in one project of a product with several
  - then:install.install.other-projects the other projects' skills, workflows and hooks are as they were
  - [x] task:wye.define-test-cases-for-installing-a Define test cases for Installing a package in one project changes nothing in the product's other projects. (by: hook:req-approved-tests, since: 2026-09-22, part-of: req:install.install.other-projects, worker: claude-code, session: dcee4d375c, produced: module:wf2-test)

### Staying current

req:install.update When Wye's shipped version of a package changes, every project that has it installed follows the new version without anyone acting. #approved (verified-by: [test:install.update-skill, test:install.update-workflow, test:install.update-hook, test:install.update-template, test:install.update-every-project, test:install.update-graph-follows, ui-test:install.update-in-app])
  - when:install.update a skill, workflow, hook or template of an installed package is changed in the system library
  - then:install.update the next agent session, run or new page in any project that has the package installed uses the changed version
  - question:install.update-running-run A workflow run of an installed package is part-way through when the workflow is changed in the system library. Do its remaining stages follow the new version, or does the run finish with the stages it started with (as a running session keeps its instruction under unless:install.uninstall)? The requirement only speaks of the next run. #resolved

    just continue

  - question:install.update-package-contents When a skill, workflow, hook or template is added to or removed from a package in the system library, do projects that have it installed gain or lose it without anyone acting? when:install.update speaks only of a document being changed, and whether a link per document or per package decides the answer. #resolved

    keep open, not important now, can mark as tech dbdt

  - [x] task:wye.define-test-cases-for-when-wye Define test cases for When Wye's shipped version of a package changes, every project that has it installed follows the new version w (by: hook:req-approved-tests, since: 2026-09-22, part-of: req:install.update, worker: claude-code, session: 43fb982ab5, produced: module:wf2-test run:feature-1)

### Uninstall

req:install.uninstall A person uninstalls a package from a project, and what it put there is gone and stays gone. #approved (verified-by: [test:install.uninstall-removes, test:install.uninstall-stays-gone, test:install.uninstall-hooks-stop, test:install.uninstall-running-session, test:install.uninstall-hook-blocks-stay, test:install.uninstall-only-this, ui-test:install.uninstall-in-app])
  - when:install.uninstall a person chooses Uninstall on a package installed in a project
  - then:install.uninstall its skills, workflows, hooks and templates are no longer in the project, the package no longer shows as installed there, and opening the product again does not bring them back
  - unless:install.uninstall a session already running with one of its skills finishes as it started; the blocks its hooks already wrote stay where they are
  - [x] task:wye.define-test-cases-for-a-person-2 Define test cases for A person uninstalls a package from a project, and what it put there is gone and stays gone. (by: hook:req-approved-tests, since: 2026-09-22, part-of: req:install.uninstall, worker: claude-code, session: 8db1295acd, produced: module:wf2-test run:feature-1)

### Choosing a template

req:install.picker The New page sheet offers the templates of the system library and of the packages installed in the project — never a fixed list. #approved (verified-by: [test:install.picker-system-templates, test:install.picker-not-fixed, test:install.picker-package-templates, ui-test:install.picker-choose])
  - when:install.picker a person opens the New page sheet in a project
  - then:install.picker the Template choice lists the system library's page templates and those of the project's installed packages, by name
  - question:install.picker-which-project When the product has several projects and the person changes "Add to" in the sheet to a folder of another project, does the Template choice follow to that project's installed packages, or stay with the project the sheet was opened from? #resolved

    it is per project

  - [x] task:wye.define-test-cases-for-the-new Define test cases for The New page sheet offers the templates of the system library and of the packages installed in the project — n (by: hook:req-approved-tests, since: 2026-09-22, part-of: req:install.picker, worker: claude-code, session: f7be2f7e91, produced: run:feature-1 module:wf2-test)

### From the command line

req:install.cli A person or an agent lists, installs and uninstalls packages from the command line, with the same result as in the app. #approved (verified-by: [test:install.cli-list, test:install.cli-install-parity, test:install.cli-uninstall-parity, test:install.cli-refusals, test:install.cli-one-project, ui-test:install.cli-agent])
  - when:install.cli someone runs the list, install or uninstall command for a project
  - then:install.cli the project ends in the same state the same act in the app would leave, and the list shows what is installed in each project
  - [x] task:wye.define-test-cases-for-a-person Define test cases for A person or an agent lists, installs and uninstalls packages from the command line, with the same result as in (by: hook:req-approved-tests, since: 2026-09-22, part-of: req:install.cli, worker: claude-code, session: 1349081f8d, produced: run:feature-1 module:wf2-test)

## Decisions

The person answered the research's questions under each one. These are those answers written as decisions. When they are approved, the questions they answer can be resolved.

```yaml
- id: decision:install.fresh-project
  title: A new project starts with no skills, workflows or hooks unless it is made from a template
  text: >
    Answers question:install.opt-in-or-opt-out. Installing is opt-in: nothing is written into a project when it is
    opened. A project made from a project template gets the packages that template names. This replaces the
    "written on first open" clause of decision:wf2.hooks-and-skills and decision:wf2.workflow-is-a-skill, but not
    their mechanism.
  date: 2026-09-22
  affects: [decision:wf2.hooks-and-skills, decision:wf2.workflow-is-a-skill, req:install.fresh, req:install.fresh.from-template]
  satisfies: [req:install.fresh]
  by: malapheev
  evidence: the answer under question:install.opt-in-or-opt-out in this document; session:dfb890d304
  status: proposed
- id: decision:install.package-is-the-unit
  title: What a person installs is a package — one name for several skills, workflows, hooks and templates
  text: >
    Answers question:install.unit. A package can hold several documents of any of those kinds. It is installed,
    listed and uninstalled as a whole, so workflow:feature arrives together with its five stage skills.
  date: 2026-09-22
  affects: [req:install.install, req:install.uninstall, req:install.library]
  by: malapheev
  evidence: the answer under question:install.unit in this document; session:dfb890d304
  status: proposed
- id: decision:install.per-project
  title: A package is installed into a project, not into the whole product
  text: >
    Answers question:install.where-it-lands. Each project has its own set of installed packages. The project
    is no longer chosen by whichever one holds the PRs page.
  date: 2026-09-22
  affects: [req:install.install.other-projects, req:install.install]
  satisfies: [req:install.install.other-projects]
  by: malapheev
  evidence: the answer under question:install.where-it-lands in this document; session:dfb890d304
  status: proposed
- id: decision:install.linked-not-copied
  title: An installed package is linked to the system's copy, not copied, so a project follows what Wye ships
  text: >
    Answers question:install.update-vs-edits and the uninstall half of question:install.uninstall-semantics.
    Installing places a symlink to the system library's documents in the project, and the project records
    which packages it holds. Update needs no act: the link always reads the shipped version. Uninstall removes
    the link and clears the record. If packages get versions later, update becomes a step the person takes,
    and that is out of scope here. What happens when someone edits a linked document is
    question:install.edit-linked.
  date: 2026-09-22
  affects: [req:install.update, req:install.uninstall, lib:skills]
  satisfies: [req:install.update]
  by: malapheev
  evidence: the answers under question:install.update-vs-edits and question:install.uninstall-semantics in this document; session:dfb890d304
  status: proposed
- id: decision:install.templates-are-documents
  title: Page templates are documents in the system library, not files behind a fixed list
  text: >
    Answers question:install.templates-as-knowledge ("just docs"). A page template is a document a person can
    open and edit. The New page sheet lists what the system library and the project's installed packages hold.
  date: 2026-09-22
  affects: [req:install.library.templates, req:install.picker, req:wf2.page.new-dialog, lib:templates]
  satisfies: [req:install.library.templates, req:install.picker]
  by: malapheev
  evidence: the answer under question:install.templates-as-knowledge in this document; session:dfb890d304
  status: proposed
```

## Questions the requirements raise

The research's questions above still stand until the person resolves them against the decisions. question:install.record-home stays open because its answer ("copy, or symlink, or a project.wye file?") names options without choosing one. These are the questions the requirements add.

```yaml
- id: question:install.edit-linked
  q: >
    A person edits a skill or template that is linked from the system library. Does that edit change it for every
    project that has the package installed, or does the project get its own copy that stops following Wye?
  context: >
    Under decision:install.linked-not-copied the project's document is the system's document, so an edit in the
    app edits what every project and product reads. decision:wf2.hooks-and-skills made skills documents "so a
    person edits what the agents follow". A project that wants its own version must detach the document, and
    that brings back the frozen copy described in the research.
  about: [decision:install.linked-not-copied, req:install.update, req:install.library.templates]
  status: resolved
```

  for v1 ignore this (add defered question/constraint/debt) just let user edit in place

```yaml
- id: question:install.duplicate-ids
  q: >
    Two projects of the same product install the same package. Its skill and workflow ids would then be defined
    in two places. Which one does the product read, or is a package's id scoped to the project?
  context: >
    decision:install.per-project against constraint:wf2.one-defining-place, which requires every id to be
    defined in exactly one place. yessensei already shows the failure: two copies of skill:refine, and the graph
    (last wins) and skillBody (first wins) disagree about which one runs. Linking removes the drift between the
    copies, but not the second definition.
  about: [decision:install.per-project, constraint:wf2.one-defining-place, req:install.install.other-projects]
  status: resolved
```

  instll is in the project folder

```yaml
- id: question:install.existing-products
  q: >
    The five products on disk already hold copies written on first open, some of them out of date. Do they become
    installed packages, linked to the system's version, or stay as they are until a person uninstalls them?
  context: >
    wye/evaluation, eval-mab/cr, yessensei/inventory and yessensei/offline, zz-import/main. None of those copies
    was edited by a person (see the research), so linking them loses nothing, but it would be an install the
    person did not ask for. Leaving them means they never get the corrected librarian prompt.
  about: [req:install.fresh, decision:install.fresh-project]
  status: resolved
```

  no keep them as is

```yaml
- id: question:install.system-library-home
  q: >
    Where does the system library live, so that a person can open it in the app? Is it a product of its own, a project in every product, or a place outside the products?
  context: >
    req:install.library and req:install.library.templates need it to be visible and editable as documents.
    constraint:wf2.no-custom-pages says it must be a document made of existing blocks, not a page of its own.
    Today the shipped material is in prompts/ and templates/ at the repository root, and the app shows neither.
  about: [req:install.library, constraint:wf2.no-custom-pages]
  status: resolved
```

  ## Answer

  it leaves in the system folder comming with app package, and the installed should leave in the .wye hidden folder in the project folder

  somwhere in the root folder of the app (next to binaries?)

```yaml
- id: question:install.package-definition
  q: >
    What says which documents make up a package — a card listing them, a folder, or a manifest file in the system library?
  context: >
    decision:install.package-is-the-unit makes the package the unit, but nothing defines one today. The
    twelve skills are listed in BASE_SKILLS and the one workflow in BASE_WORKFLOWS, both in lib/skills.ts, and
    templates/docs/hooks.md ships hooks. req:install.library.new-template also needs to say whether a person's
    own template belongs to a package or to the library alone.
  about: [decision:install.package-is-the-unit, req:install.library, req:install.library.new-template]
  status: resolved
```

  ## Answer

  a folder

```yaml
- id: question:install.uninstall-dangling-refs
  q: >
    After a package is uninstalled, the blocks its hooks wrote stay (unless:install.uninstall) but still say
    by: hook:<slug>, and a run: card still cites its workflow's stage ids. Should those references keep resolving
    — so the product's graph check stays green — or is a reference to an uninstalled package's id acceptable?
  context: >
    test:install.uninstall-hook-blocks-stay can check that the blocks stay, but not whether a dangling by: or
    produced: edge is an error. Pages already made from the package's templates raise the same question for their
    template reference. The answer decides whether uninstall must leave a tombstone of the ids behind.
  about: [req:install.uninstall, decision:install.linked-not-copied, test:install.uninstall-hook-blocks-stay]
  status: resolved
```

  acceptable

## Coverage

Every requirement above with what satisfies it, what verifies it and the tasks on it. A gap is a requirement no decision satisfies or no test verifies, and the design stage of a workflow will not advance past one (decision:wf2.traceability-is-the-verb).

<!-- view:req coverage=1 scope=project as=table -->
