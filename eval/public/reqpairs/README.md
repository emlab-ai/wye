# Requirement pairs — the verdict judge alone

Source: WorldVista (10 878 pairs), UAV (6 670), PURE, OpenCOSS (6 786, 10 conflicts) — labelled conflict / neutral,
from Malik et al., *Transfer learning for conflict and duplicate detection in software requirement pairs*
(arxiv.org/abs/2301.03709), who took them from Malik, Cevik, Başar and Parikh's S3CDA paper (CASCON 2025) with
synthetic conflicts crafted after INCOSE guidelines; duplicate labels from PassionNet (arxiv.org/abs/2412.01657).
Published macro-F1 (fine-tuned transformers): WorldVista 0.908, PURE 0.948, UAV 0.877.

The sets are not at a URL this loader can fetch (the papers' repositories were not public when this was written —
question:memory.reqpairs-source). Obtain them from the authors and put each set at `data/<set>.csv` with the columns
`req_a, req_b, label`; `data/` is never committed. `fixture.csv` is a ten-pair synthetic file that proves the pipeline in
`test/eval.js`; its numbers are not a benchmark.

    wye eval public reqpairs --fetch                       # what is there, what is missing
    wye eval public reqpairs --run --set worldvista --sample 500 --live
    wye eval public reqpairs --report
