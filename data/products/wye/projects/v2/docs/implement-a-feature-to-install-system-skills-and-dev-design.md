---
node: module:implement-a-feature-to-install-system-skills-and-dev-design
title: Implement a feature to install system skills and templates, i would like to store templates in the system, and — dev-design
status: approved
owner: unassigned
last-verified: 2026-09-22
part-of: run:feature-1
---

# Implement a feature to install system skills and templates, i would like to store templates in the system, and — dev-design

## 0. module:implement-a-feature-to-install-system-skills-and-dev-design

```yaml
- id: module:implement-a-feature-to-install-system-skills-and-dev-design
  purpose: >
    The technical design that satisfies the requirements: entities, values, states, operations, pages, rules.
  status: approved
```

## Overview

What exists: twelve skills, workflow:feature and a hooks page are written into one project of every product on the first render (`app/[product]/layout.tsx#ProductLayout` → lib:skills `ensureBaseSkills` / `ensureBaseWorkflows` / `ensureHooksPage`), the page templates are files behind the constant `lib/templates.ts#TEMPLATES`, and `lib/skills.ts#skillBody` falls back to `prompts/*.md`. What changes is only *when, where and by whose choice* those documents appear — how a skill, a workflow or a hook runs once it is in a project stays as decision:wf2.hooks-and-skills and decision:wf2.workflow-is-a-skill say.

**The system library** is a folder that ships with the app — `system/` at the root of the Wye install (`WYE_SYSTEM` overrides it, which is how a test points the app at a scratch copy). It is laid out as a product (decision:install.library-is-a-product): `system/_product.md`, and one project folder per package, `system/projects/<package>/`, whose `docs/` hold the package's skills, workflows, hook documents and page templates as ordinary markdown documents, plus a `package.md` whose frontmatter card says what the package is (entity:install.package). The app lists it as the reserved product `system`, so a person opens it, reads and edits every document in it with the editor they already use — no page of its own (constraint:wf2.no-custom-pages). The library's own main document holds an instances view of the packages; the "installed in" column is computed for the product the person came from (page:install.library).

**Install** (op:install.install) writes one line into the project's record, `projects/<p>/.wye/packages.yaml` (entity:install.record), and makes one directory link, `projects/<p>/.wye/packages/<package>` → `system/projects/<package>/docs` (entity:install.link, decision:install.directory-link). The build walks into those links, so the package's documents become documents *of that project* in the product's graph; the Skills folder, the Hooks entry, the workflow menu and the New page sheet are built from what the project holds and nothing is written when a product or project is opened. **Update** needs no act: the link reads the shipped file, the watcher also watches the system library and rebuilds every product whose record names the package that changed (op:install.follow). **Uninstall** (op:install.uninstall) removes the line and the link; nothing falls back to `prompts/` (decision:install.no-prompts-fallback), so what was removed stays gone.

**Templates** are documents of the system library: each has its own frontmatter (`node: template:<slug>`, a title a person reads, `for:` the kind of page it makes) and the page skeleton as its body (decision:install.template-document). The parser reads a template document as text: it is a document of the graph, its placeholder blocks are not nodes. One resolver, `lib/templates.ts#resolveTemplate`, answers every chooser — the New page sheet, the New document dialog, `wye doc create --template`, a workflow stage's `produces:`, a hook's `add <template>` — from the project's installed packages and the always-offered system packages (decision:install.system-packages). The shipped templates (blank, PRD, dev design, test design, plan, research, run, pr, skill, the hook block template test-card) move from `templates/` into the system package `templates`; `templates/` and the prompt files of the base skills are retired.

**A project template** is a package whose card marks it as one and names the pages to start with and the packages to bring (decision:install.project-template-is-a-package); New project with that template installs them through the same op and instantiates the pages (op:install.create-project).

**Package content is resolved per project** (decision:install.per-project-resolution): when two projects of a product install the same package, the graph holds its ids twice, from two link paths to one real file; a skill, a workflow or a hook is always looked up in the project of the session, document or event that asks. A package's hooks fire only on events in the project they are installed in (decision:install.package-hooks-in-their-project).

**The products on disk** keep their written copies as ordinary documents (question:install.existing-products, answered "keep them as is"): nothing is migrated, nothing is linked for them. Installing a package into a project that already holds a document of the same slug or id is refused (rule:install.no-shadowing), so a copy and a link never define one id in one project.

**Out of scope, recorded:** an edit to a linked document edits the system copy for every project (question:install.edit-linked, answered "let the user edit in place" for v1) — tracked as task:wye.install-edit-linked-debt; versions and pinning (the PRD's non-goals).

## 1. Entities

```yaml
- id: entity:install.system-library
  description: >
    The folder of packages Wye ships, laid out as a product and listed in the app as the reserved product
    `system`. Shared by every product on the machine; edited in place.
  source: packages/web/src/lib/system-library.ts#SYSTEM_ROOT
  fields:
    root: path — `WYE_SYSTEM`, else `<install>/system`
    packages: list of entity:install.package — one per `projects/<slug>/` folder
  satisfies: [req:install.library]
  status: approved
- id: entity:install.package
  description: >
    A folder of the system library (`system/projects/<slug>/`) whose `docs/` hold skills, workflows, hook
    documents and templates; `package.md` carries its card. Installed, listed and uninstalled as a whole.
  source: packages/web/src/lib/system-library.ts#Package
  fields:
    slug: string — the folder name, unique in the library
    title: string
    description: string
    system: boolean — offered in every project without an install (templates only, rule:install.system-package-templates-only)
    project-template: boolean — offered by New project (decision:install.project-template-is-a-package)
    pages: list of string — template slugs instantiated when a project is made from it
    packages: list of string — other packages installed with it when a project is made from it
    contents: computed — its documents grouped by kind (skill, workflow, hook document, template)
  satisfies: [req:install.library, req:install.install, req:install.fresh.from-template]
  status: approved
- id: entity:install.record
  description: >
    What a project has installed: `projects/<p>/.wye/packages.yaml`, in git, one entry per package. The canonical
    fact of an install (decision:install.record-is-canonical).
  source: packages/web/src/lib/install.ts#readRecord
  fields:
    package: string — the package slug
    installed: date
    by: string — the person, or `agent:<name>` from the CLI
  satisfies: [req:install.install, req:install.uninstall, req:install.cli, req:install.library]
  status: approved
- id: entity:install.link
  description: >
    The directory link `projects/<p>/.wye/packages/<package>` → `<system>/projects/<package>/docs`. Derived from
    the record: restored when missing, removed on uninstall. Relative when the product folder is inside the
    install's repository, absolute otherwise.
  source: packages/web/src/lib/install.ts#linkPackage
  fields:
    path: path
    target: path
  satisfies: [req:install.update, req:install.install]
  status: approved
- id: entity:install.template-document
  description: >
    A page or block template as a document of the system library: frontmatter `node: template:<slug>`, `title:`
    (the name the choosers show), `for:` (the kind of page it makes, module by default), and the skeleton as the
    body with `{{title}}`, `{{slug}}`, `{{kind}}`, `{{parent}}`, `{{date}}` placeholders.
  source: packages/web/src/lib/templates.ts#resolveTemplate
  fields:
    slug: string
    title: string
    for: string
    body: markdown
  satisfies: [req:install.library.templates, req:install.library.new-template, req:install.picker]
  status: approved
```

## 2. Value objects and enums

| id | source | values |
|---|---|---|
| value:install.content-kind | packages/web/src/lib/system-library.ts#ContentKind | skill, workflow, hook, template — decided by the document's `node:` kind; `package.md` is the card, not content |
| value:install.refusal | packages/web/src/lib/install.ts#Refusal | already-installed, not-installed, no-such-package, no-such-project, shadowed — the reasons op:install.install and op:install.uninstall refuse, the same words in the app and the CLI (req:install.cli) |

## 3. State machines

```yaml
- id: state:install.package-in-project
  owner: entity:install.record
  states: [absent, installed]
  transitions:
    - absent -> installed : op:install.install (or op:install.create-project for a template's packages)
    - installed -> absent : op:install.uninstall
    - installed -> installed : the link is missing (a fresh clone) — op:install.restore-links rewrites it from the record, the record is unchanged
  satisfies: [req:install.install, req:install.uninstall]
  status: approved
```

A system package (`system: true`) has no state per project: it is offered everywhere and cannot be installed or uninstalled (value:install.refusal `already-installed` / `not-installed`).

## 4. Operations

Every operation is one function in `lib/install.ts` (or `lib/system-library.ts`, `lib/templates.ts`) that the API route and the CLI both call, so the app and the command line cannot differ (req:install.cli). `planned:` names the file an operation will live in; it becomes `source:` when the code lands (the cards check holds every `source:` to an existing file).

```yaml
- id: op:install.library
  args: product?
  does: >
    Lists the packages of the system library, each with its title, its contents by value:install.content-kind, and
    — when a product is given — the projects of that product whose record names it. GET
    /api/system/packages?product=P.
  planned: packages/web/src/lib/system-library.ts#listPackages
  satisfies: [req:install.library]
  status: approved
- id: op:install.list
  args: product, project?
  does: >
    What each project of the product has installed, read from the records. GET /api/[product]/packages; `wye
    packages [--project p] [--json]`.
  planned: packages/web/src/lib/install.ts#listInstalled
  satisfies: [req:install.cli, req:install.library]
  status: approved
- id: op:install.preview
  args: product, project, package
  does: >
    What an install would put in the project, without writing: the skills, workflows and templates by title, and
    each hook with its `on:` event and whether one of its actions starts an agent session (a `session`/`skill`
    action, read with lib:hooks `parseHook`). Refuses as op:install.install would. GET
    /api/[product]/[project]/packages/<pkg>/preview.
  planned: packages/web/src/lib/install.ts#previewInstall
  satisfies: [req:install.install.preview]
  status: approved
- id: op:install.install
  args: product, project, package, by
  does: >
    Refuses (value:install.refusal) when the package does not exist, is a system package, is already in the
    record, or one of its documents would shadow a slug or id the project already defines
    (rule:install.no-shadowing). Otherwise appends the record line, makes the link, rebuilds the product. POST
    /api/[product]/[project]/packages {package}; `wye install <package> --project p` (no confirmation —
    question:install.preview-cli, answered "just install").
  planned: packages/web/src/lib/install.ts#installPackage
  satisfies: [req:install.install, req:install.install.other-projects, req:install.cli]
  status: approved
- id: op:install.uninstall
  args: product, project, package
  does: >
    Refuses when the record does not name the package. Otherwise removes the record line and the link, rebuilds
    the product. Touches no other document: blocks the package's hooks wrote, run cards and sessions in flight
    stay as they are (a running session already holds its instruction). DELETE
    /api/[product]/[project]/packages/<pkg>; `wye uninstall <package> --project p`.
  planned: packages/web/src/lib/install.ts#uninstallPackage
  satisfies: [req:install.uninstall, req:install.cli]
  status: approved
- id: op:install.restore-links
  args: product
  does: >
    For each record line whose link is missing or points elsewhere, rewrites the link; writes nothing else, and
    nothing at all in a project without a record. Runs before a build.
  planned: packages/web/src/lib/install.ts#restoreLinks
  satisfies: [req:install.update, req:install.fresh]
  status: approved
- id: op:install.follow
  args: path changed under the system library
  does: >
    The watcher's second root: a change under `<system>/projects/<pkg>/` rebuilds every product whose records name
    `<pkg>` (and the `system` product itself), so graphs, the Skills folder and the Hooks page follow without a
    restart.
  source: packages/web/src/lib/watch.ts#watchSystemLibrary
  satisfies: [req:install.update]
  status: approved
- id: op:install.templates
  args: product, project
  does: >
    The templates a project may use: those of the system packages and of the project's installed packages, as
    {slug, title, for, package}, by title. GET /api/[product]/[project]/templates — the list the New page sheet
    and the New document dialog are built from.
  source: packages/web/src/lib/templates.ts#listTemplates
  satisfies: [req:install.picker, req:install.library.new-template]
  status: approved
- id: op:install.resolve-template
  args: project, name
  does: >
    One template's body by slug: the project's installed packages first, then the system packages; `unknown
    template` otherwise. Used by lib:doc-create, lib:runs-run, lib:hooks-run `addFromTemplate`, `lib/pr-docs.ts`,
    `lib/comments.ts` and the types routes — the only reader of templates.
  source: packages/web/src/lib/templates.ts#resolveTemplate
  satisfies: [req:install.library.templates, req:install.library.new-template, req:install.update]
  status: approved
- id: op:install.create-project
  args: product, slug, title, template?
  does: >
    Makes the project folder and `_project.md`; with a project-template package, installs it and the packages its
    card names through op:install.install and instantiates its `pages:` through lib:doc-create. Without one,
    writes nothing else. POST /api/[product]/projects; `wye project create`.
  source: packages/web/src/app/api/[product]/projects/route.ts
  planned: packages/web/src/lib/install.ts#createProject
  satisfies: [req:install.fresh, req:install.fresh.from-template]
  status: approved
- id: op:install.project-skill
  args: scope, id, project
  does: >
    A skill's body as the project has it: the skill document defined in that project (its own or through a link),
    else nothing. Replaces `lib/skills.ts#skillBody`'s product-wide lookup and its `prompts/` fallback.
  source: packages/web/src/lib/skills.ts#skillBody
  satisfies: [req:install.uninstall, req:install.update, req:install.install.other-projects]
  status: approved
```

## 5. Pages and actions

No new page (constraint:wf2.no-custom-pages): the library is a document of the `system` product with an instances view; install and uninstall are actions on its rows and in the rail.

```yaml
- id: page:install/library
  route: /system/library/d/library?product=<P>&project=<p>
  component: packages/web/src/components/ViewBlock.tsx
  purpose: >
    The system library's main document: `<!-- view:package -->`, one row per package with its skills, workflows,
    hooks and templates (each a link that opens the document) and the projects of <P> it is installed in. Reached
    from the rail's "System library" link, which carries the product and project the person is in.
  actions:
    - action:install.preview-and-install: Install on a row for the current project — opens the preview, installs on confirm -(calls)-> op:install.preview, op:install.install
    - action:install.uninstall: Uninstall on a row installed in the current project -(calls)-> op:install.uninstall
    - action:install.new-template: + template in the `templates` package — a document from the template `template` -(calls)-> op:install.resolve-template
  satisfies: [req:install.library, req:install.library.templates, req:install.library.new-template, req:install.install, req:install.install.preview, req:install.uninstall]
  status: approved
- id: page:install/rail-project
  route: /<P>/<p>/…
  component: packages/web/src/app/[product]/layout.tsx
  purpose: >
    The rail's Skills folder and Hooks entry list what the project holds — its own skill and hook documents and
    those under its package links — and a Packages line names the installed packages with Uninstall. The layout no
    longer calls ensureBaseSkills, ensureBaseWorkflows or ensureHooksPage.
  actions:
    - action:install.uninstall-from-rail: Uninstall on a package line -(calls)-> op:install.uninstall
  satisfies: [req:install.fresh, req:install.install, req:install.uninstall]
  status: approved
- id: page:install/new-page-sheet
  route: the New page sheet (component:new-page) and the New document dialog
  component: packages/web/src/components/NewPage.tsx
  purpose: >
    Template lists op:install.templates for the project the sheet was opened in
    (question:install.picker-which-project, answered "per project"), by title; `TEMPLATES` is gone. The doc route
    accepts any slug op:install.resolve-template knows.
  actions:
    - action:install.pick-template: pick a template by title -(calls)-> op:install.resolve-template
  satisfies: [req:install.picker, req:install.library.new-template]
  status: approved
- id: page:install/new-project
  route: New project (the command box)
  component: packages/web/src/components/CommandBox.tsx
  purpose: >
    The New project action gets a Template choice listing the project-template packages; none by default.
  actions:
    - action:install.create-project: create the project, from a template or empty -(calls)-> op:install.create-project
  satisfies: [req:install.fresh, req:install.fresh.from-template]
  status: approved
```

## 6. Rules

```yaml
- id: rule:install.open-writes-nothing
  statement: >
    Rendering a product, a project or a document writes no skill, workflow, hook or Skills/Hooks page; the only
    writes outside a person's act are op:install.restore-links for projects whose record names a package.
  source: packages/web/src/app/[product]/layout.tsx#ProductLayout
  guards: req:install.fresh
  status: approved
  requires-tests: [test:install.fresh-open-writes-nothing]
- id: rule:install.no-shadowing
  statement: >
    Install is refused when a document of the package has the slug of a document already in the project, or
    defines an id the project already defines — a copy and a link never define one id in one project.
  source: packages/web/src/lib/install.ts#installPackage
  guards: req:install.install
  status: approved
  requires-tests: [test:install.install-already-installed]
- id: rule:install.content-per-project
  statement: >
    A skill, workflow or hook is looked up in the project of the session, document or event that asks — never
    product-wide — so a package installed in one project is invisible to the others.
  source: packages/web/src/lib/skills.ts#skillBody
  guards: req:install.install.other-projects
  status: approved
  requires-tests: [test:install.other-projects-skills-workflows, test:install.fresh-other-project-installed]
- id: rule:install.package-hooks-local
  statement: >
    A hook defined under a package link fires only on events whose node is a document or block of the same
    project; a hook in a project's own documents keeps the product-wide match it has today.
  source: packages/web/src/lib/hooks-run.ts#fire
  guards: req:install.fresh
  status: approved
  requires-tests: [test:install.fresh-no-hook-fires, test:install.other-projects-hooks]
- id: rule:install.no-prompts-fallback
  statement: >
    A skill id the project does not define has no body: nothing falls back to prompts/*.md or to the system
    library.
  source: packages/web/src/lib/skills.ts#skillBody
  guards: req:install.uninstall
  status: approved
  requires-tests: [test:install.uninstall-stays-gone]
- id: rule:install.write-through-link
  statement: >
    A save of a document under a package link writes the system library's file (the atomic temp file is made in
    the link's real folder), never replaces the link with a copy.
  source: packages/web/src/lib/write.ts#writeAtomic
  guards: req:install.update
  status: approved
  requires-tests: [test:install.templates-edit-lands-in-file]
- id: rule:install.template-is-text
  statement: >
    A document whose node is `template:` is a document of the graph with its title, and nothing in its body is a
    node: no card, prose node, task line or tag in it is parsed, so no `{{…}}` id reaches the graph.
  source: lib/parse.js#parseFiles
  guards: req:install.library.templates
  status: approved
  requires-tests: [test:install.templates-graph-clean]
- id: rule:install.one-template-reader
  statement: >
    Every place that makes a page from a named template reads it through op:install.resolve-template; nothing
    reads `templates/` or keeps a list of template names.
  source: packages/web/src/lib/templates.ts#resolveTemplate
  guards: req:install.library.new-template
  status: approved
  requires-tests: [test:install.new-template-every-chooser, test:install.picker-not-fixed]
- id: rule:install.system-package-templates-only
  statement: >
    A package marked `system: true` holds only templates (and its card); the library refuses to list one that
    holds a skill, workflow or hook, so an always-offered package can never bring behaviour into a fresh project.
  source: packages/web/src/lib/system-library.ts#listPackages
  guards: req:install.fresh
  status: approved
  requires-tests: [test:install.fresh-new-project-empty]
```

## 7. Decisions

Each fork below refines the PRD's decisions (decision:install.fresh-project, decision:install.package-is-the-unit, decision:install.per-project, decision:install.linked-not-copied, decision:install.templates-are-documents) with how it is built; none re-decides them.

```yaml
- id: decision:install.library-is-a-product
  title: >
    The system library is a folder shipped with the app, laid out as a product whose projects are the packages
  text: >
    The person answered question:install.system-library-home with "the system folder coming with the app package"
    and question:install.package-definition with "a folder". We lay `<install>/system/` out like any product folder
    and list it in the app as the reserved product `system`, so every package document opens, reads and saves
    through the paths every document already uses.
  date: 2026-09-22
  affects: [lib:skills, lib:templates, constraint:wf2.no-custom-pages]
  satisfies: [req:install.library, req:install.library.templates, req:install.library.new-template]
  by: agent:claude-code
  evidence: session:5340e4ddaa
  status: approved
```

  - context:install.library-is-a-product The library must be opened and edited as documents (req:install.library.templates) without a page of its own (constraint:wf2.no-custom-pages), be shared by every product (test:install.update-every-project), and stay out of each product's graph (test:install.templates-graph-clean).
  - choice:install.library-is-a-product `system/_product.md` + `system/projects/<package>/{_project.md, docs/}`, root `WYE_SYSTEM` or `<install>/system`, listed by `lib/products.ts#listProducts` as `system`. Its own graph is built at `system/_build/`. The rail's "System library" link opens its main document with `?product=&project=` so the instances view can say where each package is installed in the product the person came from.
  - alternative:install.library-in-every-product A virtual `system` project mounted into every product's scope. The "installed in" column needs no parameter, but every product's graph would carry the library's documents — its skills defined in every project, its templates' placeholder blocks in every check.
  - alternative:install.library-plain-folders Keep `prompts/` and `templates/` as files and read them. Nothing to open in the app; req:install.library.templates fails.
  - consequence:install.library-is-a-product `prompts/*.md` (but the two role contracts, see decision:install.no-prompts-fallback) and `templates/` move into packages; the desktop build copies `system/` next to the app. The slug `system` is reserved for products.

```yaml
- id: decision:install.directory-link
  title: One directory link per installed package, under the project's .wye folder
  text: >
    decision:install.linked-not-copied chose a link; the person put installs in "the .wye hidden folder in the project
    folder". We link the package's whole docs folder once, `projects/<p>/.wye/packages/<pkg>` →
    `<system>/projects/<pkg>/docs`, rather than one link per document.
  date: 2026-09-22
  affects: [decision:install.linked-not-copied, lib:build, lib:watch]
  satisfies: [req:install.update, req:install.install, req:install.uninstall]
  by: agent:claude-code
  evidence: session:5340e4ddaa
  status: approved
```

  - context:install.directory-link A save goes through `lib/write.ts#writeAtomic`: a temp file, then a rename onto the path. Renamed onto a file link, it replaces the link with a copy — the project silently stops following Wye, the freeze the research found.
  - choice:install.directory-link A directory link: the temp file is made inside the link's real folder, so the rename lands on the system file (rule:install.write-through-link). A document added to or removed from a package reaches every project with it, which also settles question:install.update-package-contents. `lib/build.js#findDocs` follows the links under `.wye/packages/`; `lib/doc.ts#docRoute` maps `projects/<p>/.wye/packages/<pkg>/<doc>.md` to project p, document `<doc>`.
  - alternative:install.file-links A link per document in `docs/`. The documents sit where the tree already looks, but each save detaches one, and a package's new document needs a re-install.
  - alternative:install.copy Copy the documents. What exists today; req:install.update fails.
  - consequence:install.directory-link Uninstall is removing one link. The fs watcher does not follow links, so the system library is watched on its own (op:install.follow).

```yaml
- id: decision:install.record-is-canonical
  title: The record in .wye/packages.yaml is what is installed; the link is derived from it
  text: >
    The person answered question:install.record-home with "a file in the folder under .wye". We write one
    `.wye/packages.yaml` per project, in git, and treat the link as a cache of it: a missing link is restored from the
    record, a link without a record line is not an install.
  date: 2026-09-22
  affects: [constraint:wf2.text-canonical, lib:settings]
  satisfies: [req:install.install, req:install.uninstall, req:install.cli, req:install.library]
  by: agent:claude-code
  evidence: session:5340e4ddaa
  status: approved
```

  - context:install.record-is-canonical A link's target is a path on one machine: `<install>/system` differs between a clone, the desktop app and a test's scratch copy, and a product with `root:` lives outside the repository. constraint:wf2.text-canonical wants the fact in text in git.
  - choice:install.record-is-canonical `packages.yaml` lists `{package, installed, by}`; `.wye/packages/` is gitignored and op:install.restore-links rewrites it before a build. Listing and "installed in" read the record, never the folder.
  - alternative:install.link-is-record The link alone says what is installed. Nothing else to keep, but a clone or a moved install loses every install silently, and git would carry machine paths.
  - alternative:install.settings-record `_settings.json` (lib:settings). Machine-local and gitignored: ruled out by the research.
  - consequence:install.record-is-canonical op:install.restore-links is the one write that happens without a person's act, and only in a project that has a record (rule:install.open-writes-nothing).

```yaml
- id: decision:install.per-project-resolution
  title: A package's skills, workflows and hooks are looked up in the project that asks, not product-wide
  text: >
    The person answered question:install.duplicate-ids with "install is in the project folder". Two projects that
    install one package hold its ids twice in the product's graph, through two links to one file. We resolve every
    skill, workflow and hook in the project of the session, document or event that asks, so the two never compete.
  date: 2026-09-22
  affects: [lib:skills, lib:hooks-run, lib:runs-run, constraint:wf2.one-defining-place]
  satisfies: [req:install.install.other-projects, req:install.fresh]
  by: agent:claude-code
  evidence: session:5340e4ddaa
  status: approved
```

  - context:install.per-project-resolution Today `graph.ts` byId is last-wins and `skills.ts#skillBody` first-wins, and yessensei already runs one of two copies of skill:refine by accident. A project without the package must not see its skills at all (test:install.fresh-other-project-installed).
  - choice:install.per-project-resolution op:install.project-skill replaces the product-wide lookup; the workflow menu offers the workflows defined in the document's project; the hook engine matches hooks per project (decision:install.package-hooks-in-their-project). The one defining place of such an id is its system library file; the check treats definitions whose files resolve to one real file as one.
  - alternative:install.scoped-ids Rewrite ids per project (skill:p.refine). One id per place, but every reference in a skill, a workflow's stages and a hook's actions would need rewriting, and a linked file cannot differ per project.
  - alternative:install.one-install-per-product Allow a package in only one project of a product. Simple, but contradicts decision:install.per-project and test:install.uninstall-only-this.
  - consequence:install.per-project-resolution Sessions carry their project (they do: the source link); `wye skill <id>` takes `--project`.

```yaml
- id: decision:install.package-hooks-in-their-project
  title: A package's hooks fire only on what happens in the project they are installed in
  text: >
    Today every hook card in a product fires on events anywhere in it. We scope the hooks under a package link to
    their project and leave the hooks written in a project's own documents as they are.
  date: 2026-09-22
  affects: [lib:hooks-run, lib:hooks, decision:wf2.hooks-and-skills]
  satisfies: [req:install.fresh, req:install.install.other-projects]
  by: agent:claude-code
  evidence: session:5340e4ddaa
  status: approved
```

  - context:install.package-hooks-in-their-project req:install.fresh says no hook fires on anything done in a project with nothing installed, even when a sibling project has the package. Wye's own hooks live in projects/evaluation and fire on v2's requirements today; the products on disk are to stay as they are (question:install.existing-products).
  - choice:install.package-hooks-in-their-project `lib/hooks-run.ts#fire` filters a hook defined under `.wye/packages/` to events whose node's file is in the same project (rule:install.package-hooks-local). A hook in a project's own documents keeps the product-wide match.
  - alternative:install.all-hooks-local Scope every hook to its project. One rule, but Wye's own hooks stop firing on v2 the day it ships.
  - consequence:install.package-hooks-in-their-project Two kinds of hook scope exist until the products on disk are moved to packages; task:wye.install-hook-scope-unify tracks that.

```yaml
- id: decision:install.template-document
  title: >
    A template is a document with its own frontmatter and the page skeleton as its body, read by the parser as
    text
  text: >
    Today a template file's frontmatter is the new page's frontmatter, full of placeholders (`node: {{kind}}:{{slug}}`),
    which can neither be parsed as a document nor give the chooser a name. We give each template its own card and let
    the new page's frontmatter be written by `lib/templates.ts#instantiate` from the type. This answers
    question:install.template-placeholders (resolved "ok"): placeholder blocks are not nodes.
  date: 2026-09-22
  affects: [lib:templates, lib:doc-create, lib:parse, type:template]
  satisfies: [req:install.library.templates, req:install.picker]
  by: agent:claude-code
  evidence: session:5340e4ddaa
  status: approved
```

  - context:install.template-document The shipped page templates share one frontmatter shape (node, title, status, owner, last-verified, part-of); the PRD and plan skeletons carry cards with `{{slug}}` ids. test:install.templates-graph-clean wants no placeholder id in a graph; test:install.picker-system-templates wants each template listed under its document's title.
  - choice:install.template-document `node: template:<slug>`, `title:`, `for:` (the page kind); the body is the skeleton. The parser keeps the document node and title and parses nothing in the body (rule:install.template-is-text). The existing type:template — a hook's block template — is the same kind, so `add test-card` and New page read one namespace through op:install.resolve-template.
  - alternative:install.template-frontmatter-kept Keep the placeholder frontmatter and exclude template files from the graph. No title to list, and the editor could not open them as documents.
  - alternative:install.template-blocks-as-nodes Parse the skeleton's blocks as nodes. Two templates would define `module:{{slug}}` twice (constraint:wf2.one-defining-place).
  - consequence:install.template-document The six shipped page templates are rewritten once into this shape; a template needing extra frontmatter keys writes them as `frontmatter:` lines on its card.

```yaml
- id: decision:install.system-packages
  title: The library's own templates are a system package, offered in every project without an install
  text: >
    The person answered question:install.opt-in-or-opt-out with "only when installed, unless it is marked a system
    package". We mark a package `system: true` to have it offered everywhere, and allow only templates in one, so a
    fresh project still carries no behaviour.
  date: 2026-09-22
  affects: [decision:install.fresh-project, lib:templates]
  satisfies: [req:install.picker, req:install.library.new-template, req:install.fresh]
  by: agent:claude-code
  evidence: session:5340e4ddaa
  status: approved
```

  - context:install.system-packages req:install.picker lists "the templates of the system library and of the packages installed in the project"; req:install.library.new-template needs a home for a person's own template that every project offers.
  - choice:install.system-packages The package `templates` (`system: true`) holds blank, PRD, dev design, test design, plan, research, run, pr, skill and the block template test-card; a person's new template is a document added to it. rule:install.system-package-templates-only keeps skills, workflows and hooks out of a system package.
  - alternative:install.loose-templates Templates at the library's top level, outside any package. A second kind of place to read from, and the library view would need a row that is not a package.
  - alternative:install.system-behaviour Let a system package carry skills and hooks too. Contradicts req:install.fresh.
  - consequence:install.system-packages The shipped behaviour is split into installable packages: `core` (refine, build, define-tests, analyse-request), `import` (import, import-code, describe-module), `feature` (research, prd, tech-design, test-design, plan, workflow:feature and the hook that defines tests on an approved requirement). The split is task:wye.install-package-split.

```yaml
- id: decision:install.project-template-is-a-package
  title: A project template is a package that names the pages to start with and the packages to bring
  text: >
    The person answered question:install.project-template with "package". A package whose card says
    `project-template: true` is offered by New project; its `pages:` are instantiated from its templates and its
    `packages:` are installed with it through op:install.install.
  date: 2026-09-22
  affects: [task:wf2.definition.template]
  satisfies: [req:install.fresh.from-template]
  by: agent:claude-code
  evidence: session:5340e4ddaa
  status: approved
```

  - context:install.project-template-is-a-package The New project action has no template choice, and task:wf2.definition.template plans a product-shaped tree with no installer.
  - choice:install.project-template-is-a-package op:install.create-project installs the template package itself (so its templates are offered) and the ones it names, then makes its pages. The layered tree of task:wf2.definition.template becomes such a package.
  - alternative:install.project-template-folder A separate `system/project-templates/` of folders copied whole. A second mechanism beside packages, and a copy that freezes.
  - consequence:install.project-template-is-a-package The pages it makes are the project's own documents (copied once, as any new page); only its skills, workflows, hooks and templates stay linked.

```yaml
- id: decision:install.no-prompts-fallback
  title: A skill a project does not hold has no body; the two role contracts are read from the system library
  text: >
    `lib/skills.ts#skillBody` falls back to `prompts/*.md` when no document defines a skill, so an uninstalled skill
    keeps working and deleting one changes nothing. We drop that fallback. The host's role contracts —
    `prompts/agent-system.md` and `prompts/librarian-system.md`, which `lib/agent-prompt.ts` sends to every agent —
    are not skills a project installs: they move to the `core` package's skill-build and skill-refine documents, and
    agent-prompt reads the project's installed instance when there is one, else that system library file.
  date: 2026-09-22
  affects: [lib:skills, decision:wf2.hooks-and-skills]
  satisfies: [req:install.uninstall, req:install.fresh, req:install.update]
  by: agent:claude-code
  evidence: session:5340e4ddaa
  status: approved
```

  - context:install.no-prompts-fallback test:install.uninstall-stays-gone asks that a skill of an uninstalled package get no body, "neither from the system library nor from the built-in fallback in prompts/". But every agent session needs its role contract, installed or not.
  - choice:install.no-prompts-fallback Skills: no fallback (rule:install.no-prompts-fallback). Role contracts: one file each, in the system library; a project with `core` installed reads it through its link — the same file, so no copy drifts again.
  - alternative:install.keep-fallback Keep `prompts/` as the fallback for skills. Uninstall would not remove the behaviour; req:install.uninstall fails.
  - alternative:install.contracts-in-prompts Keep the contracts in `prompts/` and the skill documents separately. Two copies of the librarian's text — the drift of commit 40e115e again.
  - consequence:install.no-prompts-fallback `prompts/` is retired; the CLI's "open the product in the app once" message for an empty skill list becomes "install a package: wye install <package> --project <p>".

## 8. Questions

```yaml
- id: question:install.desktop-library-writable
  q: >
    In the desktop app the system library sits inside the signed, read-only app bundle. Where does an edit to a
    library document — or a person's new template — go there, and does it survive an app update?
  context: >
    decision:install.library-is-a-product puts the library "next to the binaries" as answered under
    question:install.system-library-home, and req:install.library.templates and req:install.library.new-template
    need it editable. A copy into the user's folder on first run brings back the freeze on the next app update; an
    overlay (the user's folder first, then the bundle) keeps updates but makes "the shipped version" two places.
    In a clone of the repository `system/` is writable and neither applies.
  about: [decision:install.library-is-a-product, req:install.library.templates, req:install.library.new-template]
  status: open
```
