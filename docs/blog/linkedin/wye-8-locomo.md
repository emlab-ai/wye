# wye remember? Wye on LoCoMo

Image: wye-8-locomo.png

---

Is Wye just a nice UI for notes and decisions? I wondered that myself, so I put it through a memory benchmark.

LoCoMo is the benchmark memory products quote most: ten long conversations between two people, each spread over
19–32 dated sessions, and 1,986 questions about them. What did she say last May? Who adopted the dog? When was the
charity race?

I gave Wye nothing special. Each conversation went through the same path anyone uses on their own documents:

→ `wye import`: agents read the sessions and turn them into a graph of linked, dated cards (people, events,
facts, when each happened)
→ `wye ask`: search, a walk through that graph, and a read-only agent that answers with citations

No benchmark-specific prompts, no tuning on the questions. I used Supermemory's open MemoryBench harness on all
1,540 questions usually reported.

Result: 93.0%.

For context, the published figures I could find:
• Mem0: 92.5% (self-reported)
• Zep: 94.7% (self-reported, method disputed)
• Supermemory: 77.1% (GPT-4o)
• Whole conversation in the prompt: 72.9% (gpt-4o-mini, Mem0 paper)

So my current answer: Wye is not only a UI. Underneath is agentic memory that sits close to the top of what memory
products report.

What I can't claim yet:
• The models differ from row to row. Wye answered and was judged with Claude Sonnet 5.5, so this is not a
like-for-like ranking.
• LoCoMo has its own limits: an audit found 6.4% of the answer key is wrong, so about 93.6% is the ceiling.
• I haven't yet run the same model with the whole conversation in context, which would show how much the vault
adds over the model alone.

Next: LongMemEval and the Agent Memory Leaderboard, where every system uses the same model.

Where do you think memory for agents should live: in a dedicated memory layer, or in the knowledge your team already
keeps?

#AI #Agents #AgentMemory #LLM #KnowledgeManagement
