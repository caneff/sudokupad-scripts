// An act on a target (a hover, a press) whose result `shown` waits for, made again where the target is now when its box changed since the act read it (#1067, #1068).
// A target that stayed put and showed nothing is the script's failure and gets the full wait, `finalMs`. A null box means nothing to act on: false.
export const MOVE_TRIES = 4
const MOVE_LOOK_MS = 500

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
