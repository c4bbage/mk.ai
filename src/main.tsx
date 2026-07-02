import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ToastProvider } from './components/Toast/Toast'
import { perfMark } from './lib/performance'

window.addEventListener('error', (e) => {
  console.error('[FATAL]', e.error || e.message);
  const root = document.getElementById('root');
  if (root) {
    const pre = document.createElement('pre');
    pre.style.cssText = 'padding:20px;color:red;font-size:14px;white-space:pre-wrap';
    pre.textContent = e.error?.stack || e.message;
    root.replaceChildren(pre);
  }
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[UNHANDLED REJECTION]', e.reason);
});

perfMark('app_boot_start');

try {
  createRoot(document.getElementById('root') ?? document.body).render(
    <StrictMode>
      <ToastProvider>
        <App />
      </ToastProvider>
    </StrictMode>,
  );
} catch (e) {
  const err = e as Error;
  const root = document.getElementById('root');
  if (root) {
    const pre = document.createElement('pre');
    pre.style.cssText = 'padding:20px;color:red;font-size:14px;white-space:pre-wrap';
    pre.textContent = err.stack || String(e);
    root.replaceChildren(pre);
  }
}
