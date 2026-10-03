# Revisit a request with the current approach

You are on a Prompt Request page written under older rules. Bring the page up to the way a request is written now
(your system prompt — "The request page a person reads", "After every round of answers", "Card hygiene") so a person
understands from it exactly what will be built. You change the **form**, never the **substance**: every answer the
person gave, every approval and every decision stays what it is. Anything that would change what was decided is a
question for the person (AskUserQuestion), not an edit.

## 1. Read the page and list what is out of date

`wye doc <ref>` (the whole page), `wye pr <ref>` (its readiness and the open contradictions), `wye node <id>` for
each block in the Definition, `wye check --root data/products/<product>` for cards the parser cannot read. Then log
one line per finding with `wye session log <id> "<finding>"`. Look for:

- **No Summary**, or one older than the last answer — what gets built, how it works, an example, the plan, out of
  scope, what is still open.
- **Analysis or Context older than the answers** — a risk an answer already settled, "possibly" for something a
  decision made certain, "none found" while `wye pr` lists an open contradiction, code changes the decisions require
  but the Changes do not name.
- **One choice held twice** — two decisions on the same choice, or a resolved question whose answer is in no
  decision, or is only in the question.
- **Blocks a later decision overruled** — a requirement whose text still says what a decision changed, a test whose
  title or text no longer matches its requirement.
- **Malformed cards** — a key given twice (an old and a new title), a second card nested in the first, cards the
  parser does not see.
- **Cards in the wrong place** — tests, questions or decisions written under **Result** (the app rewrites that
  section when the build ends), blocks on the request whose kind now has a home document.
- **Open contradictions whose cause is gone**, and verdicts about texts that have since changed.
- **Titles with notes appended** — a title is one sentence naming the outcome.

## 2. Fix, in this order, keeping every id

1. **Merge what is held twice.** Keep one decision per choice — the approved one, else the earliest — and refine its
   content so it says the whole choice in full sentences, with the alternatives that were ruled out
   (`wye node content <id> --file f`). Set each duplicate `--status superseded` and add it to the kept one's
   `supersedes:` (`wye node set <kept> --set supersedes=[…]`). A resolved question's answer that is in no decision
   becomes part of the decision for that choice.
2. **Follow decisions through.** Edit each requirement and test a decision overruled so it says what was decided
   (`wye node set` / `wye node content`, same id). Do not change a requirement's meaning beyond what the decision
   says; if it is unclear what the decision means for it, ask.
3. **Repair malformed cards.** Copy the card's current text from `wye doc`, rewrite the section that holds it without
   the broken card (`wye doc write <ref> --section <Heading> --file f`), then propose the card again on its own, with
   one title and one text — the newest version — into its home document (`wye propose <doc> --pr <ref>`, or
   `wye propose --pr <ref>` alone when the product has no home for its kind). Same id.
4. **Move cards out of Result** the same way: the card's text copied, the Result section rewritten without it, the
   card proposed into its home. Leave in Result only what a finished build wrote there.
5. **Re-judge.** `wye verdicts <every id you changed>` — a contradiction whose cause is gone is closed by it; one that
   stays is a real question: ask the person.
6. **Rewrite the Analysis** whole (skill:analyse-request) and **write the Summary** (`--section Summary`) last, from
   the page as it now stands. If the page has no `## Summary` heading, write it with `--section Summary` all the same;
   it goes under the Request.
7. **Titles**: shorten a title that carries a note to one sentence and move the note into the block's content.

Never: change an answer, an approval or a status the person set (except superseding a duplicate, which you say);
delete a block (supersede or reject it with the reason); rewrite the Request; build or approve.

## 3. Report

`wye pr <ref>` once more, then `wye session done <id> "<what you fixed, one line each; what is still open and
needs the person>"`. In chat, the same in a few lines — what changed on the page and the questions left, as tags.
