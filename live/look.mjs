// `npm run look -- <flags>`: opens the recorded SudokuPad with chosen scripts and saved settings, selects a tool, runs a snippet file in
// the page and/or takes a screenshot, and prints every skip line and uncaught page error. For a one-off look (a probe of SudokuPad's
// internals, a picture for a design question) that would otherwise be a scratch script. Not a check, so `live/**/*.live.mjs` skips it,
// and `npm test` and `land.testcmd` never run it. live/README.md § Looking at SudokuPad has the flags.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { harPath } from './cache.mjs'
import { pickTool } from './attack-fixtures.mjs'
import { SCRIPTS } from './scripts.mjs'
import { openWith, SCRIPT_FILES } from './session.mjs'

export const USAGE = `usage: npm run look -- [--scripts a,b] [--setting KEY=VALUE]... [--tool NAME] [--eval FILE] [--screenshot PATH [--selector CSS]]
  --scripts     scripts to install, by file name with or without .user.js (default: all)
  --setting     a saved setting planted before the page loads; KEY is the script's own key (PenColor_thickness), VALUE the text it is saved as
  --tool        the tool to select first, by its button's name: #control-<NAME> (default: normal)
  --eval        a file holding a function body, run in the page: \`return\` the result, which is printed as JSON
  --screenshot  write a picture of the page to PATH; with --selector, of the first element CSS matches
at least one of --eval and --screenshot is required`

const PEN_SCRIPT = 'pen-tool-extras.user.js'
const FLAGS = ['--scripts', '--setting', '--tool', '--eval', '--screenshot', '--selector']

const fail = (why) => { throw new Error(`${why}\n${USAGE}`) }

// The command's options from `argv`; `scriptFiles` are the file names `--scripts` may name. Throws an Error that ends with USAGE.
export function parseArgs (argv, scriptFiles) {
  const given = { settings: [] }
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    if (!FLAGS.includes(flag)) fail(`unknown flag ${flag}`)
    if (argv[i + 1] === undefined) fail(`${flag} needs a value`)
    const value = argv[i + 1]
    if (flag === '--setting') {
      const at = value.indexOf('=')
      if (at < 1) fail(`--setting wants KEY=VALUE, got ${value}`)
      given.settings.push([value.slice(0, at), value.slice(at + 1)])
    } else {
      given[flag.slice(2)] = value
    }
  }
  const names = given.scripts === undefined ? undefined : given.scripts.split(',')
  const wanted = names?.map((name) => {
    const file = name.endsWith('.user.js') ? name : `${name}.user.js`
    if (!scriptFiles.includes(file)) fail(`no script ${JSON.stringify(name)}; the scripts are ${scriptFiles.join(', ')}`)
    return file
  }) ?? scriptFiles
  if (given.eval === undefined && given.screenshot === undefined) fail('nothing to do')
  if (given.selector !== undefined && given.screenshot === undefined) fail('--selector crops a --screenshot')
  const tool = given.tool ?? 'normal'
  if (tool === 'pen' && !wanted.includes(PEN_SCRIPT)) fail(`--tool pen needs ${PEN_SCRIPT}, which turns the pen tool on`)
  return {
    scripts: scriptFiles.filter((file) => wanted.includes(file)),
    settings: given.settings,
    eval: given.eval,
    screenshot: given.screenshot,
    selector: given.selector,
    tool
  }
}

// Plants each setting under the key SudokuPad's own storage gives it, before the page's scripts run, and hands back the page's
// `errors` (the skip lines and uncaught page errors `openWith` collects) the moment it exists, so a run that fails still prints them.
const seedWith = (settings, onErrors) => async (p, errors) => {
  onErrors(errors)
  await p.addInitScript((entries) => {
    for (const [key, value] of entries) window.localStorage.setItem('svencodes_' + key, value)
  }, settings)
}

async function look (options, onErrors) {
  if (!existsSync(harPath(process.env, homedir()))) {
    throw new Error('there is no recording of SudokuPad to replay: record it once with `npm run test:live:files -- live/startup.live.mjs`')
  }
  // Read before the browser opens, so a wrong path fails at once and not after the page has loaded.
  const snippet = options.eval === undefined ? undefined : readFileSync(options.eval, 'utf8')
  // Replaying never touches the network: a recording past a day old is used as it is, not checked.
  process.env.LIVE_OFFLINE = '1'
  const browser = await chromium.launch()
  try {
    const { p } = await openWith(browser, options.scripts, { seed: seedWith(options.settings, onErrors) })
    for (const script of SCRIPTS.filter((s) => options.scripts.includes(s.file))) await script.ready(p)
    try {
      await pickTool(p, options.tool)
    } catch (e) {
      throw new Error(`could not select the ${options.tool} tool (#control-${options.tool}): ${e.message}`)
    }
    if (snippet !== undefined) {
      const result = await p.evaluate(`(async () => {\n${snippet}\n})()`)
      console.log(JSON.stringify(result ?? null, null, 2))
    }
    if (options.screenshot !== undefined) {
      await (options.selector === undefined ? p : p.locator(options.selector).first()).screenshot({ path: options.screenshot })
      console.log(`screenshot: ${options.screenshot}`)
    }
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let collected = []
  let failed = false
  try {
    await look(parseArgs(process.argv.slice(2), SCRIPT_FILES), (errors) => { collected = errors })
  } catch (e) {
    console.error(e.message)
    failed = true
  }
  for (const line of collected) console.error(`skip or page error: ${line}`)
  if (failed) process.exit(1)
}
