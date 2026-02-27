export interface FpsSample {
  t: number;
  dt: number;
}

export interface FpsSessionResult {
  frames: number;
  durationMs: number;
  avgFps: number;
  droppedFrames: number; // dt > 20ms 计为掉帧
  samples: FpsSample[];
}

export function startFpsSampler() {
  const samples: FpsSample[] = [];
  let frames = 0;
  let dropped = 0;
  let start = performance.now();
  let last = start;
  let rafId = 0;
  let running = true;

  function step(ts: number) {
    if (!running) return;
    frames++;
    const dt = ts - last;
    if (dt > 20) dropped++;
    samples.push({ t: ts - start, dt });
    last = ts;
    rafId = requestAnimationFrame(step);
  }

  rafId = requestAnimationFrame(step);

  function stop(): FpsSessionResult {
    running = false;
    cancelAnimationFrame(rafId);
    const end = performance.now();
    const duration = end - start;
    const avgFps = duration > 0 ? (frames * 1000) / duration : 0;
    return { frames, durationMs: duration, avgFps, droppedFrames: dropped, samples };
  }

  return { stop };
}
