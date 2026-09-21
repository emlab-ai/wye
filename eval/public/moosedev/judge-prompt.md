# MOOSEDev's judge prompt — vendored unchanged

From github.com/Trivyn/moosedev `bench/regrade_judge.py` (`_covered_chunk`), Apache-2.0. Run there on `openai/gpt-5.4-mini`
at temperature 0 with `response_format json_object`, expected items chunked 120 per call, three logged passes, mean.
Here it runs on the judge model of this repo (lib/judge.js) and the report says so. `{known}` is the numbered list of
expected titles, `{answer}` the system's answer. Everything after the rule is the prompt.

---
You are grading RECALL: which KNOWN ITEMS does the system ANSWER actually cover?

KNOWN ITEMS:
{known}

SYSTEM ANSWER:
{answer}

Return ONLY a JSON object {"covered": [numbers]} listing the KNOWN ITEM numbers the ANSWER genuinely asserts or lists (it may use different wording, IRIs, a table, or an 'old -> new' form). Be STRICT: include a number only if the answer states THAT specific item, not merely a related topic.
