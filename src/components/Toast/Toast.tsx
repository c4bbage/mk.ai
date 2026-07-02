import { useState, useCallback, useRef, type ReactNode } from 'react';
import { ToastContext } from './toast-context';

interface ToastState {
  message: string;
  visible: boolean;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>({ message: '', visible: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, duration = 2000) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setToast({ message, visible: true });
    timerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
      timerRef.current = null;
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast.visible && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            padding: '8px 20px',
            borderRadius: '8px',
            fontSize: '14px',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
