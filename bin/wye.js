#!/usr/bin/env node
'use strict';
// `wye` — the agent's door into Wye. The command was `wf` until 2026-09-20 (decision:wf2.cli-is-wye); `wf` stays an
// alias while old prompts and skills mention it. The code is bin/wf.js.
process.argv[1] = __filename;
require('./wf.js');
