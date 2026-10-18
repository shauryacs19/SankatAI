// Regenerate the home page's product screenshots (src/assets/showcase/*.webp)
// from the dev preview, which renders the real app with sample data
// (preview.html?showcase=1). Dev tool only; nothing here ships.
//
//   1. npm run dev --workspace=@sankatai/web      (serves http://localhost:5173)
//   2. node --experimental-websocket apps/web/scripts/capture-showcase.mjs
//      (Node 22+ needs no flag; set BROWSER_PATH for a Chrome/Edge elsewhere)
//
// Drives a headless Chromium browser over the DevTools protocol so each shot
// has an exact viewport, theme and reduced motion (no half-finished scrolls).
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BROWSER = process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = `${process.env.PREVIEW_ORIGIN || 'http://localhost:5173'}/preview.html?static=1&showcase=1`
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'showcase')
const PORT = 9335

// [name, css width, css height, device scale (sets the stored pixel size), mobile, query, clip?]
const SHOTS = [
  ['chat', 1200, 760, 1.2, false, 'route=/dashboard/chat'],
  ['profile', 1200, 760, 1.2, false, 'route=/dashboard/profile'],
  ['history', 1200, 760, 1.2, false, 'route=/dashboard/history'],
  ['files', 1200, 760, 1.2, false, 'route=/dashboard/files'],
  // Only the AI analysis drawer (the right 384 CSS px of the chat).
  ['analysis', 1200, 760, 4 / 3, false, 'route=/dashboard/chat&click=.sh-bar-analysis', { x: 816, y: 0, width: 384, height: 760 }],
  ['chat-phone', 390, 844, 560 / 390, true, 'route=/dashboard/chat'],
  ['emergency-phone', 390, 844, 560 / 390, true, 'route=/dashboard/emergency'],
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = spawn(BROWSER, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sankatai-shots-'))}`, 'about:blank'], { stdio: 'ignore' })

try {
  let ready = false
  for (let i = 0; i < 40 && !ready; i++) {
    try { ready = (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok } catch { await sleep(250) }
  }
  const page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)))
    ws.send(JSON.stringify({ id: n, method, params }))
  })

  await send('Page.enable')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  for (const [name, width, height, deviceScaleFactor, mobile, query, clip] of SHOTS) {
    for (const theme of ['light', 'dark']) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile })
      await send('Emulation.setTouchEmulationEnabled', { enabled: mobile })
      await send('Page.navigate', { url: `${BASE}&theme=${theme}&${query}` })
      await sleep(3500) // mocks, webfont, the click= hook (1.5 s) and layout settle
      const { data } = await send('Page.captureScreenshot', { format: 'webp', quality: 80, ...(clip && { clip: { ...clip, scale: 1 } }) })
      writeFileSync(join(OUT, `${name}-${theme}.webp`), Buffer.from(data, 'base64'))
      console.log(`${name}-${theme}.webp`)
    }
  }
  ws.close()
} finally {
  browser.kill()
}
