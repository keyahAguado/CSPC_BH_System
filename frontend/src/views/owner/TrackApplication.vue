<script setup>
import ApplicantEmailGate from '../../components/ApplicantEmailGate.vue';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import axios from 'axios';
import { getImageUrl } from '../../config/api.js';
import { applicantToken, verifiedApplicantId, clearApplicantToken, applicantHeaders, STATUS_INFO, formatDate } from '../../utils/applicantSession.js';

const router = useRouter();
const route = useRoute();

// Shown after the register / edit page sends the applicant here.
const submittedRef = typeof route.query.submitted === 'string' ? route.query.submitted : '';
const updatedRef = typeof route.query.updated === 'string' ? route.query.updated : '';
const updatedStatus = typeof route.query.status === 'string' ? route.query.status : '';
const submittedTicket = computed(() => applications.value.find(app => app.reference_no === submittedRef));
const referenceCopied = ref(false);
const copyReference = async () => {
  try { await navigator.clipboard.writeText(submittedRef); referenceCopied.value = true; } catch { referenceCopied.value = false; }
};

const errorMsg = ref('');

const isLoading = ref(false);
const applicant = ref(null);
const applications = ref([]);
const expanded = ref({});
const details = ref({});
const activation = ref({ loading: false, error: '' });

const signedIn = computed(() => Boolean(applicant.value));
const canAddProperty = computed(() => applicant.value && applicant.value.account_status !== 'ACTIVE');

const sessionExpired = (err) => {
  if (err.response?.status === 401) {
    clearApplicantToken();
    applicant.value = null;
    errorMsg.value = err.response.data?.message || 'Your tracking session has expired. Please verify again.';
    return true;
  }
  return false;
};

const loadApplications = async () => {
  if (!verifiedApplicantId()) return;
  isLoading.value = true;
  try {
    const { data } = await axios.get('/api/applications/mine', { headers: applicantHeaders() });
    applicant.value = data.applicant;
    applications.value = data.applications || [];
    errorMsg.value = "";
  } catch (err) {
    if (!sessionExpired(err)) errorMsg.value = err.response?.data?.message || 'We could not load your applications. Please try again.';
  } finally {
    isLoading.value = false;
  }
};

const signOut = () => {
  clearApplicantToken();
  applicant.value = null;
  applications.value = [];
  details.value = {};
  expanded.value = {};
};

const toggleDetails = async (app) => {
  const ref = app.reference_no;
  expanded.value[ref] = !expanded.value[ref];
  if (!expanded.value[ref] || (details.value[ref] && !details.value[ref].error)) return;
  try {
    const { data } = await axios.get(`/api/applications/${encodeURIComponent(ref)}`, { headers: applicantHeaders() });
    const permitFiles = Array.isArray(data.permitFiles) ? [...data.permitFiles] : [];
    for (const key of Object.keys(documentNames)) {
      const permitKey = 'permit_' + key;
      const path = data.application?.[permitKey];
      if (path && !permitFiles.some(file => file.permit_key === permitKey)) permitFiles.push({ permit_key: permitKey, file_path: path });
    }
    details.value[ref] = { ...data, photos: Array.isArray(data.photos) ? data.photos : [], permitFiles, history: Array.isArray(data.history) ? data.history : [] };
  } catch (err) {
    if (!sessionExpired(err)) details.value[ref] = { error: err.response?.data?.message || 'Could not load the details.' };
  }
};

const startActivation = async () => {
  activation.value = { loading: true, error: '' };
  try {
    const { data } = await axios.post('/api/applications/activation-link', {}, { headers: applicantHeaders() });
    const url = new URL(data.activation_url, window.location.origin);
    try { if (applicant.value?.email) sessionStorage.setItem('cspc_activation_email', applicant.value.email); } catch { /* storage unavailable */ }
    router.push(`/activate-account${url.search}`);
  } catch (err) {
    if (!sessionExpired(err)) activation.value = { loading: false, error: err.response?.data?.message || 'Could not start account activation.' };
  }
};

const documentNames = { business_form: 'Business application', cedula: 'Community tax certificate', dti: 'DTI registration', barangay: 'Barangay clearance', building: 'Building permit', zoning: 'Zoning clearance', sanitary: 'Sanitary permit', fire: 'Fire safety certificate' };
const documentUrl = (path) => {
  if (!path) return null;
  try { const url = new URL(getImageUrl(path), window.location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
};
const editLabel = (status) => (status === 'REVISION_REQUIRED' ? 'Respond to revision request' : 'Edit application');
// Badge colours for this page only; STATUS_INFO.badge is also used by the admin screens.
const STATUS_TONES = { SUBMITTED: 'tone-submitted', UNDER_REVIEW: 'tone-review', REVISION_REQUIRED: 'tone-revision', RESUBMITTED: 'tone-resubmitted', APPROVED: 'tone-approved', ACCOUNT_PENDING: 'tone-approved', ACTIVE: 'tone-active', REJECTED: 'tone-rejected' };
const statusTone = (status) => STATUS_TONES[status] || 'tone-neutral';
// Progress tracker (like parcel tracking): which stage each status has reached
const TRACK_STAGES = [
  { label: 'Submitted', icon: 'fa-paper-plane' },
  { label: 'Under review', icon: 'fa-magnifying-glass' },
  { label: 'Approved', icon: 'fa-circle-check' },
  { label: 'Accredited', icon: 'fa-award' }
];
const STAGE_OF = { SUBMITTED: 0, RESUBMITTED: 0, UNDER_REVIEW: 1, REVISION_REQUIRED: 1, REJECTED: 1, APPROVED: 2, ACCOUNT_PENDING: 2, ACTIVE: 3 };
const stageState = (status, index) => {
  const at = STAGE_OF[status] ?? 0;
  if (index < at) return 'is-done';
  if (index > at) return 'is-todo';
  if (status === 'REJECTED') return 'is-failed';
  if (status === 'REVISION_REQUIRED') return 'is-warning';
  return status === 'ACTIVE' ? 'is-done' : 'is-current';
};
const stageLabel = (status, index) => {
  if (index === STAGE_OF[status]) {
    if (status === 'REVISION_REQUIRED') return 'Revision required';
    if (status === 'REJECTED') return 'Not approved';
    if (status === 'RESUBMITTED') return 'Resubmitted';
  }
  return TRACK_STAGES[index].label;
};
const initials = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'A';
// Display only: long remarks start collapsed to a few lines; "Show more" reveals the full text.
const openText = ref({});
const isLongText = (text, chars) => String(text || '').length > chars || String(text || '').split('\n').length > 3;
const toggleText = (key) => { openText.value[key] = !openText.value[key]; };

onMounted(loadApplications);
const refreshSession = () => { if (applicantToken()) loadApplications(); else { applicant.value = null; applications.value = []; } };
onMounted(() => window.addEventListener('applicant-session-updated', refreshSession));
onUnmounted(() => window.removeEventListener('applicant-session-updated', refreshSession));
</script>

<template>
  <div class="min-h-screen bg-[#f4f7fb] font-sans text-[#243449]">
    <main :class="['mx-auto px-4 sm:px-6 py-5 sm:py-8', submittedTicket && signedIn ? 'max-w-6xl' : 'max-w-4xl']">
      <header class="track-hero">
        <router-link to="/" class="track-focus flex items-center gap-3 min-w-0 rounded-lg">
          <span class="track-hero-logo"><img src="/img/CSPC_logo.png" alt="" class="w-8 h-8 object-contain" /></span>
          <span class="min-w-0">
            <h1 class="text-base sm:text-xl font-bold text-white truncate">Track My Application</h1>
            <span class="block text-[12.5px] text-blue-100 truncate">CSPC Boarding House Finder · Property accreditation</span>
          </span>
        </router-link>
        <button v-if="signedIn" type="button" @click="signOut" class="track-focus track-hero-btn">
          <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>Sign out
        </button>
      </header>

      <div v-if="updatedRef && signedIn" role="status" class="mb-5 flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-900">
        <i class="fa-solid fa-circle-check mt-0.5 text-emerald-700" aria-hidden="true"></i>
        <p class="min-w-0 track-wrap">{{ updatedStatus === 'RESUBMITTED' ? 'Your revision was resubmitted to SASO for' : 'Your changes were saved for' }} <span class="font-semibold">{{ updatedRef }}</span>.</p>
      </div>

      <div v-if="errorMsg" role="alert" class="mb-5 flex items-start gap-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-sm">
        <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true"></i>
        <p class="min-w-0 track-wrap">{{ errorMsg }}</p>
      </div>

      <ApplicantEmailGate v-if="!signedIn && !isLoading" />

      <div v-if="isLoading" class="text-center text-slate-600 text-sm py-16" role="status">
        <i class="fa-solid fa-spinner fa-spin mr-2 text-[#245b99]" aria-hidden="true"></i>Loading your applications…
      </div>
      <!-- Dashboard -->
      <div v-if="signedIn && !isLoading" :class="['track-layout', { 'has-side': submittedTicket }]">
        <aside v-if="submittedTicket" role="status" class="track-ticket track-side">
          <div class="track-ticket-head">
            <span class="track-ticket-icon"><i class="fa-solid fa-check" aria-hidden="true"></i></span>
            <div class="min-w-0">
              <p class="text-base font-bold text-emerald-900">Application submitted</p>
              <p class="text-[13px] text-emerald-800/80">SASO will review your property. You can follow its progress below.</p>
            </div>
          </div>
          <div class="track-ticket-body is-stacked">
            <!-- Reference "stub" -->
            <div class="track-ref">
              <p class="text-[12px] font-semibold uppercase tracking-wider text-slate-500">Reference number</p>
              <p class="font-mono text-xl sm:text-2xl font-bold text-[#142b4a] tracking-wider select-all track-wrap">{{ submittedRef }}</p>
              <button type="button" @click="copyReference" class="track-focus track-btn track-btn-secondary mt-2">
                <i :class="['fa-solid', referenceCopied ? 'fa-check' : 'fa-copy']" aria-hidden="true"></i>{{ referenceCopied ? 'Copied' : 'Copy reference' }}
              </button>
            </div>
            <div class="min-w-0">
              <dl class="track-facts-grid">
                <div><dt><i class="fa-solid fa-house" aria-hidden="true"></i> Property</dt><dd>{{ submittedTicket.name }}</dd></div>
                <div><dt><i class="fa-regular fa-calendar" aria-hidden="true"></i> Submitted</dt><dd>{{ formatDate(submittedTicket.submitted_at, true) }}</dd></div>
                <div><dt><i class="fa-solid fa-signal" aria-hidden="true"></i> Status</dt><dd><span :class="['track-badge', statusTone(submittedTicket.status)]">{{ STATUS_INFO[submittedTicket.status]?.label || submittedTicket.status }}</span></dd></div>
              </dl>
              <p class="track-tip"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i> Save this reference number to identify this application. Verify your registered email when you return.</p>
            </div>
          </div>
        </aside>
        <div class="track-main min-w-0">
        <section class="track-profile">
          <div class="flex items-center gap-3 min-w-0">
            <span class="track-avatar" aria-hidden="true">{{ initials(applicant.name) }}</span>
            <div class="min-w-0">
              <p class="text-[12px] font-semibold uppercase tracking-wider text-slate-500">Applicant</p>
              <p class="font-semibold text-[#142b4a] track-wrap">{{ applicant.name }}</p>
              <p v-if="applicant.email" class="text-[13px] text-slate-600 track-wrap"><i class="fa-regular fa-envelope mr-1 text-slate-400" aria-hidden="true"></i>{{ applicant.email }}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button v-if="applicant.account_status === 'ACCOUNT_PENDING'" type="button" @click="startActivation" :disabled="activation.loading"
              class="track-focus track-btn bg-emerald-700 hover:bg-emerald-800 text-white">
              <i class="fa-solid fa-user-check" aria-hidden="true"></i>{{ activation.loading ? 'Preparing…' : 'Activate owner account' }}
            </button>
            <router-link v-if="applicant.account_status === 'ACTIVE'" to="/login" class="track-focus track-btn bg-[#1e4a8d] hover:bg-[#163870] text-white">
              <i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i>Log in to owner dashboard
            </router-link>
            <router-link v-if="canAddProperty" to="/register?add=1" class="track-focus track-btn track-btn-secondary">
              <i class="fa-solid fa-plus" aria-hidden="true"></i>Add another property
            </router-link>
          </div>
        </section>
        <p v-if="activation.error" role="alert" class="mb-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-sm track-wrap">{{ activation.error }}</p>
        <p v-if="applicant.account_status === 'ACCOUNT_PENDING'" class="mb-5 flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-3 text-sm leading-relaxed">
          <i class="fa-solid fa-circle-check mt-0.5 text-emerald-700" aria-hidden="true"></i><span>SASO approved your application. Activate your owner account to set your password and manage your property.</span>
        </p>

        <section v-if="applications.length === 0" class="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-600">
          <i class="fa-regular fa-folder-open text-3xl mb-3 text-slate-400" aria-hidden="true"></i>
          <p class="font-medium">No applications yet.</p>
        </section>

        <h2 v-if="applications.length" class="track-list-title"><i class="fa-solid fa-folder-open" aria-hidden="true"></i> My applications <span>{{ applications.length }}</span></h2>
        <ul class="space-y-4">
          <li v-for="app in applications" :key="app.reference_no || app.name" :class="['track-app', statusTone(app.status)]">
            <div class="px-4 sm:px-5 py-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <span class="track-app-icon" aria-hidden="true"><i class="fa-solid fa-building"></i></span>
                  <h2 class="min-w-0 text-base font-semibold leading-snug text-[#142b4a] track-wrap">{{ app.name }}</h2>
                  <span :class="['track-badge', statusTone(app.status)]">{{ STATUS_INFO[app.status]?.label || app.status }}</span>
                </div>
                <dl class="track-meta mt-1.5">
                  <div><dt>Reference</dt><dd class="font-medium text-slate-800 tracking-wide tabular-nums track-wrap">{{ app.reference_no || 'Reference pending' }}</dd></div>
                  <div><dt>Submitted</dt><dd>{{ formatDate(app.submitted_at) }}</dd></div>
                  <div v-if="formatDate(app.updated_at) !== formatDate(app.submitted_at)"><dt>Last updated</dt><dd>{{ formatDate(app.updated_at) }}</dd></div>
                </dl>
                <p class="mt-1.5 text-sm text-slate-600 max-w-prose">{{ STATUS_INFO[app.status]?.hint }}</p>
              </div>
              <div class="flex flex-wrap gap-2 md:justify-end">
                <button type="button" @click="toggleDetails(app)" :aria-expanded="Boolean(expanded[app.reference_no])"
                  class="track-focus track-btn track-btn-secondary">
                  <i :class="['fa-solid', expanded[app.reference_no] ? 'fa-chevron-up' : 'fa-clock-rotate-left']" aria-hidden="true"></i>{{ expanded[app.reference_no] ? 'Hide details' : 'View details & status' }}
                </button>
                <router-link v-if="app.editable" :to="`/register?edit=${encodeURIComponent(app.reference_no)}`"
                  :class="['track-focus track-btn text-white', app.status === 'REVISION_REQUIRED' ? 'bg-amber-700 hover:bg-amber-800' : 'bg-[#1e4a8d] hover:bg-[#163870]']">
                  <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>{{ editLabel(app.status) }}
                </router-link>
              </div>
            </div>
            <ol class="track-steps" :aria-label="'Progress of ' + app.name">
              <li v-for="(stage, i) in TRACK_STAGES" :key="stage.label" :class="['track-step', stageState(app.status, i)]">
                <span class="track-step-dot"><i :class="['fa-solid', stageState(app.status, i) === 'is-failed' ? 'fa-xmark' : stageState(app.status, i) === 'is-warning' ? 'fa-pen' : stage.icon]" aria-hidden="true"></i></span>
                <span class="track-step-label">{{ stageLabel(app.status, i) }}</span>
              </li>
            </ol>
            <div v-if="app.remarks" class="mx-4 sm:mx-5 mb-4 border-l-[3px] rounded-r-lg px-4 py-3" :class="app.status === 'REJECTED' ? 'border-rose-500 bg-rose-50 text-rose-900' : 'border-amber-500 bg-amber-50 text-amber-950'">
              <h3 class="text-[13px] font-semibold mb-1">SASO remarks</h3>
              <p :id="`remarks-${app.reference_no}`" :class="['text-sm leading-relaxed whitespace-pre-line track-wrap max-w-[70ch]', isLongText(app.remarks, 280) && !openText[`r:${app.reference_no}`] ? 'track-clamp-4' : '']">{{ app.remarks }}</p>
              <button v-if="isLongText(app.remarks, 280)" type="button" @click="toggleText(`r:${app.reference_no}`)" :aria-expanded="Boolean(openText[`r:${app.reference_no}`])" :aria-controls="`remarks-${app.reference_no}`" class="track-focus track-more">{{ openText[`r:${app.reference_no}`] ? 'Show less' : 'Show more' }}</button>
            </div>

            <div v-if="expanded[app.reference_no]" class="border-t border-slate-200 px-4 sm:px-5 py-5">
              <p v-if="!details[app.reference_no]" class="text-sm text-slate-600" role="status"><i class="fa-solid fa-spinner fa-spin mr-1.5 text-[#245b99]" aria-hidden="true"></i>Loading…</p>
              <div v-else-if="details[app.reference_no].error" role="alert" class="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 track-wrap">{{ details[app.reference_no].error }} <button type="button" class="track-focus ml-2 font-medium underline underline-offset-2 rounded" @click="expanded[app.reference_no] = false; toggleDetails(app)">Try again</button></div>
              <div v-else class="space-y-6">
                <section class="min-w-0">
                  <h3 class="track-subhead">Property</h3>
                  <div class="flex flex-col sm:flex-row sm:items-start gap-5 min-w-0">
                    <img v-if="details[app.reference_no].application.img" :src="getImageUrl(details[app.reference_no].application.img)" alt="Featured property photo" class="w-full max-w-[320px] sm:w-[220px] aspect-[4/3] object-cover rounded-lg border border-slate-200 shrink-0" />
                    <dl class="track-props flex-1 min-w-0">
                      <div class="track-props-wide"><dt>Address</dt><dd>{{ details[app.reference_no].application.location || '—' }}</dd></div>
                      <div><dt>Monthly rent</dt><dd class="tabular-nums">₱{{ Number(details[app.reference_no].application.price || 0).toLocaleString() }}</dd></div>
                      <div><dt>Contact</dt><dd>{{ details[app.reference_no].application.phone_contact || 'Not provided' }}</dd></div>
                      <div><dt>Photos</dt><dd class="tabular-nums">{{ details[app.reference_no].photos.length }}</dd></div>
                      <div><dt>Document files</dt><dd class="tabular-nums">{{ details[app.reference_no].permitFiles.length }}</dd></div>
                    </dl>
                  </div>
                </section>
                <div class="grid md:grid-cols-2 gap-6 md:gap-8 pt-6 border-t border-slate-100">
                <div class="min-w-0">
                  <h3 class="track-subhead">Submitted documents</h3>
                  <ul class="text-sm border border-slate-200 rounded-lg divide-y divide-slate-200">
                    <li v-for="(file, index) in details[app.reference_no].permitFiles" :key="index" class="flex items-start gap-3 px-3 py-2">
                      <i class="fa-regular fa-file-lines mt-0.5 text-slate-400" aria-hidden="true"></i>
                      <a v-if="documentUrl(file.file_path)" :href="documentUrl(file.file_path)" target="_blank" rel="noopener noreferrer" class="track-focus min-w-0 rounded text-[#245b99] hover:text-[#142b4a] underline underline-offset-2 track-wrap">{{ documentNames[String(file.permit_key || '').replace(/^permit_/, '')] || file.permit_key }} - file {{ index + 1 }}<span class="sr-only"> (opens in a new tab)</span><i class="fa-solid fa-arrow-up-right-from-square ml-1.5 text-[11px]" aria-hidden="true"></i></a>
                      <span v-else class="min-w-0 text-slate-600 track-wrap">{{ documentNames[String(file.permit_key || '').replace(/^permit_/, '')] || file.permit_key }}: file unavailable</span>
                    </li>
                    <li v-if="!details[app.reference_no].permitFiles.length" class="px-3 py-2 text-slate-600">No document files available in this list.</li>
                  </ul>
                </div>
                <div class="min-w-0">
                  <h3 class="track-subhead">Status history</h3>
                  <ol class="track-timeline">
                    <li v-for="(h, i) in details[app.reference_no].history" :key="i" class="relative">
                      <span class="track-dot" aria-hidden="true"></span>
                      <p class="text-[13px]"><span class="font-semibold text-[#142b4a]">{{ STATUS_INFO[h.status]?.label || h.status }}</span> <span class="text-slate-600 whitespace-nowrap">· {{ formatDate(h.created_at, true) }}</span></p>
                      <template v-if="h.remarks">
                        <p :id="`history-${app.reference_no}-${i}`" :class="['mt-0.5 text-[13px] leading-relaxed text-slate-700 whitespace-pre-line track-wrap max-w-[60ch]', isLongText(h.remarks, 120) && !openText[`h:${app.reference_no}:${i}`] ? 'track-clamp-2' : '']">{{ h.remarks }}</p>
                        <button v-if="isLongText(h.remarks, 120)" type="button" @click="toggleText(`h:${app.reference_no}:${i}`)" :aria-expanded="Boolean(openText[`h:${app.reference_no}:${i}`])" :aria-controls="`history-${app.reference_no}-${i}`" class="track-focus track-more">{{ openText[`h:${app.reference_no}:${i}`] ? 'Show less' : 'Show more' }}</button>
                      </template>
                    </li>
                    <li v-if="details[app.reference_no].history.length === 0" class="text-[13px] text-slate-600">No status changes recorded yet.</li>
                  </ol>
                </div>
                </div>
              </div>
            </div>
          </li>
        </ul>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.track-focus:focus-visible { outline: 3px solid #5e99db; outline-offset: 2px; }
.track-wrap { overflow-wrap: anywhere; }
.track-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; line-height: 1.2; transition: background-color .15s, border-color .15s; }
.track-btn:disabled { opacity: .65; cursor: not-allowed; }
.track-btn-secondary { background: #fff; color: #142b4a; border: 1px solid #cbd5e1; }
.track-btn-secondary:hover { border-color: #245b99; background: #f5f8fc; }
.track-subhead { font-size: 13.5px; font-weight: 600; color: #142b4a; margin-bottom: 8px; }
.track-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 16px; }
.track-facts dt { color: #64748b; }
.track-facts dd { margin: 0; color: #1e293b; overflow-wrap: anywhere; }

/* Reference / submitted / last updated: labelled items in a row; stacked on phones */
.track-meta { display: flex; flex-direction: column; gap: 2px; font-size: 13px; color: #334155; }
.track-meta > div { display: flex; gap: 6px; min-width: 0; }
.track-meta dt { color: #64748b; }
.track-meta dd { margin: 0; }
@media (min-width: 640px) { .track-meta { flex-direction: row; flex-wrap: wrap; gap: 4px 20px; } }

/* Property facts: label above value, laid out across the available width */
.track-props { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 24px; }
.track-props dt { font-size: 12.5px; color: #64748b; }
.track-props dd { margin: 2px 0 0; font-size: 14px; color: #1e293b; overflow-wrap: anywhere; }
.track-props-wide { grid-column: 1 / -1; }
@media (min-width: 900px) { .track-props { grid-template-columns: repeat(4, minmax(0, 1fr)); } }

/* Long remarks: clamp to a few lines until "Show more" is pressed */
.track-clamp-2, .track-clamp-4 { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
.track-clamp-2 { -webkit-line-clamp: 2; line-clamp: 2; }
.track-clamp-4 { -webkit-line-clamp: 4; line-clamp: 4; }
.track-more { margin-top: 4px; padding: 2px 0; border-radius: 4px; font-size: 13px; font-weight: 600; color: #245b99; text-decoration: underline; text-underline-offset: 2px; }
.track-more:hover { color: #142b4a; }

/* Status badges: colours for this page only (STATUS_INFO.badge is shared with admin screens) */
.track-badge { display: inline-flex; align-items: center; gap: 6px; padding: 1px 10px 1px 8px; border: 1px solid; border-radius: 999px; font-size: 12.5px; font-weight: 600; line-height: 1.6; white-space: nowrap; }
.track-badge::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: none; }
.tone-submitted { color: #1d4ed8; background: #eff6ff; border-color: #bfdbfe; }
.tone-review { color: #5b21b6; background: #f5f3ff; border-color: #ddd6fe; }
.tone-revision { color: #92400e; background: #fffbeb; border-color: #fcd34d; }
.tone-resubmitted { color: #0e7490; background: #ecfeff; border-color: #a5f3fc; }
.tone-approved { color: #166534; background: #f0fdf4; border-color: #bbf7d0; }
.tone-active { color: #fff; background: #15803d; border-color: #15803d; }
.tone-rejected { color: #b91c1c; background: #fef2f2; border-color: #fecaca; }
.tone-neutral { color: #475569; background: #f1f5f9; border-color: #e2e8f0; }

/* Header banner */
.track-hero { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; padding: 16px 20px; border-radius: 18px; background: linear-gradient(120deg, #142b4a 0%, #1e4a8d 60%, #2f6fc0 100%); box-shadow: 0 10px 30px rgba(20, 43, 74, .18); }
.track-hero-logo { width: 46px; height: 46px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 14px; background: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, .15); }
.track-hero-btn { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, .35); background: rgba(255, 255, 255, .1); color: #fff; font-size: 13px; font-weight: 600; transition: background .15s; }
.track-hero-btn:hover { background: rgba(255, 255, 255, .22); }

/* "Application submitted" ticket */
.track-ticket { margin-bottom: 20px; background: #fff; border: 1px solid #bbf7d0; border-radius: 18px; overflow: hidden; box-shadow: 0 6px 20px rgba(22, 163, 74, .08); }
.track-ticket-head { display: flex; align-items: center; gap: 12px; padding: 14px 20px; background: linear-gradient(90deg, #ecfdf5, #f0fdf4); border-bottom: 1px dashed #86efac; }
.track-ticket-icon { width: 38px; height: 38px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 999px; background: #16a34a; color: #fff; font-size: 16px; box-shadow: 0 0 0 5px #dcfce7; }
.track-ticket-body { display: grid; gap: 18px; padding: 18px 20px; }
@media (min-width: 720px) { .track-ticket-body { grid-template-columns: minmax(220px, 280px) minmax(0, 1fr); align-items: start; } }
.track-ref { padding: 14px 16px; border: 2px dashed #cbd5e1; border-radius: 14px; background: #f8fafc; }
.track-facts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 0; }
.track-facts-grid > div { padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 12px; }
.track-facts-grid dt { font-size: 12px; font-weight: 600; color: #64748b; }
.track-facts-grid dt i { margin-right: 4px; color: #94a3b8; }
.track-facts-grid dd { margin: 4px 0 0; font-size: 14px; font-weight: 600; color: #142b4a; overflow-wrap: anywhere; }
.track-tip { display: flex; gap: 8px; margin: 12px 0 0; padding: 10px 12px; border-radius: 12px; background: #fffbeb; color: #78350f; font-size: 13px; line-height: 1.55; }
.track-tip i { margin-top: 3px; color: #d97706; }

/* Side by side on wide screens: submitted ticket (left), applicant + applications (right) */
.track-layout.has-side { display: grid; gap: 20px; align-items: start; }
@media (min-width: 1024px) {
  .track-layout.has-side { grid-template-columns: minmax(300px, 380px) minmax(0, 1fr); }
  .track-side { position: sticky; top: 20px; margin-bottom: 0; }
}
.track-ticket-body.is-stacked { grid-template-columns: minmax(0, 1fr) !important; }

/* Applicant profile */
.track-profile { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; padding: 14px 18px; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; }
@media (min-width: 640px) { .track-profile { flex-direction: row; align-items: center; justify-content: space-between; } }
.track-avatar { width: 46px; height: 46px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 999px; background: linear-gradient(135deg, #2f6fc0, #1e4a8d); color: #fff; font-size: 16px; font-weight: 700; }
.track-list-title { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font-size: 14px; font-weight: 700; color: #142b4a; }
.track-list-title i { color: #245b99; }
.track-list-title span { padding: 0 8px; border-radius: 999px; background: #e2e8f0; color: #334155; font-size: 12px; line-height: 20px; }

/* Application card: coloured edge by status */
.track-app { position: relative; background: #fff !important; border: 1px solid #e2e8f0 !important; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 10px rgba(15, 23, 42, .04); transition: box-shadow .15s; }
.track-app:hover { box-shadow: 0 8px 24px rgba(15, 23, 42, .08); }
.track-app::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: currentColor; }
.track-app > * { color: #243449; }
.track-app.tone-active::before { background: #15803d; }
.track-app-icon { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; background: #eff6ff; color: #1e4a8d; font-size: 13px; }

/* Progress tracker */
.track-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0 16px 16px; padding: 14px 8px 10px; list-style: none; background: #f8fafc; border: 1px solid #eef2f7; border-radius: 14px; }
@media (min-width: 640px) { .track-steps { margin: 0 20px 18px; } }
.track-step { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.track-step:not(:last-child)::after { content: ""; position: absolute; top: 15px; left: calc(50% + 20px); right: calc(-50% + 20px); height: 3px; border-radius: 3px; background: #e2e8f0; }
.track-step.is-done:not(:last-child)::after { background: #16a34a; }
.track-step-dot { position: relative; z-index: 1; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 999px; font-size: 13px; background: #fff; border: 2px solid #e2e8f0; color: #94a3b8; }
.track-step-label { font-size: 12px; font-weight: 600; color: #94a3b8; line-height: 1.3; }
.track-step.is-done .track-step-dot { background: #16a34a; border-color: #16a34a; color: #fff; }
.track-step.is-done .track-step-label { color: #15803d; }
.track-step.is-current .track-step-dot { background: #1e4a8d; border-color: #1e4a8d; color: #fff; box-shadow: 0 0 0 4px #dbeafe; }
.track-step.is-current .track-step-label { color: #1e4a8d; }
.track-step.is-warning .track-step-dot { background: #d97706; border-color: #d97706; color: #fff; box-shadow: 0 0 0 4px #fef3c7; }
.track-step.is-warning .track-step-label { color: #b45309; }
.track-step.is-failed .track-step-dot { background: #dc2626; border-color: #dc2626; color: #fff; box-shadow: 0 0 0 4px #fee2e2; }
.track-step.is-failed .track-step-label { color: #b91c1c; }

/* Status history */
.track-timeline { border-left: 2px solid #e2e8f0; padding-left: 18px; margin-left: 5px; display: grid; gap: 10px; }
.track-dot { position: absolute; left: -25px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 2px solid #245b99; }
.track-timeline > li:last-child .track-dot { background: #245b99; }
</style>
