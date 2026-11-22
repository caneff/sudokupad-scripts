# Netlify credits

Read 2026-11-03 from Netlify's docs, plus this repo's git history. The Netlify
usage page itself was not read: it needs Chris's login, and GitHub holds no
Netlify deployment or status records for this repo.

## What Netlify charges (Free plan: 300 credits a month, hard limit)

| Item | Credits |
| --- | --- |
| Successful production deploy | 15 each |
| Bandwidth | 20 per GB |
| Web requests | 2 per 10,000 |
| Deploy Previews, branch deploys, failed deploys | 0 |

Build minutes are no longer counted. At zero credits Netlify pauses every project
on the team and shows `Site not available` until the monthly reset.

Credits are per team, so another project on the same account draws from the same 300.

## What that means for this repo

- 300 credits is 20 production deploys.
- `main` has 61 first-parent commits from 2026-11-02 and 2026-11-03. Only 14 touch
  `site/`.
- A Git-connected Netlify project deploys on every push to the production branch.
  `netlify.toml` sets only `publish = "site"`, so it deploys on every push, even
  when `site/` did not change. Several commits pushed together deploy once.
- `site/` is 12K, so 300 credits of traffic would be about 1.5 million requests.
  Traffic is unlikely to be the cause.

Deploys are the likely cause. The usage page would confirm it.

## Ways to stop it

- `[skip netlify]` in a commit message skips that push's deploy, if it is in the
  most recent commit of the push.
- An `ignore` command in `netlify.toml` could skip pushes that leave `site/`
  unchanged. Not tested here. The 14 commits that touch `site/` would still have
  cost 210 credits.
- Serving `site/` from somewhere that doesn't charge per deploy, such as GitHub
  Pages, removes the meter.

## Sources

- <https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/>
- <https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview.md>
