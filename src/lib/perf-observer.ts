/**
 * PerformanceObserver helpers for long tasks and layout shifts (CLS proxy)
 * Enabled in development only; in production consider sampling selectively.
 */
export interface LongTaskEntry {
  name: string
  startTime: number
  duration: number
}

export interface LayoutShiftEntry {
  value: number
  hadRecentInput: boolean
  startTime: number
}

export function startLongTaskObserver(onEntry?: (e: LongTaskEntry) => void) {
  try {
    // @ts-ignore
    const obs = new PerformanceObserver((list) => {
      // @ts-ignore
      const entries = list.getEntries() as PerformanceEntry[]
      for (const e of entries) {
        if ((e as any).entryType === 'longtask' || e.entryType === 'longtask') {
          const lt: LongTaskEntry = { name: e.name, startTime: e.startTime, duration: e.duration }
          onEntry?.(lt)
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.debug('[perf] longtask', lt)
          }
        }
      }
    })
    // @ts-ignore
    obs.observe({ entryTypes: ['longtask'] })
    return () => obs.disconnect()
  } catch {
    return () => {}
  }
}

export function startLayoutShiftObserver(onEntry?: (e: LayoutShiftEntry) => void) {
  try {
    const obs = new PerformanceObserver((list) => {
      const entries = list.getEntries() as any[]
      for (const e of entries) {
        if (e.entryType === 'layout-shift') {
          const ls: LayoutShiftEntry = { value: e.value, hadRecentInput: e.hadRecentInput, startTime: e.startTime }
          onEntry?.(ls)
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.debug('[perf] layout-shift', ls)
          }
        }
      }
    })
    // Some browsers support 'layout-shift'
    obs.observe({ entryTypes: ['layout-shift'] as any })
    return () => obs.disconnect()
  } catch {
    return () => {}
  }
}
