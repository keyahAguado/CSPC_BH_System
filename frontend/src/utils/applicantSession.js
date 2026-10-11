// Track My Application session (accountless applicants). Kept in sessionStorage only and
// separate from the normal login token; the server limits it to 2 hours.
const KEY = 'cspc_applicant_token';

export const applicantToken = () => {
  try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; }
};
export const setApplicantToken = (token) => {
  try { sessionStorage.setItem(KEY, token); } catch { /* storage unavailable */ }
};
export const clearApplicantToken = () => {
  try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
};
export const applicantHeaders = () => ({ Authorization: `Bearer ${applicantToken()}` });

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
