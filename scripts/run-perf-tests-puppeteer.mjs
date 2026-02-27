// Headless automation using Puppeteer to run performance tests and output JSON
import puppeteer from 'puppeteer'

const dataset = process.argv[2] || 'mixed'
const size = process.argv[3] || '10k'
const virtual = process.argv[4] === '1' ? '1' : '0'

async function run() {
  const url = `http://localhost:5173/performance_tests/index.html?auto=1&dataset=${dataset}&size=${size}&virtual=${virtual}`
  const browser = await puppeteer.launch({ headless: 'new' })
  const page = await browser.newPage()

  let reportFromConsole = null
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.startsWith('perf-report')) {
      try {
        const jsonText = text.replace('perf-report', '').trim()
        reportFromConsole = JSON.parse(jsonText)
      } catch {}
    }
  })

  // Retry waiting for dev server before navigate
  const deadline = Date.now() + 30000
  let connected = false
  while (Date.now() < deadline) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      connected = true
      break
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  if (!connected) {
    console.error('Failed to connect to dev server at http://localhost:5173. Ensure it is running (npm run dev).')
    await browser.close()
    process.exit(1)
  }

  // More robust wait: either window.perfReport is set by page logic, or #results has JSON
  await page.waitForFunction(() => {
    const w = window
    if (w && typeof w.perfReport === 'object' && w.perfReport) return true
    const el = document.getElementById('results')
    return !!el && !!el.textContent && el.textContent.trim().startsWith('{')
  }, { timeout: 120000 })

  const final = await page.evaluate(() => {
    const w = window
    if (w && typeof w.perfReport === 'object' && w.perfReport) return w.perfReport
    const el = document.getElementById('results')
    if (el && el.textContent) {
      try { return JSON.parse(el.textContent) } catch {}
    }
    return null
  })

  const result = final || reportFromConsole
  if (!result) {
    console.error('Failed to obtain perf report JSON')
    await browser.close()
    process.exit(1)
  }

  console.log(JSON.stringify(result, null, 2))
  await browser.close()
}

run().catch(async (e) => { console.error(e); process.exit(1) })
