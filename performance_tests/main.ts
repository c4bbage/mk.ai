// 轻量 DEMO 文本，避免引入业务端的 marked/highlight 等重依赖
const DEMO = `# 性能测试页\n\n这是一个最小的 Markdown 文本，用于避免在测试页拉入大体积依赖。\n\n- 列表\n- 文本\n\n`;

function genText(size: number): string {
  return Array.from({ length: Math.ceil(size / 50) }, (_, i) => `段落 ${i}\n\n这是一段用于性能测试的文本，包含一些常见的 Markdown 语法，例如**粗体**、_斜体_、[链接](https://example.com)。\n\n`).join('');
}

function genCode(size: number): string {
  const code = `\n\n\`\`\`ts\n${'const x = 42;\n'.repeat(50)}\`\`\``;
  return genText(size) + code.repeat(Math.ceil(size / 500));
}

function genMath(size: number): string {
  const math = `\n\n$$\\sum_{i=1}^{n} x_i = x_1 + x_2 + \\cdots + x_n$$`;
  return genText(size) + math.repeat(Math.ceil(size / 200));
}

function genMermaid(size: number): string {
  const m = `\n\n\`\`\`mermaid\ngraph TD;A-->B;B-->C;C-->D;D-->E;\n\`\`\``;
  return genText(size) + m.repeat(Math.ceil(size / 400));
}

function genMixed(size: number): string {
  return [genText(size / 2), genCode(size / 4), genMath(size / 4), genMermaid(size / 4)].join('\n');
}

type Dataset = 'text' | 'code' | 'math' | 'mermaid' | 'mixed';

function makeDoc(dataset: Dataset, size: number): string {
  switch (dataset) {
    case 'text': return genText(size);
    case 'code': return genCode(size);
    case 'math': return genMath(size);
    case 'mermaid': return genMermaid(size);
    default: return genMixed(size);
  }
}

import { parseMarkdown } from '../src/lib/markdown';
import { lazyLoadKaTeX, lazyLoadMermaid, runWhenIdle, getRenderDelay } from '../src/lib/performance';
import { startFpsSampler } from '../src/lib/perf-sampler';

function mark(name: string) {
  performance.mark(name);
}

function measure(name: string, start: string, end: string) {
  performance.measure(name, start, end);
  const entries = performance.getEntriesByName(name).pop();
  return entries?.duration || 0;
}

function fmt(ms: number) {
  return `${ms.toFixed(1)} ms`;
}

function log(msg: string) {
  const el = document.getElementById('results')!;
  el.textContent += `\n${msg}`;
}

function clearLog() {
  const el = document.getElementById('results')!;
  el.textContent = '';
}

async function mountApp(content: string, useVirtual: boolean) {
  const mount = document.getElementById('mount')!;
  mount.innerHTML = '';

  const container = document.createElement('div');
  container.style.height = '100%';
  container.style.overflow = 'auto';
  mount.appendChild(container);

  // 统一口径：分别度量解析完成、初次可交互、完整渲染三个里程碑
  mark('mount-start');
  mark('parse-start');

  let parseTime = 0;
  let fullRenderTime: number | null = null;

  if (useVirtual) {
    // 虚拟预览：分块解析，同样走 parseMarkdown 入口，随后增量追加到容器（保护 fenced/maths 边界）
    container.innerHTML = '';
    // 安全分块：保留 ```/~~~ fenced 代码块与 $$ 数学块的完整性
    function splitIntoSafeBlocks(text: string): string[] {
      const lines = text.split('\n');
      const blocks: string[] = [];
      let buf: string[] = [];
      let inFence = false;
      let fenceDelimiter = '';
      let inMathBlock = false;
      for (const line of lines) {
        const trimmed = line.trim();
        // 代码围栏开始
        if (!inFence && (trimmed.startsWith('```') || trimmed.startsWith('~~~'))) {
          inFence = true;
          fenceDelimiter = trimmed.startsWith('```') ? '```' : '~~~';
          buf.push(line);
          continue;
        }
        // 代码围栏结束
        if (inFence) {
          buf.push(line);
          if (trimmed.startsWith(fenceDelimiter)) {
            inFence = false;
            blocks.push(buf.join('\n'));
            buf = [];
          }
          continue;
        }
        // 数学块开始/结束（以单独 $$ 行作为边界）
        if (!inMathBlock && trimmed === '$$') {
          inMathBlock = true;
          buf.push(line);
          continue;
        }
        if (inMathBlock) {
          buf.push(line);
          if (trimmed === '$$') {
            inMathBlock = false;
            blocks.push(buf.join('\n'));
            buf = [];
          }
          continue;
        }
        // 段落分隔：空行触发切块
        if (trimmed === '') {
          if (buf.length) {
            blocks.push(buf.join('\n'));
            buf = [];
          }
          continue;
        }
        buf.push(line);
      }
      if (buf.length) blocks.push(buf.join('\n'));
      return blocks;
    }
    const blocks = splitIntoSafeBlocks(content);
    for (const b of blocks) {
      const t0 = performance.now();
      const html = parseMarkdown(b);
      parseTime += performance.now() - t0;
      container.insertAdjacentHTML('beforeend', html);
    }
  } else {
    // 普通预览：全量解析真实内容
    const t0 = performance.now();
    const html = parseMarkdown(content);
    parseTime += performance.now() - t0;
    container.innerHTML = html;
    // 按需渲染数学公式与 Mermaid 图表（空闲时）
    runWhenIdle(async () => {
      const idleStart = performance.now();
      try {
        const { renderMathInElement } = await lazyLoadKaTeX();
        await renderMathInElement(container);
      } catch {}
      try {
        const { renderMermaidInElement } = await lazyLoadMermaid();
        await renderMermaidInElement(container);
      } catch {}
      mark('full-render-end');
      fullRenderTime = performance.now() - idleStart; // 仅供参考：空闲期内的渲染耗时
    });
  }

  mark('parse-end');
  mark('mount-end');

  const mountTime = measure('mount', 'mount-start', 'mount-end');
  const parseMs = measure('parse', 'parse-start', 'parse-end');

  return { container, mountTime, parseTime: parseMs || parseTime, fullRenderTime };
}

async function runStartup(dataset: Dataset, sizeLabel: string, useVirtual: boolean): Promise<{ mountMs: number; parseMs: number; fullRenderMs: number | null }> {
  clearLog();
  const size = { '5k': 5000, '10k': 10000, '30k': 30000, '60k': 60000 }[sizeLabel];
  const content = makeDoc(dataset, size);
  log(`启动时间测试 - 数据集: ${dataset}, 大小: ${sizeLabel}, 虚拟: ${useVirtual}`);

  const { mountTime, parseTime, fullRenderTime } = await mountApp(content, useVirtual);
  log(`解析完成: ${fmt(parseTime)} | 初次可交互(挂载): ${fmt(mountTime)}${fullRenderTime != null ? ` | 完整渲染(KaTeX/Mermaid): ${fmt(fullRenderTime)}` : ''}`);
  return { mountMs: mountTime, parseMs: parseTime, fullRenderMs: fullRenderTime ?? null };
}

async function runInput(dataset: Dataset, sizeLabel: string, useVirtual: boolean) {
  clearLog();
  const size = { '5k': 5000, '10k': 10000, '30k': 30000, '60k': 60000 }[sizeLabel];
  let content = makeDoc(dataset, size);
  log(`输入延迟测试 - 数据集: ${dataset}, 大小: ${sizeLabel}, 虚拟: ${useVirtual}`);

  const mount = await mountApp(content, useVirtual);

  // 模拟 50 次输入，每次插入 5 个字符；包含编辑→防抖→解析→渲染链路
  let total = 0;
  for (let i = 0; i < 50; i++) {
    mark('input-start');
    content += 'abcde';
    // 防抖：根据文档规模动态等待，模拟实际应用的提交间隔
    const delay = getRenderDelay(content);
    await new Promise((r) => setTimeout(r, delay));

    // 解析 Markdown 并渲染到容器
    const html = parseMarkdown(content);
    mount.container.innerHTML = html;

    // 数学公式与 Mermaid 按需渲染
    try {
      const { renderMathInElement } = await lazyLoadKaTeX();
      await renderMathInElement(mount.container);
    } catch {}
    try {
      const { renderMermaidInElement } = await lazyLoadMermaid();
      await renderMermaidInElement(mount.container);
    } catch {}

    mark('input-end');
    total += measure('input', 'input-start', 'input-end');
    await new Promise((r) => setTimeout(r, 10));
  }
  log(`输入模拟 50 次平均耗时: ${fmt(total / 50)}`);
  return total / 50;
}

async function runScroll(dataset: Dataset, sizeLabel: string, useVirtual: boolean) {
  clearLog();
  const size = { '5k': 5000, '10k': 10000, '30k': 30000, '60k': 60000 }[sizeLabel];
  const content = makeDoc(dataset, size);
  log(`滚动流畅度测试 - 数据集: ${dataset}, 大小: ${sizeLabel}, 虚拟: ${useVirtual}`);

  const { container } = await mountApp(content, useVirtual);

  // 若内容不够导致无法滚动，追加填充内容确保滚动成立
  if (container.scrollHeight <= container.clientHeight) {
    const filler = Array.from({ length: 200 }, (_, i) => `<p>filler ${i}</p>`).join('');
    container.insertAdjacentHTML('beforeend', filler);
  }

  // 连续滚动 5 秒，采样帧时间分布并统计 P95/P99
  const sampler = startFpsSampler();
  const durationMs = 5000;
  const startTs = performance.now();

  return new Promise((resolve) => {
    function step() {
      // 触发真实滚动绘制
      container.scrollBy({ top: 5, behavior: 'auto' });
      if (performance.now() - startTs < durationMs) {
        requestAnimationFrame(step);
      } else {
        const result = sampler.stop();
        const dts = result.samples.map((s) => s.dt).sort((a, b) => a - b);
        const maxDt = dts.length ? dts[dts.length - 1] : 0;
        const p95 = dts.length ? dts[Math.floor(0.95 * dts.length)] : 0;
        const p99 = dts.length ? dts[Math.floor(0.99 * dts.length)] : 0;
        log(`时长: ${(result.durationMs / 1000).toFixed(1)}s, 帧数: ${result.frames}, 平均 FPS: ${result.avgFps.toFixed(1)}, 掉帧估计: ${result.droppedFrames}`);
        log(`dt 分布: max=${maxDt.toFixed(1)}ms, P95=${p95.toFixed(1)}ms, P99=${p99.toFixed(1)}ms`);
        resolve({ durationMs: result.durationMs, frames: result.frames, avgFps: result.avgFps, droppedFrames: result.droppedFrames, maxDt, p95, p99 });
      }
    }
    requestAnimationFrame(step);
  });
}

async function runMemory(dataset: Dataset, sizeLabel: string, useVirtual: boolean): Promise<{ avg: number | null; max: number | null }> {
  clearLog();
  const size = { '5k': 5000, '10k': 10000, '30k': 30000, '60k': 60000 }[sizeLabel];
  const content = makeDoc(dataset, size);
  log(`内存占用测试 - 数据集: ${dataset}, 大小: ${sizeLabel}, 虚拟: ${useVirtual}`);

  await mountApp(content, useVirtual);

  // 采样 10 次
  const samples: number[] = [];
  for (let i = 0; i < 10; i++) {
    if ((performance as any).memory) {
      const m = (performance as any).memory.usedJSHeapSize / 1024 / 1024;
      samples.push(m);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (samples.length) {
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const max = Math.max(...samples);
    log(`平均堆内存: ${avg.toFixed(1)} MB, 峰值: ${max.toFixed(1)} MB`);
    return { avg, max };
  } else {
    log('当前环境不支持 performance.memory');
    return { avg: null, max: null };
  }
}

function setup() {
  const dataset = document.getElementById('dataset') as HTMLSelectElement;
  const size = document.getElementById('size') as HTMLSelectElement;
  const useVirtual = document.getElementById('useVirtual') as HTMLInputElement;

  document.getElementById('runStartup')!.onclick = () => { runStartup(dataset.value as Dataset, size.value, useVirtual.checked); };
  document.getElementById('runInput')!.onclick = () => { runInput(dataset.value as Dataset, size.value, useVirtual.checked); };
  document.getElementById('runScroll')!.onclick = () => { runScroll(dataset.value as Dataset, size.value, useVirtual.checked); };
  document.getElementById('runMemory')!.onclick = () => { runMemory(dataset.value as Dataset, size.value, useVirtual.checked); };
  document.getElementById('runAll')!.onclick = async () => {
    await runStartup(dataset.value as Dataset, size.value, useVirtual.checked);
    await runInput(dataset.value as Dataset, size.value, useVirtual.checked);
    await runScroll(dataset.value as Dataset, size.value, useVirtual.checked);
    await runMemory(dataset.value as Dataset, size.value, useVirtual.checked);
  };

  // 自动化模式：支持通过 URL 参数触发并输出 JSON 报告
  const params = new URLSearchParams(location.search);
  if (params.get('auto') === '1') {
    const autoDataset = (params.get('dataset') as Dataset) || (dataset.value as Dataset);
    const autoSize = params.get('size') || size.value;
    const autoVirtual = params.get('virtual') === '1' ? true : useVirtual.checked;
    (async () => {
      const startup = await runStartup(autoDataset, autoSize, autoVirtual);
      const inputAvgMs = await runInput(autoDataset, autoSize, autoVirtual);
      const scrollStats = await runScroll(autoDataset, autoSize, autoVirtual);
      const memoryStats = await runMemory(autoDataset, autoSize, autoVirtual);
      const report = { startup, inputAvgMs, scroll: scrollStats, memory: memoryStats } as const;
      const results = document.getElementById('results')!;
      results.textContent = JSON.stringify(report, null, 2);
      (window as any).perfReport = report;
      console.log('perf-report', JSON.stringify(report));
    })();
  }
}

setup();
