// Presentation-only focus management. Decision and close handlers stay with each page.
import { nextTick } from 'vue';
const stack = [];
let sequence = 0;
let savedOverflow = '';
const visible = el => !!el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
const focusables = el => [...el.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(visible);
function deactivate(el) {
  const state = el.__managementDialog;
  if (!state?.active) return;
  state.active = false;
  const index = stack.indexOf(el);
  const wasTop = index === stack.length - 1;
  if (index >= 0) stack.splice(index, 1);
  state.panel.removeAttribute('aria-modal');
  if (el.tagName === 'ASIDE') { state.panel.removeAttribute('role'); state.panel.removeAttribute('aria-label'); }
  if (!stack.length) document.body.style.overflow = savedOverflow;
  if (wasTop && state.previous?.isConnected && visible(state.previous)) state.previous.focus({ preventScroll: true });
}
function sync(el, binding) {
  const state = el.__managementDialog;
  if (!state || state.disposed) return;
  state.options = binding.value || {};
  const enabled = state.options.enabled !== false && visible(el);
  if (!enabled) { deactivate(el); return; }
  if (state.active) return;
  state.active = true;
  state.previous = document.activeElement;
  if (!stack.length) { savedOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
  stack.push(el);
  const panel = state.panel;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('tabindex', '-1');
  const heading = panel.querySelector('h1,h2,h3');
  if (heading) { if (!heading.id) heading.id = 'management-dialog-title-' + ++sequence; panel.setAttribute('aria-labelledby', heading.id); }
  else panel.setAttribute('aria-label', state.options.label || 'Preview');
  panel.focus({ preventScroll: true });
}
export const vManagementDialog = {
  mounted(el, binding) {
    const panel = el.tagName === 'ASIDE' ? el : el.firstElementChild;
    if (!panel) return;
    if (el.tagName !== 'ASIDE') panel.classList.add('management-dialog-panel');
    const state = { panel, active: false, options: binding.value || {} };
    el.__managementDialog = state;
    state.keydown = event => {
      if (!state.active || stack[stack.length - 1] !== el) return;
      if (event.key === 'Escape' && state.options.close) { event.preventDefault(); event.stopPropagation(); state.options.close(); }
      if (event.key === 'Tab') {
        const items = focusables(panel);
        if (!items.length) { event.preventDefault(); panel.focus(); return; }
        const first = items[0], last = items[items.length - 1];
        if (!panel.contains(document.activeElement) || document.activeElement === panel) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', state.keydown, true);
    nextTick(() => sync(el, binding));
  },
  updated(el, binding) { if (el.__managementDialog) nextTick(() => sync(el, binding)); },
  beforeUnmount(el) { if (el.__managementDialog) { deactivate(el); el.__managementDialog.disposed = true; document.removeEventListener('keydown', el.__managementDialog.keydown, true); } }
};
