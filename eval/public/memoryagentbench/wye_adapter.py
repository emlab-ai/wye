"""Wye as a memory method for MemoryAgentBench (module:benchmarks, task:memory.eval-mab-adapter).

The repo's adapter interface (see methods/agentmemory.py): `initialize_<name>_agent(agent, agent_config)` and
`handle_<name>_agent(agent, message, memorizing, query_id, context_id)`. Copy this file to methods/wye.py in a
MemoryAgentBench checkout, register it the way agentmemory is registered in agent.py, and run the
Conflict_Resolution configs. It drives the same two operations the standalone runner
(eval/public/memoryagentbench/index.js) runs:

  add    every injected fact becomes a prose node `fact:<n> … (since: <n>)` in a scratch product; write-time
         adjudication through Wye's judge — a later fact that contradicts an earlier one about the same subject
         supersedes it (decision:memory.bitemporal, decision:memory.write-time-verdict)
  query  the hits of the app's search (`wf context`, currency filter on: superseded facts are hidden) feed the
         reader exactly as the other RAG methods' retrieved chunks do

The whole `add` runs at flush, in one pass, because MemoryAgentBench injects the corpus before the first query
("inject once, query multiple times") and the judge batches ten pairs per call. Requires: the Wye repo (WYE_ROOT),
node, the Wye app running (WF_URL, default http://localhost:3456).
"""
import json
import os
import subprocess
import time

WYE_ROOT = os.environ.get("WYE_ROOT", os.path.expanduser("~/Projects/waterfall"))
WF_URL = os.environ.get("WF_URL", "http://localhost:3456")
PRODUCT = "eval-mab"


def _node(script, *args):
    return subprocess.run(["node", "-e", script, *args], cwd=WYE_ROOT, capture_output=True, text=True, check=True, env={**os.environ, "WF_URL": WF_URL}).stdout


class WyeMemory:
    def __init__(self, sub_dataset):
        self.sub_dataset = sub_dataset
        self.chunks = []
        self.flushed = False
        self.stats = {}

    def add(self, text):
        self.chunks.append(text)

    def flush(self):
        """Parse the numbered facts of the injected context, write them as nodes, adjudicate. Idempotent."""
        if self.flushed:
            return self.stats
        context = "".join(self.chunks)
        facts = [l.split(". ", 1)[1].strip() for l in context.split("\n") if l[:1].isdigit() and ". " in l]
        script = """
const a = require('./eval/public/memoryagentbench');
const judge = require('./lib/judge');
const { Recording } = require('./eval/lib/record');
(async () => {
  const set = { source: process.argv[1], facts: JSON.parse(require('fs').readFileSync(0, 'utf8')) };
  const rec = new Recording('public-memoryagentbench', { live: true });
  const r = await a.__addFacts(set, { live: true, model: judge.DEFAULT_MODEL, log: () => {}, rec });
  rec.save(); console.log(JSON.stringify(r));
})().catch(e => { console.error(e); process.exit(1); });
"""
        out = subprocess.run(["node", "-e", script, self.sub_dataset], cwd=WYE_ROOT, input=json.dumps(facts), capture_output=True, text=True, check=True, env={**os.environ, "WF_URL": WF_URL}).stdout
        self.stats = json.loads(out.strip().splitlines()[-1])
        self.flushed = True
        time.sleep(3)  # the app indexes the scratch product on its first search
        return self.stats

    def query(self, text, k):
        """The app's search with the currency filter on: superseded facts never come back."""
        out = subprocess.run(["node", "-e", "fetch(process.env.WF_URL + '/api/eval-mab/context', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: process.argv[1], limit: Number(process.argv[2]) }) }).then(r => r.json()).then(j => console.log(JSON.stringify(j.hits.map(h => h.snippet.replace(/^fact:\\d+\\s*/, '')))))", text, str(k)], cwd=WYE_ROOT, capture_output=True, text=True, check=True, env={**os.environ, "WF_URL": WF_URL}).stdout
        return json.loads(out)


def initialize_wye_agent(agent, agent_config=None):
    config = agent_config or {}
    agent.retrieve_num = config.get("retrieve_num", 10)
    agent.context = ""
    agent.agent_start_time = time.time()
    agent.wye = WyeMemory(agent.sub_dataset)
    print(f"\n\nWye memory at {WF_URL}, product {PRODUCT}\n\n")


def handle_wye_agent(agent, message, memorizing, query_id, context_id):
    """Mirror methods/agentmemory.py: same query extraction, same reader assembly."""
    from methods.knowl import build_reader_messages, format_retrieval_memory_string
    from utils.templates import get_template

    if memorizing:
        agent.wye.add(message)
        return "Memorized"

    start = time.time()
    stats = agent.wye.flush()
    construction = time.time() - start
    retrieval_query = agent._extract_retrieval_query(message)
    contents = agent.wye.query(retrieval_query, agent.retrieve_num)
    memory = format_retrieval_memory_string(contents)
    system_message = get_template(agent.sub_dataset, "system", agent.agent_name)
    messages = build_reader_messages(memory, message, system_message)
    response = agent._create_oai_client().chat.completions.create(model=agent.model, messages=messages, temperature=agent.temperature, max_tokens=agent.max_tokens if "gpt-4" in agent.model else None)
    query_time = time.time() - start - construction
    print(f"\nWye stats: {stats}\n")
    return agent._create_standard_response(response.choices[0].message.content, response.usage.prompt_tokens, response.usage.completion_tokens, construction, query_time)
