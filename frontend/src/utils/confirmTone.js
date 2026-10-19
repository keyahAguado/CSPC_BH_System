// Icon and button style for a generic yes/no confirmation, from its title (and an optional explicit type).
// Destructive: red button. Caution (checkout, archive, logout...): yellow warning icon, blue button.
// Positive (approve, confirm arrival...): green check icon, blue button. Anything else: blue info icon.
const DESTRUCTIVE = /\b(reject|remove|delete|discard|revoke)/i;
const CAUTION = /\b(check ?out|archive|pause|unlist|log ?out|sign out|cancel|deactivat|clear)/i;
const POSITIVE = /\b(approve|accredit|reactivat|restore|activate|arrival|publish|mark)/i;
export function confirmTone(title = '', type = '') {
  if (DESTRUCTIVE.test(title)) return { tone: 'is-danger', icon: 'fa-circle-exclamation', button: 'cm-danger' };
  if (CAUTION.test(title) || type === 'warning') return { tone: 'is-warning', icon: 'fa-triangle-exclamation', button: 'cm-confirm' };
  if (POSITIVE.test(title) || type === 'success') return { tone: 'is-success', icon: 'fa-circle-check', button: 'cm-confirm' };
  return { tone: 'is-info', icon: 'fa-circle-info', button: 'cm-confirm' };
}
