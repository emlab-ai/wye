---
node: module:implement-a-feature-to-install-system-skills-and-test-design
title: Implement a feature to install system skills and templates, i would like to store templates in the system, and — test-design
status: proposed
owner: unassigned
last-verified: 2026-09-22
part-of: run:feature-1
---

# Implement a feature to install system skills and templates, i would like to store templates in the system, and — test-design

## 0. module:implement-a-feature-to-install-system-skills-and-test-design

```yaml
id: module:implement-a-feature-to-install-system-skills-and-test-design
purpose: >
  The verification plan: test nodes per area, their cases, and what stays untested.
```

## 9. Verification index

One test file per area of the PRD — `planned:` until the file exists, then `file:` — (module:implement-a-feature-to-install-system-skills-and-templates-i). Each card names the file it will live in, what it proves, and its cases one line each. The cases are the per-requirement checks already written in module:wf2-test (test-design.md, sections "The system library" to "Install from the command line"), which give each case its steps; a case without an id there is one this pass adds. Every requirement of the PRD is verified by at least one card below, and every rule of the dev design (module:implement-a-feature-to-install-system-skills-and-dev-design) by the card whose file exercises its `source:`. All run against a scratch product and a scratch copy of the system library pointed at with `WYE_SYSTEM`, never Wye's own data.

```yaml
- id: test:install.system-library-file
  title: The system library lists every package, what it holds, and where it is installed
  planned: packages/web/src/lib/system-library.test.ts
  description: >
    op:install.library and op:install.list against a scratch library with packages A, B, C and a scratch product with
    projects p1, p2, p3: the list matches the library's folders, the contents match each package's documents, the
    "installed in" column matches each project's record and only for the product asked about.
  verifies: [req:install.library, rule:install.system-package-templates-only]
  cases:
    - every-package: test:install.library-every-package — every folder of the library is one row, no more
    - contents: test:install.library-contents — each row's skills, workflows, hooks and templates equal the package's documents
    - installed-in: test:install.library-installed-in — "installed in" names exactly the projects whose record names the package
    - this-product: test:install.library-this-product — another product's installs never show
    - system-package-behaviour-refused: a `system: true` package holding a skill is not listed (rule:install.system-package-templates-only)
  count: 5
  status: proposed
- id: test:install.templates-file
  title: Page templates are documents — opened, edited and added in the library, and read by every chooser through one resolver
  file: packages/web/src/lib/templates.test.ts
  description: >
    Rewrites today's templates.test.ts (which asserts the fixed TEMPLATES list). op:install.resolve-template and
    op:install.templates against a scratch library: a template opens through the document read, an edit saves into
    its own file, the next page starts from the edit, a person's new template is offered by every chooser, and no
    reader of `templates/` is left.
  verifies: [req:install.library.templates, req:install.library.new-template, rule:install.write-through-link, rule:install.one-template-reader]
  cases:
    - open-as-document: test:install.templates-open-as-document — the document read returns the template like any document
    - edit-lands-in-file: test:install.templates-edit-lands-in-file — a save writes the library's file, the link stays a link
    - edit-next-page: test:install.templates-edit-next-page — the next page made from it carries the edit
    - new-offered-next-open: test:install.new-template-offered-next-open — a new template is in the list on the next open, no restart
    - every-chooser: test:install.new-template-every-chooser — New page, New document, `wye doc create --template`, a stage's produces and a hook's add all resolve it
    - new-stays: test:install.new-template-stays — it survives a restart and a rebuild
    - no-templates-folder-reader: a grep over packages/web/src and lib/ finds no read of `templates/docs` and no list of template names (rule:install.one-template-reader)
  count: 7
  status: proposed
- id: test:install.picker-file
  title: The New page sheet offers the library's templates and the project's installed packages' templates, never a fixed list
  file: packages/web/src/lib/templates.test.ts
  description: >
    op:install.templates for a project: the system package's templates by title, plus those of the project's
    installed packages, following the project the sheet was opened in (question:install.picker-which-project,
    answered "per project").
  verifies: [req:install.picker]
  cases:
    - system-templates: test:install.picker-system-templates — every template of the system package is listed by its title
    - not-fixed: test:install.picker-not-fixed — adding or removing a library template changes the list with no code change
    - package-templates: test:install.picker-package-templates — a template of a package installed in p shows for p and not for q
  count: 3
  status: proposed
- id: test:install.template-doc-parse
  title: A template document is text to the parser — its placeholder ids never reach a graph
  planned: test/template-doc.js
  description: >
    lib/parse.js over a scratch library holding the PRD and plan skeletons: the template document is a node with its
    title, and no card, prose node, task line or tag in its body is parsed; `wye check` of a product with the
    package installed has no `{{slug}}` id and no duplicate module id.
  verifies: [req:install.library.templates, rule:install.template-is-text]
  cases:
    - graph-clean: test:install.templates-graph-clean — no `{{…}}` id in the graph of the library or of a product that installs it
    - two-skeletons-one-graph: two templates both holding `module:{{slug}}` give no duplicate-id error
  count: 2
  status: proposed
- id: test:install.fresh-file
  title: A new project is empty and opening a product writes nothing; a project made from a project template starts with its packages
  planned: packages/web/src/lib/install-fresh.test.ts
  description: >
    The render path of `app/[product]/layout.tsx#ProductLayout` and op:install.create-project against a scratch
    product with its own library. Fails today: ensureBaseSkills, ensureBaseWorkflows and ensureHooksPage write on
    every open, and skills.test.ts asserts they do.
  verifies: [req:install.fresh, req:install.fresh.from-template, rule:install.open-writes-nothing, rule:install.package-hooks-local]
  cases:
    - new-project-empty: test:install.fresh-new-project-empty — Skills folder and Hooks page of a new project are empty
    - open-writes-nothing: test:install.fresh-open-writes-nothing — opening the product and every page leaves `git status` clean
    - no-hook-fires: test:install.fresh-no-hook-fires — approving a requirement in an empty project records no firing
    - other-project-installed: test:install.fresh-other-project-installed — a sibling project's package is invisible here
    - existing-copies-untouched: a product holding copies written on first open (a fixture like yessensei/inventory) is byte-for-byte unchanged by an open (question:install.existing-products)
    - from-template-packages: test:install.from-template-packages-installed — the template's packages are in the record
    - from-template-same-as-install: test:install.from-template-same-as-install — the project equals one made empty and then installed by hand
    - from-template-pages: test:install.from-template-pages-in-place — the template's pages are in place
    - from-template-hooks-live: test:install.from-template-hooks-live — its hooks fire in the new project
    - from-template-other-projects: test:install.from-template-other-projects — the other projects are unchanged
    - from-template-no-packages: test:install.from-template-no-packages — a template naming no package gives an empty project
  count: 11
  status: proposed
- id: test:install.install-file
  title: Install puts a whole package in one project, shows what it will put there first, and touches no other project
  planned: packages/web/src/lib/install.test.ts
  description: >
    op:install.preview, op:install.install and op:install.restore-links against a scratch product with projects p, q
    (B installed) and r, and package A (two skills, a workflow, a page template, a session hook h1, a notify hook h2).
    Workflow and hook cases use a recorded agent so no model runs.
  verifies: [req:install.install, req:install.install.preview, req:install.install.other-projects, rule:install.no-shadowing, rule:install.content-per-project]
  cases:
    - places: test:install.install-places — the record names A and each of its ids is defined once in p
    - workflow-runs: test:install.install-workflow-runs — A's workflow starts a run on a document of p
    - hook-fires: test:install.install-hook-fires — A's hook fires once on an approval in p
    - template-offered: test:install.install-template-offered — A's template is offered for p and a page starts from it
    - already-installed: test:install.install-already-installed — a second install is refused with a sentence and changes nothing
    - survives-restart: test:install.install-survives-restart — record, links and hook firing survive a restart
    - no-shadowing: a project holding its own skill-refine.md refuses a package holding skill:refine, and writes nothing (rule:install.no-shadowing)
    - restore-links: delete `.wye/packages/` (a fresh clone) and build — the links come back from the record, the record is unchanged
    - preview-lists: test:install.preview-lists-contents — the preview lists every document A holds and nothing else
    - preview-hooks-agent: test:install.preview-hooks-agent — h1 is marked as starting an agent session, h2 is not, each with its event
    - preview-writes-nothing: test:install.preview-nothing-until-confirm — the preview leaves the project unchanged
    - preview-matches: test:install.preview-matches-install — what the preview listed is what the install placed
    - other-files: test:install.other-projects-files — q and r are byte-for-byte unchanged
    - other-skills-workflows: test:install.other-projects-skills-workflows — `wye skills` for r lists none of A's
    - other-hooks: test:install.other-projects-hooks — an approval in r fires nothing of A's; in q only B's
    - other-templates: test:install.other-projects-templates — r's New page sheet does not offer A's template
    - same-package-two-projects: test:install.other-projects-same-package — A in p and in r: each resolves its own, uninstall from one leaves the other
  count: 17
  status: proposed
- id: test:install.update-file
  title: A change to a package in the library reaches every project that has it, with no act
  planned: packages/web/src/lib/install-update.test.ts
  description: >
    With the server running: change a document of A in the scratch library, then read through project p of P and r of
    R (both with A) and q of P (without). Nothing is run, restarted or touched in the projects.
  verifies: [req:install.update, rule:install.write-through-link]
  cases:
    - skill: test:install.update-skill — the next session's brief is the changed skill body
    - workflow: test:install.update-workflow — the next run uses the changed stages
    - hook: test:install.update-hook — the next firing follows the changed hook
    - template: test:install.update-template — the next page starts from the changed template
    - every-project: test:install.update-every-project — p and r follow, q stays without it
    - graph-follows: test:install.update-graph-follows — the products' graphs show the changed text after the watcher's rebuild
    - running-run-continues: a run part-way through when its workflow changes finishes its remaining stages without error (question:install.update-running-run, answered "just continue")
  count: 7
  status: proposed
- id: test:install.uninstall-file
  title: Uninstall removes what a package put in a project for good, and leaves what already happened alone
  planned: packages/web/src/lib/install.test.ts
  description: >
    op:install.uninstall on project p with A installed: the link and the record entry go, no fallback brings a skill
    back, a session already running finishes, the blocks A's hook wrote stay. The system library is untouched.
  verifies: [req:install.uninstall, rule:install.no-prompts-fallback]
  cases:
    - removes: test:install.uninstall-removes — A's skills, workflow, hook and template are gone from p and from its record
    - stays-gone: test:install.uninstall-stays-gone — reopening, restarting and rebuilding bring nothing back; `wye skill` of A's skill has no body (rule:install.no-prompts-fallback)
    - hooks-stop: test:install.uninstall-hooks-stop — an approval in p fires nothing of A's
    - running-session: test:install.uninstall-running-session — a session started with A's skill finishes as it started
    - hook-blocks-stay: test:install.uninstall-hook-blocks-stay — blocks written by A's hook stay; their `by: hook:` edges may dangle (question:install.uninstall-dangling-refs, answered "acceptable")
    - only-this: test:install.uninstall-only-this — A in another project stays installed there
    - library-untouched: the system library's files are byte-for-byte what they were
  count: 7
  status: proposed
- id: test:install.cli-file
  title: The install commands leave a project in the state the app would, and list what each project has
  planned: test/install-cli.js
  description: >
    `wye packages`, `wye install`, `wye uninstall` from bin/wye.js against a running scratch server, compared with the
    same act through the API routes the app calls. No confirmation step (question:install.preview-cli, answered
    "just install").
  verifies: [req:install.cli]
  cases:
    - list: test:install.cli-list — lists every project with its installed packages, and `--json` the same data
    - install-parity: test:install.cli-install-parity — the project after `wye install` equals the project after Install in the app
    - uninstall-parity: test:install.cli-uninstall-parity — the same for uninstall
    - refusals: test:install.cli-refusals — unknown package, already installed, not installed, system package: a sentence and a non-zero exit, nothing written
    - one-project: test:install.cli-one-project — `--project p` touches p only
  count: 5
  status: proposed
- id: ui-test:install.in-app-pass
  title: A person installs, previews, uses, follows and uninstalls a package, and picks and adds templates, in the app
  file: (by hand with playwright-core against the dev server — not written yet; task:ui-tests-in-ci)
  description: >
    One pass in the browser over a scratch product, the per-requirement ui-tests in order; each is a step a person
    takes and checks on screen, without a reload unless the step says so.
  verifies: [req:install.library, req:install.library.templates, req:install.library.new-template, req:install.fresh, req:install.fresh.from-template, req:install.install, req:install.install.preview, req:install.install.other-projects, req:install.update, req:install.uninstall, req:install.picker, req:install.cli]
  cases:
    - library-view: ui-test:install.library-view — the library document shows every package, its contents and where it is installed
    - fresh-empty: ui-test:install.fresh-empty-in-app — a new project shows an empty Skills folder and Hooks page
    - from-template: ui-test:install.from-template-in-app — New project from a template opens with its pages and packages
    - preview: ui-test:install.preview-in-app — Install shows the preview, Cancel leaves the project as it was
    - install: ui-test:install.install-in-app — Install and confirm; everything appears without a reload
    - other-projects: ui-test:install.other-projects-in-app — the other projects' rails are as they were
    - templates-open-edit: ui-test:install.templates-open-edit — open a template in the library, edit it, make a page from it
    - new-template: ui-test:install.new-template-add-and-pick — add a template, pick it in the New page sheet
    - picker: ui-test:install.picker-choose — the Template choice lists the library's and the package's templates
    - update: ui-test:install.update-in-app — an edit in the library shows in the project's skill
    - uninstall: ui-test:install.uninstall-in-app — Uninstall; everything goes and stays gone after a reload
    - cli-agent: ui-test:install.cli-agent — an agent's `wye install` shows up in the open app
  count: 12
  status: proposed
```

### Untested surfaces

What this design does not check, so the person can decide whether to advance:

- **The desktop app's read-only library.** Every case runs against a writable scratch library (`WYE_SYSTEM`). Where an edit or a new template goes when the library is inside a signed app bundle, and whether it survives an app update, is undecided (question:install.desktop-library-writable); no case can be written until it is answered.
- **Symlinks outside macOS.** decision:install.linked-not-copied relies on directory links; nothing here runs on Windows or on a filesystem without symlinks, and nothing checks what git does if a link is committed by mistake instead of being ignored.
- **An edit through a linked document changes it for every product.** v1 lets the person edit in place (question:install.edit-linked); the cases only check the edit lands in the library's file, not that anyone is told it reaches other projects. The debt is task:wye.install-edit-linked-debt.
- **Adding or removing a document in a package.** The dev design's directory link makes it reach every installed project, but question:install.update-package-contents was left open on purpose; no case asserts either way.
- **Dangling references after uninstall.** `by: hook:<slug>`, a run's stage ids and a page's template reference to an uninstalled package are accepted (question:install.uninstall-dangling-refs); no case checks how the app shows them.
- **The split of today's shipped material into packages** (`core`, `import`, `feature`, `templates` — task:wye.install-package-split). The cases use scratch packages A, B, C; that the real packages hold the right documents and that workflow:feature still runs end to end from the `feature` package is checked by the eval harness, not here.
- **Concurrency.** Two installs, or an install and an uninstall, of the same project at once; a save to a library document while a build follows the links.
- **The existing tests this breaks.** skills.test.ts and templates.test.ts assert the base-skills installer and the fixed list; they are rewritten under test:install.fresh-file and test:install.templates-file, and nothing else is assumed to hold them.
- **The preview on the command line.** It installs at once (question:install.preview-cli); req:install.install.preview holds only in the app.
