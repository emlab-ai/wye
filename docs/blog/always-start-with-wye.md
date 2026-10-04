# Always start with "wye"

I have been thinking a lot lately about the future of engineering with AI.

Writing code is no longer the hard part. (A hint: I am not sure it ever was.) Agents now write in an afternoon
what used to take a week, and they keep getting better at it.

So what is next for engineers?

## What does an engineer do when the code writes itself?

I still think engineers will play an important part. But the role seems to be changing.

If an agent can build almost anything I describe, then the value moves to the description. What should we build?
For whom? What did the customer actually ask for, and what did they mean? Which rule applies here, and which
decision from last month still holds?

Understanding the business and talking to customers were always useful for an engineer. Now they look like the
main part of the job. The engineers I admire most were already doing this. The difference is that it used to be
optional.

So maybe the shift is this: less focus on code, more focus on product.

## Where does the product live?

That sounds good, but it raised a practical question for me. If the product is where we should focus, where is
the product written down?

Is it Jira? Jira tracks the work well, but a closed ticket describes a change that happened, and the product is
the sum of thousands of them.

Is it Confluence or Notion? They hold the pages, and I have written many. But how do I know that the page from
March still agrees with the decision we made in June?

Is it Obsidian? I like it for my own notes. Can a team, and the agents working with it, rely on those notes as
what the product must do?

Or is it in Slack threads, meeting notes and people's heads? For most teams I have worked in, honestly, a lot of
it is.

Each of these tools is good at what it was made for. What I could not find was an answer to the questions I
actually had:

- How do people and agents work on the same understanding of the product?
- How do we keep that view consistent as it changes every day?
- When a new requirement contradicts an older one, who notices, and when?
- When an agent makes a product decision in the middle of a build, where does it go, and who sees it?
- Before we change something, can we see what else it reaches?

The last few matter more with agents than without them. A person who joins a team picks up context over months.
An agent starts every session from zero, reads the code, and guesses the intent behind it.

## That is why I built Wye

Wye started as a thought experiment around one question: what is a good way for a person to work with agents on
a product, one level above the code?

It is an editor for a product's definition. Requirements, rules, constraints, decisions, goals and tests are
written as Markdown documents in Git. Every block is a typed node and every link is an edge, so the documents are
also a graph, shared by the people who define the product and by the coding agents (Claude Code, Codex) that
build it.

Here is how it tries to answer the questions above.

**One view of the product.** There is one definition, in plain files in your repo. People edit it in the app;
agents read and write it through a CLI. A block has one home, and everywhere else it appears as a view of the
same thing.

**Contradictions are caught when they are written.** A new requirement, rule or decision is compared with its
neighbours in the graph. If it conflicts with something, approving it means choosing: replace the old one, refine
the new one, or dismiss the conflict with a reason. The old one is kept in history, marked as superseded.

**Agents start with the rules in force.** Before a build, Wye walks the graph from what the change touches and
collects every rule, constraint and approved decision that governs it. The agent gets them in its first message,
so it does not have to guess.

**Decisions come back.** When an agent decides something during a build, it writes that down as a proposed block.
It waits in an Inbox for a person. Agents propose, people approve.

**A PR is a Prompt Request.** Instead of a code diff, you review a request: what was asked, what it touches, what
it would change in the definition, what questions it raises. An agent helps refine it with you. When you approve,
an agent builds it.

**Impact before the edit.** Change a requirement and Wye lists what that reaches, and what each affected piece
needs, before anything is built.

## Why "wye"?

A wye is the letter Y: a junction where two flows join into one. For me these are the person's flow (what the
product is for, what was decided) and the agent's flow (what the code does, what it found).

It also sounds like "why", which is where I would like every change to start.

## Where it is now

Wye is open source (Apache-2.0) and local-first: it runs on your machine over the files in your repo, with no
accounts. It is early. I use it to build itself, so the app is described in Wye and every change to it goes
through the loop above.

I do not think this is the only answer, and I am curious how others approach it. Where does your product live
today? And how do your agents find out?

https://github.com/emlab-ai/wye

---

# LinkedIn post

Always start with "wye"

I have been thinking about the future of engineering with AI.

Writing code is no longer the hard part. (Hint: I am not sure it ever was.)

So what is next?

I still think engineers will play an important part. But the role is changing. Understanding the business and talking to customers are becoming even more important. If an agent can build almost anything I describe, the value moves to the description.

Less focus on code, more focus on product. But then, practically:

→ Where does the product live? Jira? Confluence? Notion? Obsidian? Slack threads?
→ How do people and agents work from the same understanding of it?
→ How do we keep that view consistent while it changes every day?
→ When a new requirement contradicts an older one, who notices?
→ When an agent makes a product decision mid-build, who sees it?

I could not find a tool that answered these for me, so I built one.

Wye is an open-source editor for a product's definition:

→ Requirements, rules and decisions are Markdown in Git, and every block is a node in a graph.
→ Contradictions are caught when something new is written, and a person chooses.
→ Agents (Claude Code, Codex) get the rules in force before they write a line.
→ Decisions an agent makes come back as proposals for a person to approve.
→ A PR is a Prompt Request: you review what was asked and what it affects.

The name is the letter Y, a junction where the person's flow and the agent's flow join. It also sounds like "why", which is where I would like every change to start.

It is early, local-first and Apache-2.0. I use it to build itself.

Repo: https://github.com/emlab-ai/wye
Longer write-up: [link to article]

Where does your product live today, and how do your agents find out?

#AI #SoftwareEngineering #ProductManagement #CodingAgents #OpenSource
