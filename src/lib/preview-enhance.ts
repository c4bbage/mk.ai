/**
 * Post-processing for preview HTML: add copy buttons to code blocks,
 * make task-list checkboxes interactive, etc.
 */

/**
 * Wrap <pre> elements with a code-block-wrapper and add a copy button.
 * Call after HTML is committed to the DOM.
 */
export function enhancePreviewDom(container: HTMLElement): void {
  enhanceCodeBlocks(container);
  enhanceTaskList(container);
}

/**
 * Add copy button to each <pre> that contains a <code>.
 */
function enhanceCodeBlocks(container: HTMLElement): void {
  const pres = container.querySelectorAll<HTMLPreElement>('pre:not([data-enhanced])');

  for (const pre of pres) {
    pre.setAttribute('data-enhanced', '1');

    // Skip mermaid blocks (they render SVG, not code)
    if (pre.parentElement?.classList.contains('mermaid-block')) continue;

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';

    // Insert wrapper before pre, move pre inside
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    // Create copy button
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.textContent = '复制';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const code = pre.querySelector('code');
      const text = code?.textContent ?? pre.textContent ?? '';
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = '已复制';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = '复制';
            btn.classList.remove('copied');
          }, 1500);
        });
      } else {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btn.textContent = '已复制';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = '复制';
          btn.classList.remove('copied');
        }, 1500);
      }
    });

    wrapper.appendChild(btn);
  }
}

/**
 * Make task-list checkboxes interactive.
 * When clicked, toggle the checkbox and emit a custom event for the editor
 * to update the markdown source.
 */
function enhanceTaskList(container: HTMLElement): void {
  const checkboxes = container.querySelectorAll<HTMLInputElement>(
    '.task-list-item input[type="checkbox"]'
  );

  for (const cb of checkboxes) {
    if (cb.dataset.enhanced) continue;
    cb.dataset.enhanced = '1';
    cb.removeAttribute('disabled');

    cb.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Find the task item index across the entire preview container
      // (not just the current block — for VirtualPreview with multiple list blocks)
      const root = cb.closest('.markdown-body') ?? cb.closest('.preview-container') ?? document;
      const allTaskItems = root.querySelectorAll('.task-list-item');
      let taskIndex = -1;
      for (let i = 0; i < allTaskItems.length; i++) {
        if (allTaskItems[i].contains(cb)) {
          taskIndex = i;
          break;
        }
      }
      if (taskIndex < 0) return;

      const newChecked = !cb.checked;

      // Update checkbox visual state immediately
      cb.checked = newChecked;

      // Emit custom event for App to handle
      const eventTarget = cb.closest('.markdown-body') ?? cb.closest('.preview-container') ?? container;
      eventTarget.dispatchEvent(new CustomEvent('task-toggle', {
        bubbles: true,
        detail: { taskIndex, checked: newChecked },
      }));
    });
  }
}
