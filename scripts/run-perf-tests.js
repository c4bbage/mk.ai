// Deprecated: This script cannot execute client-side auto logic reliably.
// Use scripts/run-perf-tests-puppeteer.mjs instead.
console.error('[DEPRECATED] scripts/run-perf-tests.js: Use Puppeteer runner:')
console.error('  node scripts/run-perf-tests-puppeteer.mjs <dataset> <size> <virtualFlag>')
// Exit with 0 to avoid failing CI pipelines when old command is invoked.
process.exit(0);
