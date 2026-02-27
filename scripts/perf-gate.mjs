// Performance gate: run perf tests via Puppeteer and enforce thresholds
import { spawn } from 'node:child_process'

const dataset = process.argv[2] || 'mixed'
const size = process.argv[3] || '10k'
const virtual = process.argv[4] === '0' ? '0' : '1'

const THRESHOLDS = {
  startupMountMs: 1000,     // first interactive
  parseMs: 800,             // parsing time
  inputAvgMs: 250,          // average input E2E per step
  scrollP95DtMs: 20,        // p95 frame dt (<= 20ms ~ 50fps), target 60fps ideally
  scrollAvgFps: 45,         // average fps
  memoryMaxMb: 200,         // heap peak
}

function runRunner() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/run-perf-tests-puppeteer.mjs', dataset, size, virtual], { stdio: ['ignore', 'pipe', 'inherit'] })
    let buf = ''
    child.stdout.on('data', (d) => { buf += d.toString() })
    child.on('exit', (code) => {
      if (code !== 0) return reject(new Error(`runner exited ${code}`))
      try { resolve(JSON.parse(buf)) } catch (e) { reject(e) }
    })
  })
}

function assertGate(report) {
  const failures = []
  const { startup, inputAvgMs, scroll, memory } = report
  if (startup.mountMs > THRESHOLDS.startupMountMs) failures.push(`startup mount ${startup.mountMs.toFixed(1)}ms > ${THRESHOLDS.startupMountMs}ms`)
  if (startup.parseMs > THRESHOLDS.parseMs) failures.push(`parse ${startup.parseMs.toFixed(1)}ms > ${THRESHOLDS.parseMs}ms`)
  if (inputAvgMs > THRESHOLDS.inputAvgMs) failures.push(`input avg ${inputAvgMs.toFixed(1)}ms > ${THRESHOLDS.inputAvgMs}ms`)
  if (scroll.p95 > THRESHOLDS.scrollP95DtMs) failures.push(`scroll p95 dt ${scroll.p95.toFixed(1)}ms > ${THRESHOLDS.scrollP95DtMs}ms`)
  if (scroll.avgFps < THRESHOLDS.scrollAvgFps) failures.push(`avgFps ${scroll.avgFps.toFixed(1)} < ${THRESHOLDS.scrollAvgFps}`)
  if (memory.max != null && memory.max > THRESHOLDS.memoryMaxMb) failures.push(`memory max ${memory.max.toFixed(1)}MB > ${THRESHOLDS.memoryMaxMb}MB`)
  return failures
}

runRunner().then((report) => {
  const failures = assertGate(report)
  if (failures.length) {
    console.error('[PERF GATE] FAILED:')
    failures.forEach((f) => console.error(' -', f))
    console.error('Report:', JSON.stringify(report, null, 2))
    process.exit(1)
  } else {
    console.log('[PERF GATE] PASSED')
    console.log(JSON.stringify(report, null, 2))
    process.exit(0)
  }
}).catch((e) => { console.error(e); process.exit(1) })
