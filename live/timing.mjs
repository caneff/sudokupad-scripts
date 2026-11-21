// Whether a live test's time budget decides the test (#1031). A wall-clock budget is not a correctness check on a shared box
// (load 12-50 failed attack 78 in 3 of 3 merge checks), so a budget fails a test only when the run sets LIVE_TIMING=1. The daily
// watch sets it (live/watch.mjs `suiteRunEnv`) on GitHub's runner, where a budget miss is a red check and files the watch's bug;
// a merge check and `npm run test:live` leave it unset, and the test still measures and prints its times. Not a check itself.

export const timingGated = (env = process.env) => env.LIVE_TIMING === '1'
