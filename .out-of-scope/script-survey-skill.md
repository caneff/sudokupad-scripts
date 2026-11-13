# A script-survey skill

This repo has no skill or generator that writes survey briefs from a question template fanned across the scripts. A survey of the
scripts is briefed by hand.

## Why this is out of scope

Chris clicked through a prototype on 2026-11-13 and ruled it does not feel right. The idea itself is the problem, not the
wording of the briefs it wrote:

- The surveys asked different questions (polish, fragility, live-vs-unit duplicates, consistency), so a template saved little
  beyond the parts already written down.
- The parts every brief shares are already in one place: the standing rejections in `AGENTS.md` and the full consistency-survey
  prompt in `docs/agents/consistency-survey.md`. A new survey copies from those.
- A survey that compares scripts (the consistency survey) cannot be fanned one brief per script at all, so the generator needed a
  special case for the one survey that recurs.

The cost accepted: each new kind of survey still gets its brief typed by hand.

The prototype was one HTML file, `docs/agents/script-survey.PROTOTYPE.html`, at commit 32ee895 on the deleted branch
`prototype-722`.

## Prior requests

- #722 — "run `/prototype` on script-survey"
