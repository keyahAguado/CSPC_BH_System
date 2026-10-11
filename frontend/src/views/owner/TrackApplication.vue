<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import axios from 'axios';
import { getImageUrl } from '../../config/api.js';
import { applicantToken, setApplicantToken, clearApplicantToken, applicantHeaders, STATUS_INFO, formatDate } from '../../utils/applicantSession.js';

const router = useRouter();
const route = useRoute();

// Shown after the register / edit page sends the applicant here.
const submittedRef = typeof route.query.submitted === 'string' ? route.query.submitted : '';
const updatedRef = typeof route.query.updated === 'string' ? route.query.updated : '';
const updatedStatus = typeof route.query.status === 'string' ? route.query.status : '';
const referenceCopied = ref(false);
const copyReference = async () => {
  try { await navigator.clipboard.writeText(submittedRef); referenceCopied.value = true; } catch { referenceCopied.value = false; }
};

const referenceNo = ref(submittedRef || updatedRef || '');
const isVerifying = ref(false);
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
  if (!applicantToken()) return;
  isLoading.value = true;
  try {
    const { data } = await axios.get('/api/applications/mine', { headers: applicantHeaders() });
    applicant.value = data.applicant;
    applications.value = data.applications || [];
  } catch (err) {
    if (!sessionExpired(err)) errorMsg.value = err.response?.data?.message || 'We could not load your applications. Please try again.';
  } finally {
    isLoading.value = false;
  }
};

const verify = async () => {
  errorMsg.value = '';
  if (!referenceNo.value.trim()) {
    errorMsg.value = 'Enter your reference number.';
    return;
  }
  isVerifying.value = true;
  try {
    const { data } = await axios.post('/api/applications/access', { reference_no: referenceNo.value.trim() });
    setApplicantToken(data.token);
    await loadApplications();
  } catch (err) {
    errorMsg.value = err.response?.data?.message || 'We could not verify your application. Please try again.';
  } finally {
    isVerifying.value = false;
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
  if (!expanded.value[ref] || details.value[ref]) return;
  try {
    const { data } = await axios.get(`/api/applications/${encodeURIComponent(ref)}`, { headers: applicantHeaders() });
    details.value[ref] = data;
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

const editLabel = (status) => (status === 'REVISION_REQUIRED' ? 'Respond to revision request' : 'Edit application');

onMounted(loadApplications);
</script>

<template>
  <div class="min-h-screen bg-[#f4f7fb] font-sans text-[#243449]">
    <main class="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <header class="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-5 py-3 mb-4">
        <router-link to="/" class="flex items-center gap-3 min-w-0">
          <img src="/img/CSPC_logo.png" alt="" class="w-10 h-10 object-contain" />
          <h1 class="text-lg sm:text-xl font-bold text-[#142b4a] truncate">Track My Application</h1>
        </router-link>
        <button v-if="signedIn" type="button" @click="signOut" class="text-[13px] font-semibold text-slate-500 hover:text-red-600 px-3 py-2 rounded-lg">
          <i class="fa-solid fa-right-from-bracket mr-1" aria-hidden="true"></i>Sign out
        </button>
      </header>

      <div v-if="submittedRef && signedIn" role="status" class="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-bold text-emerald-800"><i class="fa-solid fa-circle-check mr-1.5" aria-hidden="true"></i>Application submitted</p>
          <p class="text-[13px] text-emerald-900 mt-0.5">Your reference number is <strong class="font-mono tracking-wider select-all">{{ submittedRef }}</strong>. Save it — it is all you need to come back here.</p>
        </div>
        <button type="button" @click="copyReference" class="shrink-0 bg-white border border-emerald-300 hover:border-emerald-500 text-emerald-800 text-[13px] font-semibold rounded-lg px-4 py-2">
          <i :class="['fa-solid mr-1', referenceCopied ? 'fa-check' : 'fa-copy']" aria-hidden="true"></i>{{ referenceCopied ? 'Copied' : 'Copy reference' }}
        </button>
      </div>
      <div v-if="updatedRef && signedIn" role="status" class="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 text-[13px] text-emerald-900">
        <i class="fa-solid fa-circle-check mr-1.5" aria-hidden="true"></i>{{ updatedStatus === 'RESUBMITTED' ? 'Your revision was resubmitted to SASO for' : 'Your changes were saved for' }} <strong>{{ updatedRef }}</strong>.
      </div>

      <div v-if="errorMsg" role="alert" class="mb-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-sm font-semibold">
        <i class="fa-solid fa-triangle-exclamation mr-2" aria-hidden="true"></i>{{ errorMsg }}
      </div>

      <!-- Verify access -->
      <section v-if="!signedIn && !isLoading" class="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 max-w-lg mx-auto">
        <h2 class="text-lg font-bold text-[#142b4a]">Open your applications</h2>
        <p class="text-sm text-slate-500 mt-1 mb-5">Enter the reference number you received when you submitted your application. No owner account is needed.</p>
        <form @submit.prevent="verify" class="space-y-4" novalidate>
          <div>
            <label for="track-reference" class="block text-[13px] font-semibold text-slate-600 mb-1.5">Reference number</label>
            <input id="track-reference" v-model="referenceNo" type="text" autocomplete="off" placeholder="BH-2026-00001"
              class="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2.5 text-sm font-semibold uppercase focus:bg-white focus:border-blue-500 outline-none" />
          </div>
          <button type="submit" :disabled="isVerifying" class="w-full bg-[#1e4a8d] hover:bg-[#163870] text-white font-semibold rounded-lg py-3 text-sm disabled:opacity-60">
            {{ isVerifying ? 'Verifying…' : 'View my applications' }}
          </button>
        </form>
        <p class="text-[12px] text-slate-400 mt-5">Lost your reference number? Contact SASO with your name and mobile number.
          Don't have an application yet? <router-link to="/register" class="text-blue-600 font-semibold hover:underline">Register your property</router-link>.</p>
      </section>

      <div v-if="isLoading" class="text-center text-slate-500 text-sm py-16" role="status">
        <i class="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i>Loading your applications…
      </div>

      <!-- Dashboard -->
      <template v-if="signedIn && !isLoading">
        <section class="bg-white border border-slate-200 rounded-xl px-5 py-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="font-bold text-[#142b4a] truncate">{{ applicant.name }}</p>
            <p v-if="applicant.email" class="text-[13px] text-slate-500 truncate">{{ applicant.email }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button v-if="applicant.account_status === 'ACCOUNT_PENDING'" type="button" @click="startActivation" :disabled="activation.loading"
              class="bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold rounded-lg px-4 py-2.5 disabled:opacity-60">
              <i class="fa-solid fa-user-check mr-1.5" aria-hidden="true"></i>{{ activation.loading ? 'Preparing…' : 'Activate owner account' }}
            </button>
            <router-link v-if="applicant.account_status === 'ACTIVE'" to="/login" class="bg-[#1e4a8d] hover:bg-[#163870] text-white text-[13px] font-semibold rounded-lg px-4 py-2.5">
              <i class="fa-solid fa-right-to-bracket mr-1.5" aria-hidden="true"></i>Log in to owner dashboard
            </router-link>
            <router-link v-if="canAddProperty" to="/register?add=1" class="bg-white border border-slate-300 hover:border-blue-500 text-[#1e4a8d] text-[13px] font-semibold rounded-lg px-4 py-2.5">
              <i class="fa-solid fa-plus mr-1.5" aria-hidden="true"></i>Add another property
            </router-link>
          </div>
        </section>
        <p v-if="activation.error" class="mb-4 text-sm font-semibold text-rose-600">{{ activation.error }}</p>
        <p v-if="applicant.account_status === 'ACCOUNT_PENDING'" class="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm">
          <i class="fa-solid fa-circle-check mr-1.5" aria-hidden="true"></i>SASO approved your application. Activate your owner account to set your password and manage your property.
        </p>

        <section v-if="applications.length === 0" class="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-500">
          <i class="fa-regular fa-folder-open text-3xl mb-3" aria-hidden="true"></i>
          <p class="font-semibold">No applications yet.</p>
        </section>

        <ul class="space-y-3">
          <li v-for="app in applications" :key="app.reference_no || app.name" class="bg-white border border-slate-200 rounded-xl">
            <div class="px-5 py-4 flex flex-col md:flex-row md:items-center gap-3 justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="font-bold text-[#142b4a] truncate">{{ app.name }}</h2>
                  <span :class="['text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full', STATUS_INFO[app.status]?.badge || 'bg-slate-100 text-slate-600']">{{ STATUS_INFO[app.status]?.label || app.status }}</span>
                </div>
                <p class="text-[13px] text-slate-500 mt-1">
                  <span class="font-semibold text-slate-700">{{ app.reference_no || 'Reference pending' }}</span>
                  · Submitted {{ formatDate(app.submitted_at) }} · Updated {{ formatDate(app.updated_at) }}
                </p>
                <p class="text-[13px] text-slate-500 mt-1">{{ STATUS_INFO[app.status]?.hint }}</p>
              </div>
              <div class="flex flex-wrap gap-2 shrink-0">
                <button type="button" @click="toggleDetails(app)" :aria-expanded="Boolean(expanded[app.reference_no])"
                  class="border border-slate-300 hover:border-blue-500 text-slate-700 text-[13px] font-semibold rounded-lg px-3 py-2">
                  <i :class="['fa-solid mr-1', expanded[app.reference_no] ? 'fa-chevron-up' : 'fa-clock-rotate-left']" aria-hidden="true"></i>{{ expanded[app.reference_no] ? 'Hide details' : 'View details & status' }}
                </button>
                <router-link v-if="app.editable" :to="`/register?edit=${encodeURIComponent(app.reference_no)}`"
                  :class="['text-[13px] font-semibold rounded-lg px-3 py-2', app.status === 'REVISION_REQUIRED' ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-[#1e4a8d] hover:bg-[#163870] text-white']">
                  <i class="fa-solid fa-pen-to-square mr-1" aria-hidden="true"></i>{{ editLabel(app.status) }}
                </router-link>
              </div>
            </div>
            <div v-if="app.remarks" class="mx-5 mb-4 rounded-lg px-4 py-3 text-sm" :class="app.status === 'REJECTED' ? 'bg-rose-50 border border-rose-200 text-rose-800' : 'bg-amber-50 border border-amber-200 text-amber-900'">
              <p class="font-semibold text-[12px] uppercase tracking-wide mb-1">SASO remarks</p>
              <p class="whitespace-pre-line">{{ app.remarks }}</p>
            </div>

            <div v-if="expanded[app.reference_no]" class="border-t border-slate-100 px-5 py-4">
              <p v-if="!details[app.reference_no]" class="text-sm text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-1" aria-hidden="true"></i>Loading…</p>
              <p v-else-if="details[app.reference_no].error" class="text-sm text-rose-600">{{ details[app.reference_no].error }}</p>
              <div v-else class="grid md:grid-cols-2 gap-5">
                <div class="flex gap-3 min-w-0">
                  <img v-if="details[app.reference_no].application.img" :src="getImageUrl(details[app.reference_no].application.img)" alt="Featured property photo" class="w-28 h-20 object-cover rounded-lg border border-slate-200 shrink-0" />
                  <dl class="text-[13px] space-y-1 min-w-0">
                    <div><dt class="inline text-slate-500">Address: </dt><dd class="inline font-semibold">{{ details[app.reference_no].application.location || '—' }}</dd></div>
                    <div><dt class="inline text-slate-500">Monthly rent: </dt><dd class="inline font-semibold">₱{{ Number(details[app.reference_no].application.price || 0).toLocaleString() }}</dd></div>
                    <div><dt class="inline text-slate-500">Photos: </dt><dd class="inline font-semibold">{{ details[app.reference_no].photos.length }}</dd></div>
                    <div><dt class="inline text-slate-500">Document files: </dt><dd class="inline font-semibold">{{ details[app.reference_no].permitFiles.length }}</dd></div>
                  </dl>
                </div>
                <div>
                  <h3 class="text-[12px] font-bold uppercase tracking-wide text-slate-500 mb-2">Status history</h3>
                  <ol class="border-l-2 border-slate-200 pl-4 space-y-2.5">
                    <li v-for="(h, i) in details[app.reference_no].history" :key="i" class="relative">
                      <span class="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-[#1e4a8d]" aria-hidden="true"></span>
                      <p class="text-[13px] font-semibold text-[#142b4a]">{{ STATUS_INFO[h.status]?.label || h.status }} <span class="font-normal text-slate-400">· {{ formatDate(h.created_at, true) }}</span></p>
                      <p v-if="h.remarks" class="text-[12px] text-slate-500 whitespace-pre-line">{{ h.remarks }}</p>
                    </li>
                    <li v-if="details[app.reference_no].history.length === 0" class="text-[13px] text-slate-500">No status changes recorded yet.</li>
                  </ol>
                </div>
              </div>
            </div>
          </li>
        </ul>
      </template>
    </main>
  </div>
</template>
