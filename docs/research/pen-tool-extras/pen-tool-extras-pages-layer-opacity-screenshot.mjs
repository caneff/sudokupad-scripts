// Draws crossing lines with pen-tool-extras.user.js with the opacity on each stroke (before) and on the whole pen layer
// (after), and shoots the pen panel on both pages (.scratch/ov-*.png); pasted side by side into pen-tool-extras-pages-layer-opacity.png.
// Run from the repo root with Playwright's Chromium installed. Not part of any test.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const url = readFileSync('live/puzzle-url.txt','utf8').trim()
const script = readFileSync('pen-tool-extras.user.js','utf8')
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1200,height:900},deviceScaleFactor:2})
await p.route(/cookiebot|googletagmanager|plausible/, r=>r.abort())
await p.goto(url,{waitUntil:'load'})
await p.waitForFunction(()=>typeof Framework!=='undefined'&&Framework.app&&Framework.app.puzzle&&Framework.app.puzzle.cells&&Framework.app.puzzle.cells.length)
await p.getByRole('button',{name:/Start Puzzle|Continue|Resume/i}).first().click()
await p.locator('#control-undo').waitFor()
await p.addScriptTag({content:script})
await p.evaluate(()=>Framework.setSetting('toolpen',true))
for (let i=0;i<20 && !(await p.locator('.tool-pen button[data-key="1"]').isVisible());i++){await p.click('#control-pen');await p.waitForTimeout(300)}
const cell=await p.evaluate(()=>{const c=Framework.app.puzzle.cells; const a=c.find(x=>x.row===0&&x.col===0).elem.getBoundingClientRect(); const d=c.find(x=>x.row===1&&x.col===1).elem.getBoundingClientRect(); return {x:a.x,y:a.y,w:d.x-a.x}})
const pt=(r,c)=>[cell.x+c*cell.w, cell.y+r*cell.w]
const drag=async(pts)=>{await p.mouse.move(...pt(...pts[0]));await p.mouse.down();for(let i=1;i<pts.length;i++){const [x0,y0]=pt(...pts[i-1]),[x1,y1]=pt(...pts[i]);for(let k=1;k<=14;k++)await p.mouse.move(x0+(x1-x0)*k/14,y0+(y1-y0)*k/14)}await p.mouse.up()}
await p.locator('.penlinemode select').selectOption('centeronly').catch(()=>{})
await p.evaluate(()=>{ToolPen.tool.lineMode='centeronly'})
await p.locator('.tool-pen button[data-key="4"]').click()
await drag([[1.5,1.5],[1.5,5.5]]); await drag([[3.5,1.5],[5.5,3.5],[3.5,5.5]])
await p.locator('.tool-pen button[data-key="6"]').click()
await drag([[0.5,3.5],[4.5,3.5]]) ; await drag([[3.5,0.5],[3.5,2.5]])
await p.evaluate(()=>{const el=document.getElementById('pen-tool-extras-opacity'); el.value=60; el.dispatchEvent(new Event('input',{bubbles:true}))})
await p.mouse.move(5,5)
const clip={x:cell.x-4,y:cell.y-4,width:cell.w*7+8,height:cell.w*7+8}
await p.screenshot({path:'.scratch/ov-after.png',clip})
await p.addStyleTag({content:':root:root .cell-pen{opacity:.6 !important}:root:root #cell-pen{opacity:1 !important}'})
await p.screenshot({path:'.scratch/ov-before.png',clip})
await p.evaluate(()=>{const el=document.getElementById('pen-tool-extras-opacity'); el.value=80; el.dispatchEvent(new Event('input',{bubbles:true}))})
await p.locator('.pen-tool-extras-page').waitFor()
await p.screenshot({path:'.scratch/ov-panel1.png',clip:{x:715,y:405,width:290,height:300}})
await p.click('.pen-tool-extras-page'); await p.mouse.move(5,5)
await p.screenshot({path:'.scratch/ov-panel2.png',clip:{x:715,y:405,width:290,height:300}})
await b.close()
