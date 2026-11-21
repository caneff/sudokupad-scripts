// Whether attack 78's time budget decides the test (#1031): only when the run sets LIVE_TIMING=1. Not a check itself.
// The reason and the rule are in live/README.md § Time budgets.

export const timingGated = (env = process.env) => env.LIVE_TIMING === '1'
