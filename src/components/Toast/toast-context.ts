import { createContext, useContext } from 'react';

type ShowToast = (message: string, duration?: number) => void;

export const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastContext);
}
