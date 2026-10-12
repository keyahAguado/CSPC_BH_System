// Track My Application session (accountless applicants). Kept in sessionStorage only and
// separate from the normal login token; the server limits it to 2 hours.
const KEY = 'cspc_applicant_token';
let channel = null;
try { if (typeof BroadcastChannel === 'function') channel = new BroadcastChannel('cspc-applicant-verification'); } catch { /* browser restrictions: this tab still works */ }
channel?.addEventListener('message', ({ data }) => {
  if (typeof data !== 'string') return;
  try { sessionStorage.setItem(KEY, data); } catch { return; }
  window.dispatchEvent(new Event('applicant-session-updated'));
});

export const applicantToken = () => {
  try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; }
};
export const setApplicantToken = (token) => {
  try { sessionStorage.setItem(KEY, token); } catch { /* storage unavailable */ }
  try { channel?.postMessage(token); } catch { /* synchronization is optional */ }
  window.dispatchEvent(new Event('applicant-session-updated'));
};
export const clearApplicantToken = () => {
  try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  try { channel?.postMessage(''); } catch { /* synchronization is optional */ }
};
export const applicantHeaders = () => ({ Authorization: `Bearer ${applicantToken()}` });

// Display only. The server verifies the signature, expiry and current identity.
export const verifiedApplicantEmail = () => {
  try {
    const raw = applicantToken().split('.')[1];
    const payload = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/')));
    return payload.scope === 'verified-applicant' && payload.exp * 1000 > Date.now() ? payload.email : '';
  } catch { return ''; }
};
export const verifiedApplicantId = () => {
  try {
    const raw = applicantToken().split('.')[1];
    const payload = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/')));
    return verifiedApplicantEmail() && Number.isInteger(payload.applicantId) ? payload.applicantId : null;
  } catch { return null; }
};

export const STATUS_INFO = {
  SUBMITTED: { label: 'Submitted', badge: 'bg-blue-100 text-blue-700', hint: 'Waiting for SASO review. You can still edit it.' },
  UNDER_REVIEW: { label: 'Under review', badge: 'bg-indigo-100 text-indigo-700', hint: 'SASO is reviewing it. Editing is locked during review.' },
  REVISION_REQUIRED: { label: 'Revision required', badge: 'bg-amber-100 text-amber-800', hint: 'SASO asked for corrections. Update and resubmit.' },
  RESUBMITTED: { label: 'Resubmitted', badge: 'bg-sky-100 text-sky-700', hint: 'Your revision was sent back to SASO for review.' },
  APPROVED: { label: 'Approved', badge: 'bg-emerald-100 text-emerald-700', hint: 'Approved by SASO.' },
  ACCOUNT_PENDING: { label: 'Approved – activate account', badge: 'bg-emerald-100 text-emerald-700', hint: 'Approved. Activate your owner account to manage it.' },
  ACTIVE: { label: 'Accredited', badge: 'bg-emerald-600 text-white', hint: 'Accredited and managed from your owner dashboard.' },
  REJECTED: { label: 'Rejected', badge: 'bg-rose-100 text-rose-700', hint: 'This application was not approved.' }
};

export const formatDate = (value, withTime = false) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-PH', withTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
};
