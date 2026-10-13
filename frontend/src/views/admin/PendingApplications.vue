<script setup>
import TablePager from '../../components/management/TablePager.vue';
import LoadError from '../../components/management/LoadError.vue';

import PageHeader from '../../components/management/PageHeader.vue';
import '../../styles/management.css';
import { vManagementDialog } from '../../components/management/dialogAccessibility.js';
import { validateInput } from '../../utils/inputValidation.js';
import { computed, watch, ref, onMounted } from 'vue';
import axios from 'axios';
import AdminNav from '../../components/partials/AdminNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';
import { downloadOriginalFile } from '../../utils/downloadHelper';
import { getImageUrl } from '../../config/api';
import { STATUS_INFO, formatDate as formatStatusDate } from '../../utils/applicantSession.js';

// State Variables
const applications = ref([]);
const criteria = ref([]);
const dynamicDocs = ref([]);
const permitFiles = ref([]);
const checklistResults = ref([]);
const isLoading = ref(true);

// Modal states
const showDocModal = ref(false);
const showChecklistModal = ref(false);
const showPreviewModal = ref(false);

const showAddCriteriaModal = ref(false);
const showUpdateCriteriaModal = ref(false);
const showDeleteCriteriaModal = ref(false);
const showEditItemModal = ref(false);

// Custom confirmation modals 
const showApproveConfirmModal = ref(false);
// Property-first registration: one-time owner account activation link issued on approval
const issuedCredentials = ref(null);
const credentialsCopied = ref(false);
// Track My Application workflow
const rejectDecision = ref('revision');
const applicationHistory = ref([]);
const showRejectConfirmModal = ref(false);
const showDeleteCriteriaConfirmModal = ref(false);
const pendingDeleteCriteriaId = ref(null);

// Active objects
const activeApp = ref(null);
const checkedChecklist = ref({});
const adminCommentsInput = ref('');
const isSubmitting = ref(false);
const previewImageUrl = ref('');
const isDownloading = ref(false);

const downloadOriginal = () => {
  if (!previewImageUrl.value) return;
  downloadOriginalFile(
    previewImageUrl.value,
    token,
    () => { isDownloading.value = true; },
    () => { isDownloading.value = false; },
    (err) => {
      console.error('Download failed:', err);
      showSystemAlert('Failed to download document file.', 'error');
    }
  );
};

// Criteria management
const newCriteriaLabel = ref('');
const editCriteriaId = ref(null);
const editCriteriaLabel = ref('');

const alertRef = ref(null);
const token = sessionStorage.getItem('cspc_token');
const API = import.meta.env.VITE_API_URL;

const showSystemAlert = (message, type = 'error') => {
  if (alertRef.value) alertRef.value.showSystemAlert(message, type);
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return 'N/A';
  }
};

// ─── Self-Healing Checklist State Synchronizer ───
const syncChecklistState = () => {
  if (!activeApp.value) return;
  criteria.value.forEach(c => {
    if (checkedChecklist.value[c.id] === undefined) {
      const isVerified = checklistResults.value.some(
        r => r.house_id === activeApp.value.id && r.criteria_id === c.id && r.is_verified === 1
      );
      checkedChecklist.value[c.id] = isVerified && !(activeApp.value.document_update_pending && isDocumentItemUpdated(c));
    }
  });
};

const fetchPendingApplications = async () => {
  loadError.value = '';
  try {
    isLoading.value = true;
    const response = await axios.get(`/api/admin/pending-applications`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      applications.value = response.data.applications || [];
      criteria.value = response.data.criteria || [];
      dynamicDocs.value = response.data.dynamicDocs || [];
      permitFiles.value = response.data.permitFiles || [];
      checklistResults.value = response.data.checklistResults || [];
      syncChecklistState();
    }
  } catch (error) {
    loadError.value = 'The server did not return these records. Refresh the page to try again.';
    console.error(error);
    showSystemAlert('Could not load pending applications records.', 'warning');
  } finally {
    isLoading.value = false;
  }
};

const openDocumentModal = (app) => {
  activeApp.value = app;
  showDocModal.value = true;
};

const closeDocumentModal = () => {
  showDocModal.value = false;
  activeApp.value = null;
};

const openChecklistModal = (app) => {
  activeApp.value = app;
  adminCommentsInput.value = app.admin_comments || '';
  
  checkedChecklist.value = {};
  criteria.value.forEach(c => {
    const isVerified = checklistResults.value.some(
      r => r.house_id === app.id && r.criteria_id === c.id && r.is_verified === 1
    );
    checkedChecklist.value[c.id] = isVerified;

    if (app.document_update_pending && isDocumentItemUpdated(c)) {
      checkedChecklist.value[c.id] = false;
    }
  });

  showChecklistModal.value = true;
  rejectDecision.value = 'revision';
  startReviewIfNeeded(app).then(() => loadApplicationHistory(app));
};

const closeChecklistModal = () => {
  showChecklistModal.value = false;
  activeApp.value = null;
  adminCommentsInput.value = '';
};

// Legal documents can be PDF: open those in a new tab instead of the image preview.
const isPdfFile = (url) => /\.pdf($|[?#])/i.test(String(url || ''));
// Every file submitted for a legal document; falls back to the single permit column.
const getPermitFiles = (app, key) => {
  if (!app || !key) return [];
  const list = permitFiles.value.filter(f => f.house_id === app.id && f.permit_key === key).map(f => f.file_path);
  return list.length ? list : (app[key] ? [app[key]] : []);
};

// Full-screen document viewer: images fit the screen (click to zoom to actual size); PDFs show inline
const previewZoomed = ref(false);
// A document can have several files: the viewer pages through them (1 of 3) with Previous / Next.
const previewFiles = ref([]);
const previewIndex = ref(0);
const openPreview = (url) => {
  if (!url || url.endsWith('#')) return;
  previewFiles.value = [url];
  previewIndex.value = 0;
  previewImageUrl.value = url;
  previewZoomed.value = false;
  showPreviewModal.value = true;
};
const openPreviewSet = (files) => {
  const urls = files.map(f => getImageUrl(f)).filter(u => u && !u.endsWith('#'));
  if (!urls.length) return;
  previewFiles.value = urls;
  previewIndex.value = 0;
  previewImageUrl.value = urls[0];
  previewZoomed.value = false;
  showPreviewModal.value = true;
};
const stepPreview = (direction) => {
  const count = previewFiles.value.length;
  if (count < 2) return;
  previewIndex.value = (previewIndex.value + direction + count) % count;
  previewImageUrl.value = previewFiles.value[previewIndex.value];
  previewZoomed.value = false;
};

const closePreview = () => {
  showPreviewModal.value = false;
  previewImageUrl.value = '';
  previewZoomed.value = false;
  previewFiles.value = [];
  previewIndex.value = 0;
};

const getFilteredCriteria = () => {
  if (!activeApp.value) return [];
  const list = criteria.value.filter(c => !c.house_id || c.house_id === activeApp.value.id);
  const mandatoryOrder = {
    'permit_business_form': 1,
    'permit_barangay': 2,
    'permit_fire': 3,
    'permit_sanitary': 4,
    'permit_cedula': 5,
    'permit_dti': 6,
    'permit_building': 7,
    'permit_zoning': 8
  };
  return list.sort((a, b) => {
    const orderA = a.permit_key ? (mandatoryOrder[a.permit_key] || 90) : 99;
    const orderB = b.permit_key ? (mandatoryOrder[b.permit_key] || 90) : 99;
    return orderA - orderB;
  });
};

const getActiveHouseDynamicDocs = () => {
  if (!activeApp.value) return [];
  return dynamicDocs.value.filter(d => d.house_id === activeApp.value.id);
};

// ================= DECISION SUBMISSIONS =================

const REQUIRED_PERMIT_KEYS = ['permit_business_form', 'permit_barangay', 'permit_fire', 'permit_sanitary'];

// Returns true if this checklist item is a required document that hasn't been verified yet
const isRequiredAndUnchecked = (item) => {
  if (!item.permit_key) return false;
  if (!REQUIRED_PERMIT_KEYS.includes(item.permit_key)) return false;
  return !checkedChecklist.value[item.id];
};

// Required docs approval gate — shows a dedicated modal instead of flash alert
const showRequiredDocsModal = ref(false);
const uncheckedRequiredDocs = ref([]);

const handleApprove = () => {
  if (!activeApp.value) return;

  const requiredCriteria = criteria.value.filter(
    c => !c.house_id && REQUIRED_PERMIT_KEYS.includes(c.permit_key)
  );

  const unchecked = requiredCriteria.filter(c => !checkedChecklist.value[c.id]);

  if (unchecked.length > 0) {
    uncheckedRequiredDocs.value = unchecked;
    showRequiredDocsModal.value = true;
    return;
  }

  showApproveConfirmModal.value = true;
};

const execApprove = async () => {
  showApproveConfirmModal.value = false;
  if (!activeApp.value) return;
  try {
    isSubmitting.value = true;

    const checkedIds = Object.keys(checkedChecklist.value)
      .filter(key => checkedChecklist.value[key])
      .map(Number);

    const res = await axios.post(`/api/admin/approve/${activeApp.value.id}`, {
      checklist: checkedIds,
      admin_comments: adminCommentsInput.value
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.data.success) {
      showSystemAlert('Boarding house accredited successfully!', 'success');
      closeChecklistModal();
      if (res.data.activation) {
        issuedCredentials.value = res.data.activation;
        credentialsCopied.value = false;
      }
      await fetchPendingApplications();
    }
  } catch (err) {
    console.error(err);
    showSystemAlert(err.response?.data?.message || 'Accreditation approval failed.', 'error');
  } finally {
    isSubmitting.value = false;
  }
};


const copyCredentials = async () => {
  if (!issuedCredentials.value) return;
  try {
    await navigator.clipboard.writeText(issuedCredentials.value.reference_no);
    credentialsCopied.value = true;
  } catch {
    showSystemAlert('Could not copy automatically. Please select and copy the details manually.', 'warning');
  }
};

const closeCredentialsModal = () => {
  issuedCredentials.value = null;
  credentialsCopied.value = false;
};

// Opening a submitted application starts SASO's review, which locks applicant edits.
const startReviewIfNeeded = async (app) => {
  if (!['SUBMITTED', 'RESUBMITTED'].includes(app.application_status)) return;
  try {
    const { data } = await axios.post(`/api/admin/applications/${app.id}/start-review`, {}, { headers: { Authorization: `Bearer ${token}` } });
    if (data.success && data.status) app.application_status = data.status;
  } catch (err) {
    console.error('Could not mark the application as under review:', err);
  }
};

const loadApplicationHistory = async (app) => {
  applicationHistory.value = [];
  if (!app.application_status) return;
  try {
    const { data } = await axios.get(`/api/admin/applications/${app.id}/history`, { headers: { Authorization: `Bearer ${token}` } });
    applicationHistory.value = data.history || [];
  } catch (err) {
    console.error('Could not load the application history:', err);
  }
};


const handleReject = () => {
  if (!activeApp.value) return;
  if (!adminCommentsInput.value.trim()) {
    showSystemAlert('Please provide constructive feedback or a reason for rejection so the owner knows what to correct.', 'warning');
    return;
  }
  showRejectConfirmModal.value = true;
};

const execReject = async () => {
  showRejectConfirmModal.value = false;
  if (!activeApp.value) return;
  try {
    isSubmitting.value = true;
    const res = await axios.post(`/api/admin/reject/${activeApp.value.id}`, {
      admin_comments: adminCommentsInput.value,
      decision: activeApp.value.application_status ? rejectDecision.value : 'revision'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.data.success) {
      showSystemAlert(rejectDecision.value === 'reject' && activeApp.value.application_status ? 'Application rejected.' : 'Revision requested. Feedback sent to the applicant.', 'warning');
      closeChecklistModal();
      await fetchPendingApplications();
    }
  } catch (err) {
    console.error(err);
    showSystemAlert(err.response?.data?.message || 'Rejection submit failed.', 'error');
  } finally {
    isSubmitting.value = false;
  }
};

const submitAddCriteria = async () => {
  const inputError = validateInput('criterion', { label: newCriteriaLabel.value });
  if (inputError) { showSystemAlert(inputError, 'error'); return; }
  if (!newCriteriaLabel.value.trim() || !activeApp.value) return;
  try {
    const res = await axios.post(`/api/admin/criteria/add`, {
      label: newCriteriaLabel.value,
      house_id: activeApp.value.id
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.data.success) {
      newCriteriaLabel.value = '';
      showAddCriteriaModal.value = false;
      showSystemAlert('Custom requirement added successfully!', 'success');
      await fetchPendingApplications();
    }
  } catch (err) { 
    console.error(err); 
    showSystemAlert(err.response?.data?.message || 'Failed to add criteria.', 'error');
  }
};

const submitDeleteCriteria = (id) => {
  pendingDeleteCriteriaId.value = id;
  showDeleteCriteriaConfirmModal.value = true;
};

const execDeleteCriteria = async () => {
  showDeleteCriteriaConfirmModal.value = false;
  const id = pendingDeleteCriteriaId.value;
  pendingDeleteCriteriaId.value = null;
  if (!id) return;
  try {
    const res = await axios.post(`/api/admin/criteria/delete/${id}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data.success) {
      delete checkedChecklist.value[id];
      showSystemAlert('Custom criteria removed successfully.', 'success');
      showDeleteCriteriaModal.value = false;
      await fetchPendingApplications();
    }
  } catch (err) {
    console.error(err);
    showSystemAlert(err.response?.data?.message || 'Failed to remove criteria.', 'error');
  }
};

const startEditCriteria = (id, currentLabel) => {
  editCriteriaId.value = id;
  editCriteriaLabel.value = currentLabel;
  showUpdateCriteriaModal.value = false;
  showEditItemModal.value = true;
};

const submitUpdateCriteria = async () => {
  const inputError = validateInput('criterion', { label: editCriteriaLabel.value });
  if (inputError) { showSystemAlert(inputError, 'error'); return; }
  if (!editCriteriaLabel.value.trim() || !editCriteriaId.value) return;
  try {
    const res = await axios.post(`/api/admin/criteria/update/${editCriteriaId.value}`, {
      label: editCriteriaLabel.value
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data.success) {
      showEditItemModal.value = false;
      showUpdateCriteriaModal.value = true; 
      showSystemAlert('Criteria label updated successfully!', 'success');
      await fetchPendingApplications();
    }
  } catch (err) { 
    console.error(err); 
    showSystemAlert(err.response?.data?.message || 'Failed to update criteria label.', 'error');
  }
};

const isDocumentItemUpdated = (item) => {
  if (!activeApp.value || !activeApp.value.last_updated_document) {
    return false;
  }
  const updatedList = String(activeApp.value.last_updated_document).split(',').map(s => s.trim());
  const permitKey = item.permit_key;
  const itemId = String(item.id);
  return (permitKey && updatedList.includes(permitKey)) || updatedList.includes(itemId);
};

// Show rechecks for pending document updates or application resubmissions.
// Archive wording requires an archived state or recognized archive provenance.
const getDocRecheckBadge = (app) => {
  if (!app.document_update_pending && !app.is_resubmission) return null;

  if (app.house_status === 'accredited') {
    return { label: 'DOCUMENT RECHECK — ALREADY ACCREDITED', color: 'text-amber-600' };
  }

  if (app.house_status === 'archived' || ['owner', 'system', 'admin'].includes(app.archived_by)) {
    return { label: 'DOCUMENT RECHECK — PREVIOUSLY ARCHIVED', color: 'text-amber-600' };
  }

  return { label: 'DOCUMENT RECHECK', color: 'text-amber-600' };
};

// ─── New applications list: type, status, filters, paging ───
// Application type: an accredited/archived house sending new files is a document update;
// a returned application sent back is a resubmission; everything else is a new registration.
const appType = (app) => {
  if (app.document_update_pending && app.house_status !== 'pending') return { key: 'update', label: 'Document update' };
  if (app.is_resubmission || app.application_status === 'RESUBMITTED') return { key: 'resubmission', label: 'Resubmission' };
  return { key: 'new', label: 'New registration' };
};
const STATUS_TONES = { SUBMITTED: 'blue', UNDER_REVIEW: 'violet', REVISION_REQUIRED: 'amber', RESUBMITTED: 'sky', APPROVED: 'green', ACCOUNT_PENDING: 'green', ACTIVE: 'green', REJECTED: 'rose' };
const appState = (app) => {
  if (appType(app).key === 'update') return { key: 'RECHECK', label: 'Document recheck', tone: 'amber' };
  const key = app.application_status || 'SUBMITTED';
  return { key, label: STATUS_INFO[key]?.label || key, tone: STATUS_TONES[key] || 'blue' };
};
const statusOptions = computed(() => {
  const seen = new Map();
  applications.value.forEach(app => { const st = appState(app); if (!seen.has(st.key)) seen.set(st.key, st); });
  return [...seen.values()];
});
const typeCount = (key) => applications.value.filter(app => appType(app).key === key).length;

const naSearch = ref('');
const naType = ref('all');
const naStatus = ref('all');
const naFrom = ref('');
const naTo = ref('');
const showDateRange = ref(false);
const dateRangeLabel = computed(() => {
  const f = (v) => new Date(v + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (naFrom.value && naTo.value) return `${f(naFrom.value)} – ${f(naTo.value)}`;
  if (naFrom.value) return `From ${f(naFrom.value)}`;
  if (naTo.value) return `Until ${f(naTo.value)}`;
  return 'Select date range';
});
const clearDateRange = () => { naFrom.value = ''; naTo.value = ''; showDateRange.value = false; };
const naPage = ref(1);
const naPerPage = ref(10);
const submittedAt = (app) => new Date(app.resubmitted_at || app.created_at);
const naFiltered = computed(() => {
  const q = naSearch.value.trim().toLowerCase();
  return applications.value.filter(app => {
    if (naType.value !== 'all' && appType(app).key !== naType.value) return false;
    if (naStatus.value !== 'all' && appState(app).key !== naStatus.value) return false;
    if (naFrom.value || naTo.value) {
      const d = submittedAt(app);
      if (Number.isNaN(d.getTime())) return false;
      if (naFrom.value && d < new Date(naFrom.value + 'T00:00:00')) return false;
      if (naTo.value && d > new Date(naTo.value + 'T23:59:59')) return false;
    }
    if (!q) return true;
    return [app.name, app.owner_name, app.reference_no, app.owner_phone, app.owner_email].some(v => String(v || '').toLowerCase().includes(q));
  });
});
const naTotalPages = computed(() => Math.max(1, Math.ceil(naFiltered.value.length / naPerPage.value)));
const naPaged = computed(() => naFiltered.value.slice((naPage.value - 1) * naPerPage.value, naPage.value * naPerPage.value));
const naStart = computed(() => (naFiltered.value.length ? (naPage.value - 1) * naPerPage.value + 1 : 0));
const naEnd = computed(() => Math.min(naPage.value * naPerPage.value, naFiltered.value.length));
watch([naSearch, naType, naStatus, naFrom, naTo], () => { naPage.value = 1; });
const formatDay = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const formatTime = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };

onMounted(() => {
  fetchPendingApplications();
});

const loadError = ref('');
</script>

<template>
  <div class="management-page bg-[#f8fafc] min-h-screen flex flex-col font-sans text-slate-800">
    <AdminNav />
    <div aria-live="polite" aria-atomic="false"><FlashAlert ref="alertRef" /></div>

    <main id="management-content" tabindex="-1" class="max-w-[1450px] mx-auto py-10 px-4 sm:px-6 flex-1 w-full text-left">
      <LoadError :message="loadError" />
      <PageHeader title="New applications" />

      <!-- Loading State -->
      <div v-show="isLoading" class="py-20 flex flex-col items-center justify-center gap-3 bg-white rounded-[2rem] shadow-sm border border-slate-200 p-10 max-w-xl mx-auto text-center">
        <svg class="animate-spin h-10 w-10 text-blue-600 mb-4 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-slate-400 font-bold uppercase text-[12px] tracking-wide">Loading pending submissions...</p>
      </div>

      <div v-show="!isLoading" class="na-body">
        <!-- Summary cards -->
        <dl class="na-tiles">
          <div class="is-primary"><dt><i class="fa-solid fa-file-lines" aria-hidden="true"></i> Active applications</dt><dd>{{ applications.length }}</dd><span class="na-tile-sub">Awaiting SASO action</span></div>
          <div><dt><i class="fa-regular fa-clock" aria-hidden="true"></i> New submissions</dt><dd>{{ typeCount('new') }}</dd><span class="na-tile-sub">Initial applications</span></div>
          <div><dt><i class="fa-solid fa-rotate" aria-hidden="true"></i> Resubmissions &amp; updates</dt><dd>{{ typeCount('resubmission') + typeCount('update') }}</dd><span class="na-tile-sub">Returned or updated documents</span></div>
        </dl>

        <!-- Filters -->
        <div class="na-filters">
          <div class="na-search">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input v-model="naSearch" type="text" aria-label="Search applications" placeholder="Search owner name, boarding house, or reference number..." />
          </div>
          <select v-model="naType" class="na-select" aria-label="Filter by application type">
            <option value="all">All types</option>
            <option value="new">New registration</option>
            <option value="resubmission">Resubmission</option>
            <option value="update">Document update</option>
          </select>
          <select v-model="naStatus" class="na-select" aria-label="Filter by status">
            <option value="all">All statuses</option>
            <option v-for="s in statusOptions" :key="s.key" :value="s.key">{{ s.label }}</option>
          </select>
          <div class="na-range">
            <button type="button" class="na-range-btn" :aria-expanded="showDateRange" @click="showDateRange = !showDateRange">
              <i class="fa-regular fa-calendar" aria-hidden="true"></i>
              <span>{{ dateRangeLabel }}</span>
              <i class="fa-solid fa-chevron-down text-xs" aria-hidden="true"></i>
            </button>
            <div v-if="showDateRange" class="na-range-pop">
              <label><span>From</span><input v-model="naFrom" type="date" :max="naTo || undefined" /></label>
              <label><span>To</span><input v-model="naTo" type="date" :min="naFrom || undefined" /></label>
              <div class="flex justify-between gap-2 pt-1">
                <button type="button" class="na-range-clear" @click="clearDateRange">Clear</button>
                <button type="button" class="na-range-done" @click="showDateRange = false">Done</button>
              </div>
            </div>
          </div>
        </div>

        <!-- LAPTOP / DESKTOP: table -->
        <div class="na-table-card admin-table-card hidden lg:flex lg:flex-col">
          <TablePager position="top" noun="applications" :page="naPage" @update:page="naPage = $event" :total-pages="naTotalPages" :start="naStart" :end="naEnd" :total="naFiltered.length" :per-page="naPerPage" @update:per-page="naPerPage = $event; naPage = 1" />

          <div class="na-scroll">
            <table class="na-table admin-table w-full">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Boarding house<small>Address / reference no.</small></th>
                  <th>Owner / contact</th>
                  <th>Application type</th>
                  <th>Date submitted</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="naPaged.length === 0">
                  <td colspan="7" class="admin-table-empty">{{ applications.length === 0 ? 'No pending applications at the moment.' : 'No applications match these filters.' }}</td>
                </tr>
                <tr v-for="(app, index) in naPaged" :key="app.id">
                  <td class="text-slate-500">{{ naStart + index }}</td>
                  <td>
                    <strong class="admin-table-name">{{ app.name }}</strong>
                    <span class="admin-table-sub">{{ app.barangay ? 'Brgy. ' + app.barangay + ', Nabua, Camarines Sur' : (app.location || '—') }}</span>
                    <span v-if="app.reference_no" class="admin-table-sub">Ref: {{ app.reference_no }}</span>
                  </td>
                  <td>
                    <span class="admin-table-main">{{ app.owner_name }}</span>
                    <span v-if="app.owner_phone" class="admin-table-sub"><i class="fa-solid fa-phone text-slate-500 mr-1.5" aria-hidden="true"></i>{{ app.owner_phone }}</span>
                    <span v-else-if="app.owner_email" class="admin-table-sub"><i class="fa-solid fa-envelope text-slate-500 mr-1.5" aria-hidden="true"></i>{{ app.owner_email }}</span>
                  </td>
                  <td><span :class="['na-type', 'is-' + appType(app).key]">{{ appType(app).label }}</span></td>
                  <td>
                    <span class="block text-slate-800">{{ formatDay(app.resubmitted_at || app.created_at) }}</span>
                    <span class="admin-table-sub">{{ formatTime(app.resubmitted_at || app.created_at) }}</span>
                  </td>
                  <td><span :class="['na-status', 'is-' + appState(app).tone]">{{ appState(app).label }}</span></td>
                  <td>
                    <button @click="openChecklistModal(app)" class="acc-checklist-btn na-action management-button">
                      <i class="fa-solid fa-file-circle-check" aria-hidden="true"></i> Review application
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
                    <TablePager position="bottom" noun="applications" :page="naPage" @update:page="naPage = $event" :total-pages="naTotalPages" :start="naStart" :end="naEnd" :total="naFiltered.length" :per-page="naPerPage" @update:per-page="naPerPage = $event; naPage = 1" />

        </div>

        <!-- PHONE: cards -->
        <div class="lg:hidden mb-3 rounded-2xl border border-slate-200 overflow-hidden">
          <TablePager position="top" noun="applications" :page="naPage" @update:page="naPage = $event" :total-pages="naTotalPages" :start="naStart" :end="naEnd" :total="naFiltered.length" :per-page="naPerPage" @update:per-page="naPerPage = $event; naPage = 1" />
        </div>
        <div class="block lg:hidden space-y-3">
          <div v-if="naPaged.length === 0" class="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500 text-sm font-semibold">{{ applications.length === 0 ? 'No pending applications at the moment.' : 'No applications match these filters.' }}</div>
          <div v-for="(app, index) in naPaged" :key="'m-' + app.id" class="na-mcard">
            <div class="flex justify-between items-start gap-2">
              <div class="min-w-0">
                <span class="text-[12px] text-slate-400 font-semibold">#{{ naStart + index }} · {{ formatDay(app.resubmitted_at || app.created_at) }}</span>
                <strong class="admin-table-name">{{ app.name }}</strong>
                <span v-if="app.reference_no" class="admin-table-sub">Ref: {{ app.reference_no }}</span>
              </div>
              <span :class="['na-status', 'is-' + appState(app).tone]">{{ appState(app).label }}</span>
            </div>
            <p class="text-sm text-slate-700 mt-2">{{ app.owner_name }}<span v-if="app.owner_phone" class="text-slate-500"> · {{ app.owner_phone }}</span></p>
            <div class="flex items-center justify-between gap-2 mt-3">
              <span :class="['na-type', 'is-' + appType(app).key]">{{ appType(app).label }}</span>
              <button @click="openChecklistModal(app)" class="acc-checklist-btn na-action management-button"><i class="fa-solid fa-file-circle-check" aria-hidden="true"></i> Review</button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Document Viewer Modal -->
    <div v-management-dialog="{ close: () => closeDocumentModal() }" v-if="showDocModal && activeApp" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex justify-center items-center p-4 sm:p-8">
      <div class="bg-white w-full max-w-6xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div class="bg-[#2563eb] text-white px-6 sm:px-8 py-5 flex justify-between items-center shrink-0 gap-4">
          <div class="flex items-center gap-3 overflow-hidden">
            <div class="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0"><i class="fa-regular fa-folder-open text-xl"></i></div>
            <h2 class="text-xs sm:text-lg font-semibold uppercase tracking-tight truncate">{{ activeApp.name }} - Legal Documents</h2>
          </div>
          <button aria-label="Close dialog" @click="closeDocumentModal" class="text-white hover:text-red-200 transition flex items-center justify-center h-10 w-10 rounded-full hover:bg-white/10 shrink-0 management-button"><i class="fa-solid fa-xmark text-2xl"></i></button>
        </div>
        <div class="p-6 sm:p-10 overflow-y-auto grow bg-white custom-scrollbar text-left">
          <!-- Section label for required docs -->
          <p class="text-[12px] font-semibold text-rose-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-rose-500 inline-block"></span> Required Documents
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-8">
            <div v-for="p in criteria.filter(c => !c.house_id && ['permit_business_form','permit_barangay','permit_fire','permit_sanitary'].includes(c.permit_key))" :key="p.id"
                 class="bg-white border border-slate-100 rounded-[2rem] shadow-md overflow-hidden flex flex-col group transition hover:shadow-2xl">
              <div v-if="activeApp[p.permit_key]" class="h-56 bg-slate-50 relative p-3">
                <div class="grid h-full gap-2" :class="getPermitFiles(activeApp, p.permit_key).length > 1 ? 'grid-cols-2 auto-rows-[minmax(0,1fr)] overflow-y-auto' : 'grid-cols-1'">
                  <button v-for="(file, i) in getPermitFiles(activeApp, p.permit_key)" :key="file + i" type="button" @click="openPreview(getImageUrl(file))"
                          class="relative rounded-xl overflow-hidden bg-white border border-slate-100 hover:border-blue-400 flex items-center justify-center min-h-0 transition"
                          :aria-label="(isPdfFile(file) ? 'Open PDF ' : 'Preview image ') + (i + 1)">
                    <span v-if="isPdfFile(file)" class="flex flex-col items-center gap-1 text-rose-600"><i class="fa-solid fa-file-pdf text-3xl"></i><span class="text-[11px] font-bold uppercase">PDF</span></span>
                    <img v-else :src="getImageUrl(file)" class="w-full h-full object-contain" alt="" />
                  </button>
                </div>
                <span v-if="getPermitFiles(activeApp, p.permit_key).length > 1" class="absolute top-2 right-2 bg-slate-900/80 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">{{ getPermitFiles(activeApp, p.permit_key).length }} files</span>
              </div>
              <div v-else class="bg-slate-50 border-2 border-dashed border-rose-200 rounded-[2rem] p-10 flex flex-col items-center justify-center text-center h-56">
                <i class="fa-solid fa-file-circle-exclamation text-4xl text-rose-300 mb-4"></i>
                <h3 class="font-semibold text-[12px] text-rose-400 uppercase tracking-wide">Missing</h3>
              </div>
              <div class="p-4 border-t border-slate-50 text-center">
                <h3 class="font-semibold text-[12px] text-slate-800 uppercase tracking-tight leading-snug">{{ p.label }}</h3>
              </div>
            </div>
          </div>

          <!-- Section label for optional docs -->
          <p class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-slate-400 inline-block"></span> Optional Documents
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            <div v-for="p in criteria.filter(c => !c.house_id && !['permit_business_form','permit_barangay','permit_fire','permit_sanitary'].includes(c.permit_key))" :key="p.id"
                 class="bg-white border border-slate-100 rounded-[2rem] shadow-md overflow-hidden flex flex-col group transition hover:shadow-2xl">
              <div v-if="activeApp[p.permit_key]" class="h-56 bg-slate-50 relative p-3">
                <div class="grid h-full gap-2" :class="getPermitFiles(activeApp, p.permit_key).length > 1 ? 'grid-cols-2 auto-rows-[minmax(0,1fr)] overflow-y-auto' : 'grid-cols-1'">
                  <button v-for="(file, i) in getPermitFiles(activeApp, p.permit_key)" :key="file + i" type="button" @click="openPreview(getImageUrl(file))"
                          class="relative rounded-xl overflow-hidden bg-white border border-slate-100 hover:border-blue-400 flex items-center justify-center min-h-0 transition"
                          :aria-label="(isPdfFile(file) ? 'Open PDF ' : 'Preview image ') + (i + 1)">
                    <span v-if="isPdfFile(file)" class="flex flex-col items-center gap-1 text-rose-600"><i class="fa-solid fa-file-pdf text-3xl"></i><span class="text-[11px] font-bold uppercase">PDF</span></span>
                    <img v-else :src="getImageUrl(file)" class="w-full h-full object-contain" alt="" />
                  </button>
                </div>
                <span v-if="getPermitFiles(activeApp, p.permit_key).length > 1" class="absolute top-2 right-2 bg-slate-900/80 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">{{ getPermitFiles(activeApp, p.permit_key).length }} files</span>
              </div>
              <div v-else class="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] p-10 flex flex-col items-center justify-center text-center opacity-60 h-56">
                <i class="fa-solid fa-file-circle-exclamation text-4xl text-slate-300 mb-4"></i>
                <h3 class="font-semibold text-[12px] text-slate-400 uppercase tracking-wide">Not Submitted</h3>
              </div>
              <div class="p-4 border-t border-slate-50 text-center">
                <h3 class="font-semibold text-[12px] text-slate-800 uppercase tracking-tight leading-snug">{{ p.label }}</h3>
              </div>
            </div>

            <!-- Facade Image -->
            <div class="bg-white border border-slate-100 rounded-[2rem] shadow-md overflow-hidden flex flex-col group transition hover:shadow-2xl">
              <div v-if="activeApp.img" class="h-56 bg-slate-50 relative flex items-center justify-center p-6">
                <img :src="getImageUrl(activeApp.img)" class="w-full h-full object-contain filter group-hover:scale-110 transition duration-500" />
                <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                  <button @click="openPreview(getImageUrl(activeApp.img))" class="bg-white text-slate-900 px-6 py-2.5 rounded-full text-[12px] font-semibold uppercase tracking-wide shadow-lg management-button">Preview</button>
                </div>
              </div>
              <div v-else class="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] p-10 flex flex-col items-center justify-center text-center opacity-60 h-56">
                <i class="fa-solid fa-image text-4xl text-slate-300 mb-4"></i>
              </div>
              <div class="p-4 border-t border-slate-50 text-center">
                <h3 class="font-semibold text-[12px] text-slate-800 uppercase tracking-tight">Facade Photo</h3>
              </div>
            </div>

            <!-- Custom / Dynamic Criteria -->
            <div v-for="doc in getActiveHouseDynamicDocs()" :key="doc.id" class="bg-white border border-slate-100 rounded-[2rem] shadow-md overflow-hidden flex flex-col group transition hover:shadow-2xl">
              <div class="h-56 bg-slate-50 relative flex items-center justify-center p-6">
                <img :src="getImageUrl(doc.file_path)" class="w-full h-full object-contain filter group-hover:scale-110 transition duration-500" />
                <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                  <button @click="openPreview(getImageUrl(doc.file_path))" class="bg-white text-slate-900 px-6 py-2.5 rounded-full text-[12px] font-semibold uppercase tracking-wide shadow-lg management-button">Preview</button>
                </div>
              </div>
              <div class="p-4 border-t border-slate-50 text-center">
                <h3 class="font-semibold text-[12px] text-slate-800 uppercase tracking-tight leading-snug">{{ doc.criteria_label || 'Additional Doc' }}</h3>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Verification Checklist -->
    <div v-management-dialog="{ close: () => closeChecklistModal() }" v-if="showChecklistModal && activeApp" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex justify-center items-center p-4 sm:p-8">
      <div class="bg-[#f8fafc] w-full max-w-6xl rounded shadow-2xl flex flex-col max-h-[95vh] overflow-hidden text-left">
        <!-- Inadjust din ang padding at gap para sa Header nito -->
        <div class="bg-[#2563eb] text-white px-6 sm:px-8 py-5 flex justify-between items-center shrink-0 gap-4">
          <div class="flex items-center gap-3 overflow-hidden">
            <i class="fa-solid fa-rectangle-list text-xl shrink-0"></i>
            <h2 class="text-xs sm:text-lg font-bold tracking-tight uppercase truncate">
              Requirements Verification - <span class="text-yellow-300 font-semibold">{{ activeApp.name }}</span>
            </h2>
          </div>
          <button aria-label="Close dialog" @click="closeChecklistModal" class="text-white hover:text-red-200 transition flex items-center justify-center h-10 w-10 rounded-full hover:bg-white/10 shrink-0 management-button"><i class="fa-solid fa-xmark text-2xl"></i></button>
        </div>

        <form @submit.prevent="handleApprove" class="flex flex-col h-full overflow-hidden">
          <div class="p-6 sm:p-10 overflow-y-auto grow custom-scrollbar">
            
            <div v-if="activeApp.document_update_pending" class="mb-6 bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-2xl shadow-sm">
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                  <i class="fa-solid fa-circle-exclamation text-amber-600 text-lg"></i>
                </div>
                <div>
                  <h4 class="text-[12px] font-bold text-amber-800 uppercase tracking-wide mb-1">Institutional Re-Verification</h4>
                  <p class="text-[13px] font-medium text-amber-700 leading-tight">
                    <template v-if="activeApp.house_status === 'accredited'">
                      This is an <strong>already-accredited</strong> boarding house. The owner has uploaded a renewed/updated document. Review the flagged item below and approve or reject the document re-check.
                    </template>
                    <template v-else-if="activeApp.archived_by === 'owner'">
                      This boarding house was <strong>unlisted by the owner</strong> and was re-queued here after they uploaded new documents. Reviewing this will determine if it can be re-listed as accredited.
                    </template>
                    <template v-else-if="activeApp.archived_by === 'system'">
                      This boarding house was <strong>automatically archived due to expired required permits</strong>. The owner has uploaded renewed documents. Approve to restore accreditation.
                    </template>
                    <template v-else-if="activeApp.archived_by === 'admin'">
                      This boarding house was <strong>previously suspended by an administrator</strong>. The owner has uploaded updated documents in response. Review carefully before approving.
                    </template>
                    <template v-else>
                      The owner has resubmitted files for validation. Review the checklist below to approve or reject accreditation.
                    </template>
                  </p>
                </div>
              </div>
            </div>

            <div v-if="activeApp.is_resubmission" class="mb-6 bg-blue-50 border-l-4 border-blue-500 p-5 rounded-r-2xl shadow-sm">
              <div class="flex items-start gap-3">
                <i class="fa-solid fa-rotate text-blue-500 mt-1 text-lg"></i>
                <div class="w-full">
                  <h4 class="text-[12px] font-bold text-blue-900 uppercase tracking-wide mb-1">Resubmission Alert</h4>
                  <p class="text-[12px] text-blue-700 leading-relaxed font-medium">
                    <template v-if="activeApp.archived_by === 'owner'">
                      This property was <strong class="text-amber-600 font-bold">UNLISTED BY OWNER</strong>. The owner has uploaded new documents while unlisted, queuing this property for re-accreditation review.
                    </template>
                    <template v-else-if="activeApp.archived_by === 'system'">
                      This property was <strong class="text-red-600 font-bold">AUTO-ARCHIVED (EXPIRED PERMITS)</strong>. The owner has uploaded renewed permit documents and is requesting restoration of accreditation.
                    </template>
                    <template v-else-if="activeApp.archived_by === 'admin'">
                      This property was <strong class="text-purple-600 font-bold">SUSPENDED BY ADMIN</strong>. The owner has uploaded updated documents. Verify carefully — admin suspension may have had specific reasons.
                    </template>
                    <template v-else>
                      This property was previously <strong class="text-red-600 font-bold">REJECTED</strong>. The owner has corrected their application and resubmitted it for your review.
                    </template>
                  </p>
                </div>
              </div>
            </div>

            <!-- 💻 LAPTOP / TABLET VIEW (Standard Table for Checklist) -->
            <div class="hidden md:block overflow-hidden border border-slate-100 rounded-2xl shadow-sm mb-10 bg-white">
              <div class="overflow-x-auto custom-scrollbar">
                <table class="w-full text-slate-800 border-collapse whitespace-nowrap">
                  <thead>
                    <tr class="bg-slate-50/80 text-[12px] font-bold text-left uppercase text-slate-400 tracking-wide border-b border-slate-100">
                      <th class="p-5 w-16 text-center">#</th>
                      <th class="p-5">Checklist Item</th>
                      <th class="p-5 text-center">File Evidence</th>
                      <th class="p-5 text-center">Verification Status</th>
                    </tr>
                  </thead>
                  <tbody class="text-[12px] font-medium">
                    <tr v-for="(item, i) in getFilteredCriteria()" :key="item.id" class="border-b border-slate-50 last:border-0 hover:bg-amber-50/40 transition-colors"
                        :class="{
                          'bg-amber-100/90 border-l-4 border-amber-500 shadow-inner': isDocumentItemUpdated(item),
                          'bg-rose-50/50 border-l-4 border-rose-400': isRequiredAndUnchecked(item) && !isDocumentItemUpdated(item)
                        }">
                      <td class="p-6 text-center text-slate-300 font-bold text-xs italic">{{ i + 1 }}</td>
                      <td class="p-6">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-slate-800 font-semibold text-[14px]">{{ item.label }}</span>
                          <span v-if="isDocumentItemUpdated(item)"
                                class="inline-flex items-center gap-1 bg-amber-500 text-white text-[12px] font-semibold uppercase tracking-wide px-2.5 py-0.5 rounded-full shrink-0 shadow-sm animate-pulse">
                            <i class="fa-solid fa-clock-rotate-left text-[12px]"></i> UPDATED
                          </span>
                          <span v-if="['permit_business_form','permit_barangay','permit_fire','permit_sanitary'].includes(item.permit_key)"
                                class="inline-block bg-rose-50 text-rose-600 border border-rose-200 text-[12px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0">
                            Required
                          </span>
                          <span v-else-if="item.permit_key"
                                class="inline-block bg-slate-100 text-slate-500 border border-slate-200 text-[12px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0">
                            Optional
                          </span>
                        </div>
                      </td>
                      <td class="p-6 text-center">
                        <!-- One button per document; it opens every file uploaded for it (images and/or PDF) -->
                        <button type="button" v-if="item.permit_key && getPermitFiles(activeApp, item.permit_key).length" @click="openPreviewSet(getPermitFiles(activeApp, item.permit_key))" class="text-blue-600 hover:text-blue-800 font-bold text-[12px] uppercase tracking-wide flex items-center justify-center gap-2 mx-auto"
                                :aria-label="`Preview ${item.label}` + (getPermitFiles(activeApp, item.permit_key).length > 1 ? ` (${getPermitFiles(activeApp, item.permit_key).length} files)` : '')">
                          <i class="fa-solid fa-eye" aria-hidden="true"></i> Preview
                          <span v-if="getPermitFiles(activeApp, item.permit_key).length > 1" class="inline-flex items-center rounded-full bg-blue-600 text-white px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal leading-none">{{ getPermitFiles(activeApp, item.permit_key).length }} files</span>
                        </button>
                        <button type="button" v-else-if="!item.permit_key && getActiveHouseDynamicDocs().find(d => d.criteria_id === item.id)" @click="openPreview(getImageUrl(getActiveHouseDynamicDocs().find(d => d.criteria_id === item.id).file_path))" class="text-blue-600 hover:text-blue-800 font-bold text-[12px] uppercase tracking-wide flex items-center justify-center gap-2 mx-auto">
                          <i class="fa-solid fa-eye"></i> Preview
                        </button>
                        <span v-else class="text-slate-200 italic text-[12px] font-bold uppercase">No File Attached</span>
                      </td>
                      <td class="p-6">
                        <div class="flex justify-center">
                          <input aria-label="id]" type="checkbox" v-model="checkedChecklist[item.id]" class="w-6 h-6 rounded-md border-slate-300 text-[#2563eb] focus:ring-0 cursor-pointer" />
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- 📱 MOBILE VIEW (Stackable Cards Layout for Checklist) -->
            <div class="block md:hidden space-y-4 mb-10">
              <div v-for="(item, i) in getFilteredCriteria()" :key="item.id" 
                   class="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 transition space-y-3"
                   :class="{ 'border-amber-500 border-l-4 bg-amber-50/90': isDocumentItemUpdated(item) }">
                
                <div class="flex justify-between items-center pb-2 border-b border-slate-100">
                  <div class="flex items-center gap-2">
                    <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wide">Item # {{ i + 1 }}</span>
                    <span v-if="isDocumentItemUpdated(item)"
                          class="inline-flex items-center gap-1 bg-amber-500 text-white text-[12px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 shadow-sm animate-pulse">
                      <i class="fa-solid fa-clock-rotate-left text-[12px]"></i> UPDATED
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-[12px] font-bold text-slate-500 uppercase">Verify:</span>
                    <input aria-label="id]" type="checkbox" v-model="checkedChecklist[item.id]" class="w-5 h-5 rounded-md border-slate-300 text-[#2563eb] focus:ring-0 cursor-pointer" />
                  </div>
                </div>

                <div class="py-1">
                  <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">Requirement</span>
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-slate-900 font-bold text-sm leading-snug">{{ item.label }}</span>
                    <span v-if="['permit_business_form','permit_barangay','permit_fire','permit_sanitary'].includes(item.permit_key)"
                          class="inline-block bg-rose-50 text-rose-600 border border-rose-200 text-[12px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0">
                      Required
                    </span>
                    <span v-else-if="item.permit_key"
                          class="inline-block bg-slate-100 text-slate-500 border border-slate-200 text-[12px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0">
                      Optional
                    </span>
                  </div>
                </div>

                <div class="pt-2 border-t border-slate-100 flex justify-between items-center">
                  <span class="text-[12px] font-semibold text-slate-400 uppercase tracking-wider">File Evidence</span>
                  <div class="text-right">
                    <!-- One button per document; it opens every file uploaded for it (images and/or PDF) -->
                    <button type="button" v-if="item.permit_key && getPermitFiles(activeApp, item.permit_key).length" @click="openPreviewSet(getPermitFiles(activeApp, item.permit_key))" class="text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-4 py-1.5 rounded-lg font-bold text-[12px] uppercase tracking-wide flex items-center gap-1.5 transition management-button"
                            :aria-label="`Preview ${item.label}` + (getPermitFiles(activeApp, item.permit_key).length > 1 ? ` (${getPermitFiles(activeApp, item.permit_key).length} files)` : '')">
                      <i class="fa-solid fa-eye" aria-hidden="true"></i> Preview
                      <span v-if="getPermitFiles(activeApp, item.permit_key).length > 1" class="inline-flex items-center rounded-full bg-blue-600 text-white px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal leading-none">{{ getPermitFiles(activeApp, item.permit_key).length }} files</span>
                    </button>
                    <button type="button" v-else-if="!item.permit_key && getActiveHouseDynamicDocs().find(d => d.criteria_id === item.id)" @click="openPreview(getImageUrl(getActiveHouseDynamicDocs().find(d => d.criteria_id === item.id).file_path))" class="text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-4 py-1.5 rounded-lg font-bold text-[12px] uppercase tracking-wide flex items-center gap-1.5 transition management-button">
                      <i class="fa-solid fa-eye"></i> Preview
                    </button>
                    <span v-else class="text-slate-400 italic text-[12px] font-semibold uppercase">No File Attached</span>
                  </div>
                </div>

              </div>
            </div>

            <div v-if="activeApp.application_status" class="mt-8 border border-slate-200 rounded-2xl p-5">
              <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h3 class="text-[12px] font-bold text-slate-500 uppercase tracking-wide">
                  Application {{ activeApp.reference_no }} ·
                  <span :class="['px-2 py-0.5 rounded-full normal-case', STATUS_INFO[activeApp.application_status]?.badge || 'bg-slate-100 text-slate-600']">{{ STATUS_INFO[activeApp.application_status]?.label || activeApp.application_status }}</span>
                </h3>
              </div>
              <ol class="border-l-2 border-slate-200 pl-4 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                <li v-for="(h, i) in applicationHistory" :key="i" class="text-[13px]">
                  <span class="font-semibold text-slate-800">{{ STATUS_INFO[h.to_status]?.label || h.to_status }}</span>
                  <span class="text-slate-400"> · {{ formatStatusDate(h.created_at, true) }} · {{ h.actor_type === 'admin' ? (h.actor_name || 'SASO') : h.actor_type }}</span>
                  <p v-if="h.remarks" class="text-[12px] text-slate-500 whitespace-pre-line">{{ h.remarks }}</p>
                </li>
                <li v-if="applicationHistory.length === 0" class="text-[13px] text-slate-400">No history recorded yet.</li>
              </ol>
            </div>

            <div class="mt-8">
              <label class="block text-[12px] font-bold text-slate-400 uppercase mb-4 tracking-normal">Administrative Remarks / Rejection Feedback</label>
              <textarea aria-label="Administrative Remarks / Rejection Feedback" v-model="adminCommentsInput" rows="4" class="w-full bg-slate-50 border-2 border-slate-100 p-6 rounded-3xl text-sm font-semibold text-slate-700 outline-none transition custom-scrollbar" placeholder="Provide constructive feedback for the owner..."></textarea>
            </div>
          </div>

          <!-- Required docs status bar — only shown when some required docs are still unchecked -->
          <div v-if="activeApp && criteria.filter(c => !c.house_id && REQUIRED_PERMIT_KEYS.includes(c.permit_key)).some(c => !checkedChecklist[c.id])"
               class="px-4 sm:px-8 pt-4 sm:pt-6 border-t border-slate-100">
            <div class="flex items-center gap-3 px-4 py-2.5 rounded-xl text-[12px] font-semibold uppercase tracking-wide mb-4 bg-rose-50 text-rose-700 border border-rose-200">
              <i class="fa-solid fa-circle-exclamation text-rose-600"></i>
              <span>
                {{ criteria.filter(c => !c.house_id && REQUIRED_PERMIT_KEYS.includes(c.permit_key)).filter(c => checkedChecklist[c.id]).length }}/{{ criteria.filter(c => !c.house_id && REQUIRED_PERMIT_KEYS.includes(c.permit_key)).length }} Required documents verified — Check all 4 to enable approval
              </span>
            </div>
          </div>

          <div class="bg-slate-50 px-4 sm:px-8 pb-4 sm:pb-8 flex flex-col sm:flex-row justify-between items-center gap-4 rounded-b">

            <!-- Primary Action Buttons (Approve / Reject) -->
            <div class="grid grid-cols-2 gap-2.5 w-full sm:w-auto">
              <button type="button" @click="handleReject" :disabled="isSubmitting" class="w-full bg-red-600 hover:bg-red-700 text-white border-2 border-red-600 rounded-xl px-5 py-3 font-bold text-[12px] uppercase tracking-wide transition shadow-sm flex items-center justify-center gap-2 cursor-pointer management-button">
                <i class="fa-solid fa-circle-xmark"></i> Reject
              </button>
              <button type="submit" :disabled="isSubmitting" class="w-full bg-[#2563eb] hover:bg-blue-700 text-white rounded-xl px-5 py-3 font-bold text-[12px] uppercase tracking-wide transition shadow-md flex items-center justify-center gap-2 cursor-pointer management-button management-button-primary">
                <i class="fa-solid fa-circle-check"></i> {{ isSubmitting ? 'Confirming...' : 'Confirm' }}
              </button>
            </div>

            <!-- Secondary Criteria Management Buttons (Add / Update / Delete) -->
            <div class="grid grid-cols-3 gap-2 w-full sm:w-auto">
              <button type="button" @click="showAddCriteriaModal = true" class="bg-green-700 hover:bg-green-800 text-white rounded-xl px-3 py-2.5 font-bold text-[12px] uppercase tracking-wide transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer management-button">
                <i class="fa-solid fa-plus text-[12px]"></i> Add
              </button>
              <button type="button" @click="showUpdateCriteriaModal = true" class="bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-3 py-2.5 font-bold text-[12px] uppercase tracking-wide transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer management-button">
                <i class="fa-solid fa-pen-to-square text-[12px]"></i> Edit
              </button>
              <button type="button" @click="showDeleteCriteriaModal = true" class="bg-red-600 hover:bg-red-700 text-white rounded-xl px-3 py-2.5 font-bold text-[12px] uppercase tracking-wide transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer management-button">
                <i class="fa-solid fa-trash-can text-[12px]"></i> Delete
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Full-screen Document Viewer -->
    <div v-management-dialog="{ close: () => closePreview() }" v-if="showPreviewModal" class="doc-viewer animate-fade-in" @click.self="closePreview" @keydown.left="stepPreview(-1)" @keydown.right="stepPreview(1)">
      <div class="doc-viewer-bar">
        <span class="doc-viewer-title"><i :class="isPdfFile(previewImageUrl) ? 'fa-solid fa-file-pdf' : 'fa-solid fa-file-image'" aria-hidden="true"></i> Document preview<span v-if="previewFiles.length > 1" class="doc-viewer-count" aria-live="polite">File {{ previewIndex + 1 }} of {{ previewFiles.length }}</span></span>
        <div class="doc-viewer-actions">
          <button v-if="!isPdfFile(previewImageUrl)" type="button" class="doc-viewer-btn" @click="previewZoomed = !previewZoomed" :aria-pressed="previewZoomed">
            <i :class="previewZoomed ? 'fa-solid fa-magnifying-glass-minus' : 'fa-solid fa-magnifying-glass-plus'" aria-hidden="true"></i>
            {{ previewZoomed ? 'Fit to screen' : 'Actual size' }}
          </button>
          <a :href="previewImageUrl" target="_blank" rel="noopener" class="doc-viewer-btn"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i> Open in new tab</a>
          <button type="button" @click="downloadOriginal" :disabled="isDownloading" class="doc-viewer-btn is-primary">
            <i :class="isDownloading ? 'fa-solid fa-spinner animate-spin' : 'fa-solid fa-download'" aria-hidden="true"></i>
            {{ isDownloading ? 'Downloading...' : 'Download' }}
          </button>
          <button type="button" aria-label="Close preview" @click="closePreview" class="doc-viewer-close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
      </div>
      <div :class="['doc-viewer-stage', { 'is-zoomed': previewZoomed }]" @click.self="closePreview">
        <iframe v-if="isPdfFile(previewImageUrl)" :src="previewImageUrl" class="doc-viewer-pdf" title="Document preview"></iframe>
        <img v-else :src="previewImageUrl" class="doc-viewer-img" alt="Document preview" @click="previewZoomed = !previewZoomed" />
        <template v-if="previewFiles.length > 1">
          <button type="button" class="doc-viewer-nav is-prev" aria-label="Previous file" @click="stepPreview(-1)"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
          <button type="button" class="doc-viewer-nav is-next" aria-label="Next file" @click="stepPreview(1)"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
        </template>
      </div>
    </div>

    <!-- Management Modals -->
    <div v-management-dialog="{ close: () => showAddCriteriaModal = false }" v-if="showAddCriteriaModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex justify-center items-center p-4">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
        <div class="bg-[#10b981] text-white px-8 py-5 flex justify-between items-center">
          <h3 class="font-semibold text-lg uppercase tracking-tight">Add New Criteria</h3>
          <button aria-label="Close dialog" @click="showAddCriteriaModal = false" class="text-white hover:text-emerald-100 transition"><i class="fa-solid fa-xmark text-2xl"></i></button>
        </div>
        <div class="p-10">
          <div class="mb-8">
            <label class="block text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-3">Criteria Label</label>
            <input aria-label="Criteria Label" type="text" v-model="newCriteriaLabel" required placeholder="e.g. Health Certificate" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-0 focus:border-emerald-500 outline-none transition font-bold text-slate-700">
          </div>
          <div class="flex justify-end gap-4">
            <button @click="showAddCriteriaModal = false" class="px-8 py-3 text-slate-400 font-semibold text-[12px] uppercase tracking-wide hover:text-slate-600">Cancel</button>
            <button @click="submitAddCriteria" class="bg-green-700 hover:bg-green-800 text-white px-10 py-3 rounded-xl font-semibold text-[12px] uppercase tracking-wide shadow-lg transition management-button">Add Item</button>
          </div>
        </div>
      </div>
    </div>

    <div v-management-dialog="{ close: () => showUpdateCriteriaModal = false }" v-if="showUpdateCriteriaModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex justify-center items-center p-4">
      <div class="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
        <div class="bg-[#f59e0b] text-white px-8 py-5 flex justify-between items-center">
          <h3 class="font-semibold text-lg uppercase tracking-tight">Update System Criteria</h3>
          <button aria-label="Close dialog" @click="showUpdateCriteriaModal = false" class="text-white hover:text-amber-100 transition"><i class="fa-solid fa-xmark text-2xl"></i></button>
        </div>
        <div class="p-10 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <div class="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl mb-6 flex gap-3">
            <i class="fa-solid fa-circle-info mt-1"></i>
            <p class="text-[12px] font-bold uppercase tracking-wide leading-relaxed">Note: You can only update custom criteria that you have added. The 8 required institutional documents cannot be modified here.</p>
          </div>
          <div class="space-y-4">
            <div v-for="item in criteria.filter(c => c.house_id === activeApp?.id)" :key="item.id" class="management-item flex items-center justify-between p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl hover:border-amber-400 transition group">
              <span class="text-sm font-semibold text-slate-700 uppercase tracking-tight">{{ item.label }}</span>
              <button @click="startEditCriteria(item.id, item.label)" class="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2 rounded-lg text-[12px] font-semibold uppercase tracking-wide transition shadow-sm management-button">Edit</button>
            </div>
            <div v-if="criteria.filter(c => c.house_id === activeApp?.id).length === 0" class="py-10 flex flex-col items-center justify-center text-center opacity-40">
              <i class="fa-solid fa-folder-open text-4xl mb-4"></i>
              <p class="text-[12px] font-semibold uppercase tracking-wide">No custom criteria to manage</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-management-dialog="{ close: () => showEditItemModal = false }" v-if="showEditItemModal" class="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[130] flex justify-center items-center p-4">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
        <div class="bg-[#f59e0b] text-white px-8 py-5 flex justify-between items-center">
          <h3 class="font-semibold text-lg uppercase tracking-tight">Edit Criteria</h3>
          <button aria-label="Close dialog" @click="showEditItemModal = false" class="text-white hover:text-amber-100 transition"><i class="fa-solid fa-xmark text-2xl"></i></button>
        </div>
        <div class="p-10">
          <div class="mb-8">
            <label class="block text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-3">Update Label</label>
            <input aria-label="Update Label" type="text" v-model="editCriteriaLabel" required class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-0 focus:border-amber-500 outline-none transition font-bold text-slate-700" />
          </div>
          <div class="flex justify-end gap-4">
            <button @click="showEditItemModal = false" class="px-8 py-3 text-slate-400 font-semibold text-[12px] uppercase tracking-wide hover:text-slate-600">Cancel</button>
            <button @click="submitUpdateCriteria" class="bg-[#245b99] hover:bg-[#194775] text-white px-10 py-3 rounded-xl font-semibold text-[12px] uppercase tracking-wide shadow-lg transition management-button management-button-primary">Save Changes</button>
          </div>
        </div>
      </div>
    </div>

    <div v-management-dialog="{ close: () => showDeleteCriteriaModal = false }" v-if="showDeleteCriteriaModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex justify-center items-center p-4">
      <div class="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
        <div class="bg-[#ef4444] text-white px-8 py-5 flex justify-between items-center">
          <h3 class="font-semibold text-lg uppercase tracking-tight">Remove Criteria</h3>
          <button aria-label="Close dialog" @click="showDeleteCriteriaModal = false" class="text-white hover:text-red-100 transition"><i class="fa-solid fa-xmark text-2xl"></i></button>
        </div>
        <div class="p-10 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <div class="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl mb-6 flex gap-3">
            <i class="fa-solid fa-triangle-exclamation mt-1"></i>
            <p class="text-[12px] font-bold uppercase tracking-wide leading-relaxed">Note: You can only delete custom criteria that you have added. The 8 required institutional documents are permanent and cannot be deleted.</p>
          </div>
          <div class="space-y-4">
            <div v-for="item in criteria.filter(c => c.house_id === activeApp?.id)" :key="item.id" class="management-item flex items-center justify-between p-5 bg-red-50 border-2 border-red-100 rounded-2xl hover:border-red-400 transition group">
              <span class="text-sm font-semibold text-slate-700 uppercase tracking-tight">{{ item.label }}</span>
              <button @click="submitDeleteCriteria(item.id)" class="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg text-[12px] font-semibold uppercase tracking-wide transition shadow-sm management-button">Delete</button>
            </div>
            <div v-if="criteria.filter(c => c.house_id === activeApp?.id).length === 0" class="py-10 flex flex-col items-center justify-center text-center opacity-40">
              <i class="fa-solid fa-folder-open text-4xl mb-4"></i>
              <p class="text-[12px] font-semibold uppercase tracking-wide">No custom criteria to manage</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirm Modals -->
    <div v-management-dialog="{ close: () => showApproveConfirmModal = false }" v-if="showApproveConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6" @click.self="showApproveConfirmModal = false">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="bg-[#2563eb] px-8 py-5 flex items-center gap-4">
          <div class="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-circle-check text-white text-xl"></i>
          </div>
          <h3 class="text-white font-semibold text-base uppercase tracking-tight">Confirm Accreditation</h3>
        </div>
        <div class="px-10 py-8">
          <p class="text-slate-700 font-semibold text-sm leading-relaxed mb-2">
            Are you sure you want to <strong class="text-blue-600">approve</strong> this boarding house application with the selected requirements?
          </p>
          <p class="text-slate-400 font-bold text-[12px] uppercase tracking-wide">
            This action will accredit <span class="text-slate-700">{{ activeApp?.name }}</span> and notify the owner.
          </p>
          <p v-if="activeApp?.awaiting_credentials" class="mt-4 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[12px] font-semibold leading-relaxed">
            <i class="fa-solid fa-key mr-1"></i> This is a new owner registration. Approving creates a one-time account activation link for the applicant (no password is generated).
          </p>
        </div>
        <div class="px-10 pb-8 flex justify-end gap-4">
          <button @click="showApproveConfirmModal = false" class="px-8 py-3 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-500 font-semibold text-[12px] uppercase tracking-wide rounded-xl transition management-button management-button-secondary">
            Cancel
          </button>
          <button @click="execApprove" class="px-8 py-3 bg-[#2563eb] hover:bg-blue-700 text-white font-semibold text-[12px] uppercase tracking-wide rounded-xl shadow-md transition management-button management-button-primary">
            <i class="fa-solid fa-circle-check mr-2"></i>Confirm Approval
          </button>
        </div>
      </div>
    </div>

    <div v-management-dialog="{ close: () => showRejectConfirmModal = false }" v-if="showRejectConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6" @click.self="showRejectConfirmModal = false">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="bg-red-500 px-8 py-5 flex items-center gap-4">
          <div class="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-circle-xmark text-white text-xl"></i>
          </div>
          <h3 class="text-white font-semibold text-base uppercase tracking-tight">Confirm Rejection</h3>
        </div>
        <div class="px-10 py-8">
          <p v-if="!activeApp?.application_status" class="text-slate-700 font-semibold text-sm leading-relaxed mb-2">
            Are you sure you want to <strong class="text-red-600">reject</strong> this application? The owner will receive your feedback for resubmission.
          </p>
          <fieldset v-else class="mb-3 space-y-2">
            <legend class="text-slate-700 font-semibold text-sm mb-2">What should happen to this application?</legend>
            <label class="flex items-start gap-3 border rounded-xl p-3 cursor-pointer" :class="rejectDecision === 'revision' ? 'border-amber-400 bg-amber-50' : 'border-slate-200'">
              <input v-model="rejectDecision" type="radio" value="revision" class="mt-1 accent-amber-500" />
              <span class="text-sm"><strong class="text-slate-800">Request revision</strong><span class="block text-[12px] text-slate-500">The applicant corrects it and resubmits from Track My Application.</span></span>
            </label>
            <label class="flex items-start gap-3 border rounded-xl p-3 cursor-pointer" :class="rejectDecision === 'reject' ? 'border-red-400 bg-red-50' : 'border-slate-200'">
              <input v-model="rejectDecision" type="radio" value="reject" class="mt-1 accent-red-500" />
              <span class="text-sm"><strong class="text-slate-800">Reject application</strong><span class="block text-[12px] text-slate-500">Closes this application. It stays on record; the applicant can submit a new one.</span></span>
            </label>
          </fieldset>
          <p class="text-slate-400 font-bold text-[12px] uppercase tracking-wide">
            Property: <span class="text-slate-700">{{ activeApp?.name }}</span>
          </p>
        </div>
        <div class="px-10 pb-8 flex justify-end gap-4">
          <button @click="showRejectConfirmModal = false" class="px-8 py-3 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-500 font-semibold text-[12px] uppercase tracking-wide rounded-xl transition management-button management-button-secondary">
            Cancel
          </button>
          <button @click="execReject" class="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold text-[12px] uppercase tracking-wide rounded-xl shadow-md transition management-button">
            <i class="fa-solid fa-circle-xmark mr-2"></i>Confirm Rejection
          </button>
        </div>
      </div>
    </div>

    <div v-management-dialog v-if="showDeleteCriteriaConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6" @click.self="showDeleteCriteriaConfirmModal = false">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="bg-red-600 px-8 py-5 flex items-center gap-4">
          <div class="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-trash-can text-white text-xl"></i>
          </div>
          <h3 class="text-white font-semibold text-base uppercase tracking-tight">Modal Title</h3>
        </div>
        <div class="px-10 py-8">
          <p class="text-slate-700 font-semibold text-sm leading-relaxed mb-2">
            Are you sure you want to permanently <strong class="text-red-600">delete</strong> this custom criteria?
          </p>
          <p class="text-slate-400 font-bold text-[12px] uppercase tracking-wide">This action cannot be undone.</p>
        </div>
        <div class="px-10 pb-8 flex justify-end gap-4">
          <button @click="showDeleteCriteriaConfirmModal = false; pendingDeleteCriteriaId = null" class="px-8 py-3 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-500 font-semibold text-[12px] uppercase tracking-wide rounded-xl transition management-button management-button-secondary">
            Cancel
          </button>
          <button @click="execDeleteCriteria" class="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold text-[12px] uppercase tracking-wide rounded-xl shadow-md transition management-button">
            <i class="fa-solid fa-trash-can mr-2"></i>Delete Permanently
          </button>
        </div>
      </div>
    </div>
    <!-- Required Documents Not Verified Modal -->
    <div v-management-dialog="{ close: () => showRequiredDocsModal = false }" v-if="showRequiredDocsModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
        <div class="bg-rose-600 px-6 py-5 flex items-center gap-4">
          <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-triangle-exclamation text-white text-lg"></i>
          </div>
          <div>
            <h3 class="text-sm font-semibold text-white uppercase tracking-tight leading-tight">Cannot Approve Yet</h3>
            <p class="text-[12px] font-bold text-rose-200 uppercase tracking-wide mt-0.5">Required documents not verified</p>
          </div>
        </div>
        <div class="px-6 py-5">
          <p class="text-[12px] font-semibold text-slate-600 mb-4 leading-relaxed">
            The following <strong class="text-slate-800">required document{{ uncheckedRequiredDocs.length > 1 ? 's have' : ' has' }}</strong> not been checked in the verification checklist:
          </p>
          <ul class="space-y-2 mb-5">
            <li v-for="doc in uncheckedRequiredDocs" :key="doc.id"
                class="flex items-center gap-3 bg-rose-50 border border-rose-100 px-4 py-2.5 rounded-xl">
              <i class="fa-solid fa-circle-xmark text-rose-500 shrink-0"></i>
              <span class="text-[12px] font-bold text-rose-800 uppercase tracking-wide">{{ doc.label }}</span>
            </li>
          </ul>
          <p class="text-[12px] font-semibold text-slate-400 leading-relaxed">
            Review each required document in the checklist and check the verification box before approving.
          </p>
        </div>
        <div class="px-6 pb-5">
          <button @click="showRequiredDocsModal = false"
                  class="w-full bg-slate-900 hover:bg-slate-700 text-white text-[12px] font-semibold py-3 rounded-xl uppercase tracking-wide transition cursor-pointer management-button">
            Back to Checklist
          </button>
        </div>
      </div>
    </div>

    <!-- Owner account activation link issued on approval (property-first registration) -->
    <div v-management-dialog="{ close: () => closeCredentialsModal() }" v-if="issuedCredentials" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
      <div class="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div class="bg-emerald-600 px-8 py-5 flex items-center gap-4">
          <div class="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-key text-white text-lg"></i>
          </div>
          <div>
            <h3 class="text-white font-semibold text-base uppercase tracking-tight">Application approved</h3>
            <p class="text-emerald-100 text-[12px] font-semibold">{{ issuedCredentials.house_name }} is now accredited</p>
          </div>
        </div>
        <div class="px-8 py-6 space-y-4">
          <p class="text-blue-900 bg-blue-50 border border-blue-200 rounded-xl p-3 text-[12px] font-semibold leading-relaxed">
            <i class="fa-solid fa-circle-info mr-1"></i> Account activation is ready. The owner opens Track My Application with their reference number, sets a login email and password, and can then manage the property.
          </p>
          <dl class="bg-slate-50 border border-slate-200 rounded-2xl divide-y divide-slate-200 text-sm">
            <div class="flex justify-between gap-4 px-5 py-3">
              <dt class="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">Reference No.</dt>
              <dd class="font-bold text-slate-900 select-all">{{ issuedCredentials.reference_no }}</dd>
            </div>
            <div class="flex justify-between gap-4 px-5 py-3">
              <dt class="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">Owner</dt>
              <dd class="font-semibold text-slate-800 text-right">{{ issuedCredentials.name }}</dd>
            </div>
            <div class="flex justify-between gap-4 px-5 py-3">
              <dt class="text-[12px] font-semibold text-slate-500 uppercase tracking-wide">Activation</dt>
              <dd class="font-semibold text-emerald-700 text-right">Ready · valid {{ issuedCredentials.expires_in_days || 7 }} days</dd>
            </div>
          </dl>
        </div>
        <div class="px-8 pb-8 flex flex-col sm:flex-row gap-3">
          <button type="button" @click="copyCredentials" class="flex-1 px-6 py-3 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-600 font-semibold text-[12px] uppercase tracking-wide rounded-xl transition management-button management-button-secondary">
            <i :class="credentialsCopied ? 'fa-solid fa-check mr-2' : 'fa-solid fa-copy mr-2'"></i>{{ credentialsCopied ? 'Copied' : 'Copy reference number' }}
          </button>
          <button type="button" @click="closeCredentialsModal" class="px-6 py-3 bg-slate-900 hover:bg-slate-700 text-white font-semibold text-[12px] uppercase tracking-wide rounded-xl transition management-button">
            Done
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style>
.custom-scrollbar::-webkit-scrollbar {
  height: 6px;
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: #f1f5f9;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}

/* Full-screen document viewer */
.doc-viewer { position: fixed; inset: 0; z-index: 150; display: flex; flex-direction: column; background: rgba(15, 23, 42, .92); backdrop-filter: blur(4px); }
.doc-viewer-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 16px; background: rgba(15, 23, 42, .85); border-bottom: 1px solid rgba(255, 255, 255, .08); }
.doc-viewer-title { display: inline-flex; align-items: center; gap: 8px; color: #fff; font-size: 14px; font-weight: 600; }
.doc-viewer-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.doc-viewer-btn { display: inline-flex; align-items: center; gap: 7px; height: 36px; min-height: 36px !important; padding: 0 14px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, .2); background: rgba(255, 255, 255, .08); color: #fff; font-size: 13px; font-weight: 600; text-decoration: none; cursor: pointer; }
.doc-viewer-btn:hover { background: rgba(255, 255, 255, .18); }
.doc-viewer-btn.is-primary { background: #3b82f6; border-color: #3b82f6; }
.doc-viewer-btn.is-primary:hover { background: #2563eb; }
.doc-viewer-btn:disabled { opacity: .6; cursor: default; }
.doc-viewer-close { width: 36px; height: 36px; min-height: 36px !important; border-radius: 10px; border: 0; background: rgba(255, 255, 255, .12); color: #fff; font-size: 16px; cursor: pointer; }
.doc-viewer-close:hover { background: #f43f5e; }
.doc-viewer-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 16px; overflow: hidden; }
.doc-viewer-img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; border-radius: 6px; background: #fff; box-shadow: 0 20px 50px rgba(0, 0, 0, .45); cursor: zoom-in; }
.doc-viewer-stage.is-zoomed { overflow: auto; align-items: flex-start; justify-content: flex-start; }
.doc-viewer-stage.is-zoomed .doc-viewer-img { max-width: none; max-height: none; margin: auto; cursor: zoom-out; }
.doc-viewer-pdf { width: 100%; height: 100%; border: 0; border-radius: 6px; background: #fff; }
.doc-viewer-stage { position: relative; }
.doc-viewer-count { margin-left: 4px; padding: 2px 10px; border-radius: 999px; background: rgba(255, 255, 255, .14); font-size: 12.5px; font-weight: 600; }
.doc-viewer-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 46px; height: 46px; min-height: 46px !important; border-radius: 999px; border: 1px solid rgba(255, 255, 255, .25); background: rgba(15, 23, 42, .7); color: #fff; font-size: 16px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2; }
.doc-viewer-nav:hover { background: #2563eb; border-color: #2563eb; }
.doc-viewer-nav:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
.doc-viewer-nav.is-prev { left: 16px; }
.doc-viewer-nav.is-next { right: 16px; }


/* Requirement Checklist: bright amber so it stands out */
.management-page .acc-checklist-btn { background: #ff9f0a !important; border: 1px solid #ff9f0a !important; color: #fff !important; box-shadow: none !important; }
.management-page .acc-checklist-btn:hover { background: #ffad33 !important; border-color: #ffad33 !important; box-shadow: none !important; }

/* ───── New applications list ───── */
@media (min-width: 1024px) {
  .na-fit { height: 100dvh; min-height: 0 !important; overflow: hidden; }
  .na-fit > main { display: flex; flex-direction: column; min-height: 0; padding-top: 24px !important; padding-bottom: 20px !important; }
  .na-fit > main > * { flex-shrink: 0; }
  .na-fit > main > .na-body { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
  .na-body > * { flex-shrink: 0; }
  .na-body > .na-table-card { flex: 1 1 auto; min-height: 0; }
  .na-scroll { flex: 1; min-height: 0; overflow: auto; }
}
.na-fit > main .management-page-header { margin-bottom: 16px; }
.na-tiles { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; margin: 0 0 14px; }
@media (min-width: 640px) { .na-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.na-tiles > div { padding: 10px 14px; border-radius: 14px; background: #fff; border: 1px solid #e2e8f0; }
.na-tiles dt { font-size: 12px; font-weight: 600; color: #64748b; }
.na-tiles dt i { color: #94a3b8; margin-right: 4px; }
.na-tiles dd { margin: 2px 0 0; font-size: 20px; font-weight: 700; color: #142b4a; line-height: 1.2; }
.na-tile-sub { display: block; margin-top: 2px; font-size: 12px; color: #64748b; }
.na-tiles > div.is-primary { background: #e7eef8; border-color: #c9d7ec; }
.na-tiles > div.is-primary dd, .na-tiles > div.is-primary dt i { color: #1e4a8d; }
.na-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.na-search { position: relative; flex: 1 1 320px; min-width: 0; }
.na-search i { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 12px; pointer-events: none; }
.na-search input { width: 100%; height: 40px; min-height: 40px !important; padding: 0 14px 0 38px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 13.5px; color: #334155; outline: none; }
.na-search input:focus, .na-select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, .12); }
.na-select { height: 40px; min-height: 40px !important; padding: 0 32px 0 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 13.5px; font-weight: 500; color: #0f172a; outline: none; cursor: pointer; }
.na-reset { display: inline-flex; align-items: center; gap: 8px; height: 40px; min-height: 40px !important; padding: 0 14px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 13.5px; font-weight: 600; color: #0f172a; cursor: pointer; }
.na-reset:hover { background: #f8fafc; }
@media (max-width: 767px) { .na-select, .na-reset { flex: 1 1 45%; } }
.na-scroll { overflow-x: auto; }
.na-table { min-width: 980px; }
.na-type { display: inline-flex; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.na-type.is-new { background: #dcfce7; color: #15803d; }
.na-type.is-resubmission { background: #e0f2fe; color: #0369a1; }
.na-type.is-update { background: #fff7ed; color: #c2410c; }
.na-status { display: inline-flex; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.na-status.is-blue { background: #dbeafe; color: #1d4ed8; }
.na-status.is-violet { background: #ede9fe; color: #6d28d9; }
.na-status.is-amber { background: #fff3d6; color: #b45309; }
.na-status.is-sky { background: #e0f2fe; color: #0369a1; }
.na-status.is-green { background: #dcfce7; color: #15803d; }
.na-status.is-rose { background: #ffe4e6; color: #be123c; }
.na-action { display: inline-flex; align-items: center; gap: 7px; padding: 0 12px; min-height: 34px !important; border-radius: 9px; font-size: 12.5px; font-weight: 700; white-space: nowrap; }
.na-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border-top: 1px solid #eef2f7; font-size: 14px; color: #475569; }
.na-pages { display: flex; gap: 8px; }
.na-pages button { min-width: 42px; height: 42px; min-height: 42px !important; padding: 0 12px; border-radius: 10px; border: 1px solid #e2e8f0; background: #fff; color: #475569; font-weight: 700; cursor: pointer; }
.na-pages button.is-active { background: #2563eb; border-color: #2563eb; color: #fff; }
.na-pages button:disabled { opacity: .45; cursor: default; }
.na-mcard { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; }

.na-range { position: relative; }
.na-range-btn { display: inline-flex; align-items: center; gap: 8px; height: 40px; min-height: 40px !important; padding: 0 12px; min-width: 200px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 13.5px; font-weight: 500; color: #334155; cursor: pointer; }
.na-range-btn span { flex: 1; text-align: left; }
.na-range-pop { position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; width: 260px; padding: 14px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 12px 30px rgba(15, 23, 42, .15); display: flex; flex-direction: column; gap: 10px; }
.na-range-pop label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: #64748b; }
.na-range-pop input { height: 40px; padding: 0 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; color: #0f172a; }
.na-range-clear, .na-range-done { padding: 0 14px; min-height: 36px !important; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; }
.na-range-clear { border: 1px solid #e2e8f0; background: #fff; color: #475569; }
.na-range-done { border: 0; background: #2563eb; color: #fff; }
@media (max-width: 767px) { .na-range { flex: 1 1 100%; } .na-range-btn { width: 100%; } }

/* New applications: the page scrolls. The table scrolls sideways when it is wider than the card,
   so no column is cut off (phones and tablets use the card list instead). */
@media (min-width: 1024px) {
  .na-table-card { overflow: hidden !important; }
  .na-scroll { overflow-x: auto !important; overflow-y: hidden; }
}
</style>
