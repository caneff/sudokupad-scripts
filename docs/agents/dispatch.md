# Dispatching workers

Read this before a controller dispatches workers or after a drain run.

- **Dispatch cap** (Chris, 2026-11-08): a controller has at most 6 workers out at once, and at most 2 whose tickets change the
  same `*.user.js`; a new ticket waits for a slot. A script's version is raised in the change that alters it
  (`CODING_STANDARDS.md` rule 13), not at merge, so parallel PRs on one script each need another merge of main.
- **The consistency survey**: after a drain run that merged a change to what a script shows, and at least monthly, run
  `docs/agents/consistency-survey.md`. It finds twin features that behave differently, which no test or audit compares.
