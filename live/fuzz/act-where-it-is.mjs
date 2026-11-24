// An act on a target (a hover, a press) whose result `shown` waits for, made again where the target is now when it moved since the act's read of its box: a Restart or a
// settings change moves the rules pane, and a panel can settle after its box was read (#1067, #1068), so the act lands beside the target, as it does for a player, who tries again.
// A target that did not move and showed nothing is the script's failure, and waits out the full time (`finalMs`) as it always did. `boxOf` reads the target's box (null: nothing to
// act on, and the answer is false). `lookMs` is how long each act is given to show its result.
export const MOVE_TRIES = 4
export const MOVE_LOOK_MS = 500

export async function actWhereItIs (shown, boxOf, act, { lookMs = MOVE_LOOK_MS, finalMs }) {
  for (let tries = 0; tries < MOVE_TRIES; tries++) {
    const box = await boxOf()
    if (!box) return false
    await act(box)
    if (await shown.waitFor({ state: 'visible', timeout: lookMs }).then(() => true, () => false)) return true
    if (JSON.stringify(await boxOf()) === JSON.stringify(box)) break
  }
  await shown.waitFor({ state: 'visible', timeout: finalMs })
  return true
}
