import { create } from 'zustand'

interface RuntimeState {
  disableHighlight: boolean
  setDisableHighlight: (v: boolean) => void
}

export const useRuntimeStore = create<RuntimeState>()((set) => ({
  disableHighlight: false,
  setDisableHighlight: (disableHighlight) => set({ disableHighlight }),
}))
