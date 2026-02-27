import { create } from 'zustand'

export type PreviewMode = 'full' | 'light' | 'current_block_only'

interface RuntimeState {
  previewMode: PreviewMode
  disableHighlight: boolean
  workerAutoRestart: boolean
  setPreviewMode: (mode: PreviewMode) => void
  setDisableHighlight: (v: boolean) => void
  setWorkerAutoRestart: (v: boolean) => void
}

export const useRuntimeStore = create<RuntimeState>()((set) => ({
  previewMode: 'full',
  disableHighlight: false,
  workerAutoRestart: true,
  setPreviewMode: (previewMode) => set({ previewMode }),
  setDisableHighlight: (disableHighlight) => set({ disableHighlight }),
  setWorkerAutoRestart: (workerAutoRestart) => set({ workerAutoRestart }),
}))
