---
name: wf-restore
description: Restore and continue a Waterfall agent session by id — /wf-restore <session-id> [--product <p>]. Loads the session's instruction, referenced context, log and result, then continues the work from where the previous agent stopped, logging progress back to the same session.
---

# /wf-restore <session-id>

Pick up a Waterfall session in this conversation (transfer of work from another agent or a runner).

1. Load it: `wf session show <id> --product <p> --full` (`WF_PRODUCT` or `--product`; if unknown, try
   `wf session list --product <p> --all` for each product under `data/products/`).
2. Read every ref and the source link it names: `wf resolve <link|id>` for each; read the documents they point at.
3. If the session continues another (`continues <id>`), show that one too: `wf session show <parent> --full`.
4. Tell the human in two lines what the session asked for and where it stopped, then continue the work here.
5. Take it: `wf session take <id> --product <p>` (marks it running under you, so no runner also starts it).
6. As you work: `wf session log <id> --product <p> "<line>"` for progress; when finished
   `wf session done <id> --product <p> "<result>"` (or `fail`).

Use the waterfall-agent skill for how to read and write the product's documents.
