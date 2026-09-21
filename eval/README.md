# eval/ — the benchmarks harness

The contract is the Benchmarks page of the Evaluation project (`data/products/wye/projects/evaluation/docs/benchmarks.md`,
module:benchmarks); this folder is its code (lib:eval). `wye eval …` runs it; `test/eval.js` replays it in CI.

    wye eval own [--suite packet|currency|contradictions|impact|consolidation|all] [--live] [--build-truth] [--baseline "<why>"]
    wye eval compare --request "<text>" [--ref id ...] [--plan id] --agent claude-code --runs 5 [--model m] [--parallel 3]
    wye eval compare --pair <id> --mark <arm>-<n>=<1-5> ... | --rescore | --resume
    wye eval public moosedev --fetch | --import | --run [--live] [--judge-passes 3] | --report
    wye eval public reqpairs --fetch | --run --set worldvista [--sample 500] [--live] | --report
    wye eval public memoryagentbench --fetch | --run --competency cr [--set factconsolidation_sh_6k] [--live] | --report
    wye eval judge --sample 50 | --agreement [--live]
    wye eval report [--suite s] [--since date]
    wye eval cards

Live (`--live` or `WATERFALL_LIVE=1`) asks the app (WF_URL) and the model and records the answers under `recorded/`;
without it every suite replays the recordings and fails on a missing one. Results go to
`data/products/<product>/_build/eval/<date>-<suite>.json` and, as cards, to the Evaluation project's `runs.md`.
Downloaded corpora live under `public/<adapter>/data/` and are never committed; `own/truth-*.json` is rebuilt per graph sha.
