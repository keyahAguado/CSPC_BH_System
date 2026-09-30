<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';
import AdminNav from '../../components/partials/AdminNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';
import { downloadOriginalFile } from '../../utils/downloadHelper';
import { getImageUrl } from '../../config/api';

// State Variables
const applications = ref([]);
const criteria = ref([]);
const dynamicDocs = ref([]);
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
      checkedChecklist.value[c.id] = isVerified;
    }
  });
};

const fetchPendingApplications = async () => {
  try {
    isLoading.value = true;
    const response = await axios.get(`/api/admin/pending-applications`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      applications.value = response.data.applications || [];
      criteria.value = response.data.criteria || [];
      dynamicDocs.value = response.data.dynamicDocs || [];
      checklistResults.value = response.data.checklistResults || [];
      syncChecklistState();
    }
  } catch (error) {
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

    if (app.document_update_pending && app.last_updated_document === c.permit_key) {
      checkedChecklist.value[c.id] = false;
    }
  });

  showChecklistModal.value = true;
};

const closeChecklistModal = () => {
  showChecklistModal.value = false;
  activeApp.value = null;
  adminCommentsInput.value = '';
};

const openPreview = (url) => {
  if (!url || url.endsWith('#')) return;
  previewImageUrl.value = url;
  showPreviewModal.value = true;
};

const closePreview = () => {
  showPreviewModal.value = false;
  previewImageUrl.value = '';
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

const handleApprove = () => {
  if (!activeApp.value) return;
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
      await fetchPendingApplications();
    }
  } catch (err) {
    console.error(err);
    showSystemAlert(err.response?.data?.message || 'Accreditation approval failed.', 'error');
  } finally {
    isSubmitting.value = false;
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
      admin_comments: adminCommentsInput.value
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.data.success) {
      showSystemAlert('Application rejected. Feedback sent to owner.', 'warning');
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

// Returns the Document Recheck badge label and visibility flag for an application row.
// Shows the badge when document_update_pending = 1 AND the house is not a brand-new
// first-time submission — meaning it was previously accredited OR unlisted by the owner.
const getDocRecheckBadge = (app) => {
  if (!app.document_update_pending) return null;
  // Already-accredited house that uploaded a renewal doc (stays accredited, pending re-check)
  if (app.house_status === 'accredited') {
    return { label: 'Document Recheck — Already Accredited', color: 'text-amber-600' };
  }
  // Owner-unlisted (archived_by = 'owner') then uploaded docs — pushed back to pending
  if (app.archived_by === 'owner') {
    return { label: 'Document Recheck — Previously Unlisted by Owner', color: 'text-blue-600' };
  }
  // System-archived (expired permits) then uploaded new docs — pushed back to pending
  if (app.archived_by === 'system') {
    return { label: 'Document Recheck — Previously Archived (Expired Permits)', color: 'text-red-600' };
  }
  // Archived by admin then uploaded docs — pushed back to pending
  if (app.archived_by === 'admin') {
    return { label: 'Document Recheck — Previously Suspended by Admin', color: 'text-purple-600' };
  }
  // Non-pending status with document_update_pending (fallback)
  if (app.house_status !== 'pending') {
    const label = app.house_status.charAt(0).toUpperCase() + app.house_status.slice(1);
    return { label: `Document Recheck — Already ${label}`, color: 'text-amber-600' };
  }
  return null;
};

onMounted(() => {
  fetchPendingApplications();
});
</script>

<template>
  <div class="bg-slate-100 min-h-screen flex flex-col font-sans text-slate-800">
    <AdminNav />
    <FlashAlert ref="alertRef" />

    <main class="max-w-[1450px] mx-auto py-10 px-4 sm:px-6 flex-1 w-full text-left">
      <div class="text-center mb-10 mt-6">
        <h1 class="text-[28px] sm:text-[32px] text-slate-700 tracking-tight font-black uppercase">List of New Boarding House Applications</h1>
      </div>

      <!-- Loading State -->
      <div v-show="isLoading" class="py-20 flex flex-col items-center justify-center gap-3 bg-white rounded-[2rem] shadow-sm border border-slate-200 p-10 max-w-xl mx-auto text-center">
        <svg class="animate-spin h-10 w-10 text-blue-600 mb-4 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Loading pending submissions...</p>
      </div>

      <!-- Responsive Container: Table for Laptop (md+), Cards for Mobile (<md) -->
      <div v-show="!isLoading" class="w-full">
        
        <!-- 💻 LAPTOP / TABLET VIEW (Standard Table) -->
        <div class="hidden md:block bg-white shadow-xl border border-slate-200 overflow-hidden rounded-lg">
          <div class="overflow-x-auto custom-scrollbar">
            <table class="w-full text-center border-collapse whitespace-nowrap">
              <thead>
                <tr class="bg-[#222831] text-white text-[13px] font-bold tracking-wide uppercase">
                  <th class="py-5 px-6 w-16 border-r border-slate-600">#</th>
                  <th class="py-5 px-6 border-r border-slate-600">Owner Name</th>
                  <th class="py-5 px-6 border-r border-slate-600">Boarding House</th>
                  <th class="py-5 px-6 border-r border-slate-600">Date</th>
                  <th class="py-5 px-6 border-r border-slate-600">Documents</th>
                  <th class="py-5 px-6 text-center">Action</th>
                </tr>
              </thead>
              <tbody class="text-[13px] font-medium text-slate-800">
                <template v-if="applications.length > 0">
                  <tr v-for="(app, index) in applications" :key="app.id" class="border-b border-slate-200 hover:bg-slate-50 transition">
                    <td class="py-6 px-6 border-r border-slate-200 text-slate-500 font-bold">{{ index + 1 }}</td>
                    <td class="py-6 px-6 border-r border-slate-200 font-semibold">{{ app.owner_name }}</td>
                    <td class="py-6 px-6 border-r border-slate-200 font-black text-slate-900">
                      {{ app.name }}
                      <template v-if="getDocRecheckBadge(app)">
                        <span :class="['block mt-1 text-[9px] font-black uppercase tracking-widest', getDocRecheckBadge(app).color]">
                          <i class="fa-solid fa-rotate"></i> {{ getDocRecheckBadge(app).label }}
                        </span>
                      </template>
                    </td>
                    <td class="py-6 px-6 border-r border-slate-200 text-slate-400 font-bold">
                      <span class="block">{{ formatDate(app.resubmitted_at || app.created_at) }}</span>
                      <span v-if="app.resubmitted_at && app.document_update_pending"
                            class="block text-[9px] font-black text-blue-500 uppercase tracking-widest mt-0.5">
                        Resubmitted
                      </span>
                    </td>
                    <td class="py-6 px-6 border-r border-slate-200">
                      <button @click="openDocumentModal(app)" class="text-blue-500 border border-blue-200 bg-white hover:bg-blue-50 rounded px-5 py-2 flex items-center justify-center gap-2 mx-auto transition text-[11px] font-black uppercase tracking-widest shadow-sm">
                        <i class="fa-solid fa-folder-open"></i> View Docs
                      </button>
                    </td>
                    <td class="py-6 px-6">
                      <button @click="openChecklistModal(app)" class="bg-[#1e8b52] hover:bg-[#166c3f] text-white rounded px-5 py-2 flex items-center justify-center gap-2 mx-auto transition shadow-md text-[11px] font-black uppercase tracking-widest">
                        <i class="fa-solid fa-list-check"></i> Requirement Checklist
                      </button>
                    </td>
                  </tr>
                </template>
                <template v-else>
                  <tr class="border-b border-slate-200">
                    <td colspan="6" class="py-12 text-center text-slate-400 italic font-semibold tracking-wider">
                      NO PENDING APPLICATIONS AT THE MOMENT.
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 📱 MOBILE VIEW (Stackable Cards Layout) -->
        <div class="block md:hidden space-y-4">
          <template v-if="applications.length > 0">
            <div v-for="(app, index) in applications" :key="app.id" class="bg-white border border-slate-200 rounded-2xl shadow-md overflow-hidden p-5 transition">
              
              <div class="flex justify-between items-center pb-3 border-b border-slate-100 mb-3">
                <span class="text-xs font-black text-slate-400 uppercase tracking-widest"># {{ index + 1 }}</span>
                <div class="text-right">
                  <span class="block text-xs font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                    {{ formatDate(app.resubmitted_at || app.created_at) }}
                  </span>
                  <span v-if="app.resubmitted_at && app.document_update_pending"
                        class="block text-[8px] font-black text-blue-500 uppercase tracking-widest mt-0.5">
                    Resubmitted
                  </span>
                </div>
              </div>

              <!-- Card Details -->
              <div class="space-y-2 text-sm">
                <div class="flex flex-col py-1.5 border-b border-slate-50">
                  <span class="text-[10px] font-black text-slate-400 uppercase tracking-wider">Owner Name</span>
                  <span class="font-semibold text-slate-800">{{ app.owner_name }}</span>
                </div>

                <div class="flex flex-col py-1.5 border-b border-slate-50">
                  <span class="text-[10px] font-black text-slate-400 uppercase tracking-wider">Boarding House</span>
                  <span class="font-black text-slate-900 text-base">{{ app.name }}</span>
                  <template v-if="getDocRecheckBadge(app)">
                    <span :class="['mt-1 text-[9px] font-black uppercase tracking-widest', getDocRecheckBadge(app).color]">
                      <i class="fa-solid fa-rotate"></i> {{ getDocRecheckBadge(app).label }}
                    </span>
                  </template>
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="grid grid-cols-1 gap-2.5 mt-5 pt-3 border-t border-slate-100">
                <button @click="openDocumentModal(app)" class="text-blue-600 border border-blue-200 bg-blue-50/50 hover:bg-blue-50 rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 transition text-[11px] font-black uppercase tracking-widest shadow-sm">
                  <i class="fa-solid fa-folder-open"></i> View Docs
                </button>
                <button @click="openChecklistModal(app)" class="bg-[#1e8b52] hover:bg-[#166c3f] text-white rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 transition shadow-md text-[11px] font-black uppercase tracking-widest">
                  <i class="fa-solid fa-list-check"></i> Requirement Checklist
                </button>
              </div>

            </div>
          </template>
          
          <template v-else>
            <div class="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
              <p class="text-slate-400 italic font-semibold tracking-wider uppercase text-xs">
                NO PENDING APPLICATIONS AT THE MOMENT.
              </p>
            </div>
          </template>
        </div>

      </div>
    </main>

    <!-- Document Viewer Modal -->
    <div v-if="showDocModal && activeApp" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex justify-center items-center p-4 sm:p-8">
      <div class="bg-white w-full max-w-6xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div class="bg-[#2563eb] text-white px-6 sm:px-8 py-5 flex justify-between items-center shrink-0 gap-4">
          <div class="flex items-center gap-3 overflow-hidden">
            <div class="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0"><i class="fa-regular fa-folder-open text-xl"></i></div>
            <h2 class="text-xs sm:text-lg font-black uppercase tracking-tight truncate">{{ activeApp.name }} - Legal Documents</h2>
          </div>
          <button @click="closeDocumentModal" class="text-white hover:text-red-200 transition flex items-center justify-center h-10 w-10 rounded-full hover:bg-white/10 shrink-0"><i class="fa-solid fa-xmark text-2xl"></i></button>
        </div>
        <div class="p-6 sm:p-10 overflow-y-auto grow bg-white custom-scrollbar text-left">
          <!-- Section label for required docs -->
          <p class="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-rose-500 inline-block"></span> Required Documents
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-8">
            <div v-for="p in criteria.filter(c => !c.house_id && ['permit_business_form','permit_barangay','permit_fire','permit_sanitary'].includes(c.permit_key))" :key="p.id"
                 class="bg-white border border-slate-100 rounded-[2rem] shadow-md overflow-hidden flex flex-col group transition hover:shadow-2xl">
              <div v-if="activeApp[p.permit_key]" class="h-56 bg-slate-50 relative flex items-center justify-center p-6">
                <img :src="getImageUrl(activeApp[p.permit_key])" class="w-full h-full object-contain filter group-hover:scale-110 transition duration-500" />
                <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                  <button @click="openPreview(getImageUrl(activeApp[p.permit_key]))" class="bg-white text-slate-900 px-6 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg">Preview</button>
                </div>
              </div>
              <div v-else class="bg-slate-50 border-2 border-dashed border-rose-200 rounded-[2rem] p-10 flex flex-col items-center justify-center text-center h-56">
                <i class="fa-solid fa-file-circle-exclamation text-4xl text-rose-300 mb-4"></i>
                <h3 class="font-black text-[11px] text-rose-400 uppercase tracking-widest">Missing</h3>
              </div>
              <div class="p-4 border-t border-slate-50 text-center">
                <h3 class="font-black text-[11px] text-slate-800 uppercase tracking-tight leading-snug">{{ p.label }}</h3>
              </div>
            </div>
          </div>

          <!-- Section label for optional docs -->
          <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-slate-400 inline-block"></span> Optional Documents
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            <div v-for="p in criteria.filter(c => !c.house_id && !['permit_business_form','permit_barangay','permit_fire','permit_sanitary'].includes(c.permit_key))" :key="p.id"
                 class="bg-white border border-slate-100 rounded-[2rem] shadow-md overflow-hidden flex flex-col group transition hover:shadow-2xl">
              <div v-if="activeApp[p.permit_key]" class="h-56 bg-slate-50 relative flex items-center justify-center p-6">
                <img :src="getImageUrl(activeApp[p.permit_key])" class="w-full h-full object-contain filter group-hover:scale-110 transition duration-500" />
                <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                  <button @click="openPreview(getImageUrl(activeApp[p.permit_key]))" class="bg-white text-slate-900 px-6 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg">Preview</button>
                </div>
              </div>
              <div v-else class="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] p-10 flex flex-col items-center justify-center text-center opacity-60 h-56">
                <i class="fa-solid fa-file-circle-exclamation text-4xl text-slate-300 mb-4"></i>
                <h3 class="font-black text-[11px] text-slate-400 uppercase tracking-widest">Not Submitted</h3>
              </div>
              <div class="p-4 border-t border-slate-50 text-center">
                <h3 class="font-black text-[11px] text-slate-800 uppercase tracking-tight leading-snug">{{ p.label }}</h3>
              </div>
            </div>

            <!-- Facade Image -->
            <div class="bg-white border border-slate-100 rounded-[2rem] shadow-md overflow-hidden flex flex-col group transition hover:shadow-2xl">
              <div v-if="activeApp.img" class="h-56 bg-slate-50 relative flex items-center justify-center p-6">
                <img :src="getImageUrl(activeApp.img)" class="w-full h-full object-contain filter group-hover:scale-110 transition duration-500" />
                <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                  <button @click="openPreview(getImageUrl(activeApp.img))" class="bg-white text-slate-900 px-6 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg">Preview</button>
                </div>
              </div>
              <div v-else class="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] p-10 flex flex-col items-center justify-center text-center opacity-60 h-56">
                <i class="fa-solid fa-image text-4xl text-slate-300 mb-4"></i>
              </div>
              <div class="p-4 border-t border-slate-50 text-center">
                <h3 class="font-black text-[11px] text-slate-800 uppercase tracking-tight">Facade Photo</h3>
              </div>
            </div>

            <!-- Custom / Dynamic Criteria -->
            <div v-for="doc in getActiveHouseDynamicDocs()" :key="doc.id" class="bg-white border border-slate-100 rounded-[2rem] shadow-md overflow-hidden flex flex-col group transition hover:shadow-2xl">
              <div class="h-56 bg-slate-50 relative flex items-center justify-center p-6">
                <img :src="getImageUrl(doc.file_path)" class="w-full h-full object-contain filter group-hover:scale-110 transition duration-500" />
                <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                  <button @click="openPreview(getImageUrl(doc.file_path))" class="bg-white text-slate-900 px-6 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg">Preview</button>
                </div>
              </div>
              <div class="p-4 border-t border-slate-50 text-center">
                <h3 class="font-black text-[11px] text-slate-800 uppercase tracking-tight leading-snug">{{ doc.criteria_label || 'Additional Doc' }}</h3>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Verification Checklist -->
    <div v-if="showChecklistModal && activeApp" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex justify-center items-center p-4 sm:p-8">
      <div class="bg-[#f8fafc] w-full max-w-6xl rounded shadow-2xl flex flex-col max-h-[95vh] overflow-hidden text-left">
        <!-- Inadjust din ang padding at gap para sa Header nito -->
        <div class="bg-[#2563eb] text-white px-6 sm:px-8 py-5 flex justify-between items-center shrink-0 gap-4">
          <div class="flex items-center gap-3 overflow-hidden">
            <i class="fa-solid fa-rectangle-list text-xl shrink-0"></i>
            <h2 class="text-xs sm:text-lg font-bold tracking-tight uppercase truncate">
              Requirements Verification - <span class="text-yellow-300 font-black">{{ activeApp.name }}</span>
            </h2>
          </div>
          <button @click="closeChecklistModal" class="text-white hover:text-red-200 transition flex items-center justify-center h-10 w-10 rounded-full hover:bg-white/10 shrink-0"><i class="fa-solid fa-xmark text-2xl"></i></button>
        </div>

        <form @submit.prevent="handleApprove" class="flex flex-col h-full overflow-hidden">
          <div class="p-6 sm:p-10 overflow-y-auto grow custom-scrollbar">
            
            <div v-if="activeApp.document_update_pending" class="mb-6 bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-2xl shadow-sm">
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                  <i class="fa-solid fa-circle-exclamation text-amber-600 text-lg"></i>
                </div>
                <div>
                  <h4 class="text-[11px] font-bold text-amber-800 uppercase tracking-widest mb-1">Institutional Re-Verification</h4>
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
                  <h4 class="text-[11px] font-bold text-blue-900 uppercase tracking-widest mb-1">Resubmission Alert</h4>
                  <p class="text-[10px] text-blue-700 leading-relaxed font-medium">
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
                    <tr class="bg-slate-50/80 text-[10px] font-bold text-left uppercase text-slate-400 tracking-widest border-b border-slate-100">
                      <th class="p-5 w-16 text-center">#</th>
                      <th class="p-5">Checklist Item</th>
                      <th class="p-5 text-center">File Evidence</th>
                      <th class="p-5 text-center">Verification Status</th>
                    </tr>
                  </thead>
                  <tbody class="text-[12px] font-medium">
                    <tr v-for="(item, i) in getFilteredCriteria()" :key="item.id" class="border-b border-slate-50 last:border-0 hover:bg-amber-50/40 transition-colors"
                        :class="{ 'bg-amber-100/90 border-l-4 border-amber-500 shadow-inner': isDocumentItemUpdated(item) }">
                      <td class="p-6 text-center text-slate-300 font-bold text-xs italic">{{ i + 1 }}</td>
                      <td class="p-6">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-slate-800 font-semibold text-[14px]">{{ item.label }}</span>
                          <span v-if="isDocumentItemUpdated(item)"
                                class="inline-flex items-center gap-1 bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full shrink-0 shadow-sm animate-pulse">
                            <i class="fa-solid fa-clock-rotate-left text-[9px]"></i> UPDATED
                          </span>
                          <span v-if="['permit_business_form','permit_barangay','permit_fire','permit_sanitary'].includes(item.permit_key)"
                                class="inline-block bg-rose-50 text-rose-600 border border-rose-200 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0">
                            Required
                          </span>
                          <span v-else-if="item.permit_key"
                                class="inline-block bg-slate-100 text-slate-500 border border-slate-200 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0">
                            Optional
                          </span>
                        </div>
                      </td>
                      <td class="p-6 text-center">
                        <button type="button" v-if="item.permit_key && activeApp[item.permit_key]" @click="openPreview(getImageUrl(activeApp[item.permit_key]))" class="text-blue-600 hover:text-blue-800 font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 mx-auto">
                          <i class="fa-solid fa-eye"></i> Preview
                        </button>
                        <button type="button" v-else-if="!item.permit_key && getActiveHouseDynamicDocs().find(d => d.criteria_id === item.id)" @click="openPreview(getImageUrl(getActiveHouseDynamicDocs().find(d => d.criteria_id === item.id).file_path))" class="text-blue-600 hover:text-blue-800 font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 mx-auto">
                          <i class="fa-solid fa-eye"></i> Preview
                        </button>
                        <span v-else class="text-slate-200 italic text-[10px] font-bold uppercase">No File Attached</span>
                      </td>
                      <td class="p-6">
                        <div class="flex justify-center">
                          <input type="checkbox" v-model="checkedChecklist[item.id]" class="w-6 h-6 rounded-md border-slate-300 text-[#2563eb] focus:ring-0 cursor-pointer" />
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
                    <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Item # {{ i + 1 }}</span>
                    <span v-if="isDocumentItemUpdated(item)"
                          class="inline-flex items-center gap-1 bg-amber-500 text-white text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0 shadow-sm animate-pulse">
                      <i class="fa-solid fa-clock-rotate-left text-[8px]"></i> UPDATED
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] font-bold text-slate-500 uppercase">Verify:</span>
                    <input type="checkbox" v-model="checkedChecklist[item.id]" class="w-5 h-5 rounded-md border-slate-300 text-[#2563eb] focus:ring-0 cursor-pointer" />
                  </div>
                </div>

                <div class="py-1">
                  <span class="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Requirement</span>
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-slate-900 font-bold text-sm leading-snug">{{ item.label }}</span>
                    <span v-if="['permit_business_form','permit_barangay','permit_fire','permit_sanitary'].includes(item.permit_key)"
                          class="inline-block bg-rose-50 text-rose-600 border border-rose-200 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0">
                      Required
                    </span>
                    <span v-else-if="item.permit_key"
                          class="inline-block bg-slate-100 text-slate-500 border border-slate-200 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0">
                      Optional
                    </span>
                  </div>
                </div>

                <div class="pt-2 border-t border-slate-100 flex justify-between items-center">
                  <span class="text-[10px] font-black text-slate-400 uppercase tracking-wider">File Evidence</span>
                  <div class="text-right">
                    <button type="button" v-if="item.permit_key && activeApp[item.permit_key]" @click="openPreview(getImageUrl(activeApp[item.permit_key]))" class="text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-4 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5 transition">
                      <i class="fa-solid fa-eye"></i> Preview
                    </button>
                    <button type="button" v-else-if="!item.permit_key && getActiveHouseDynamicDocs().find(d => d.criteria_id === item.id)" @click="openPreview(getImageUrl(getActiveHouseDynamicDocs().find(d => d.criteria_id === item.id).file_path))" class="text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-4 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5 transition">
                      <i class="fa-solid fa-eye"></i> Preview
                    </button>
                    <span v-else class="text-slate-400 italic text-[10px] font-semibold uppercase">No File Attached</span>
                  </div>
                </div>

              </div>
            </div>

            <div class="mt-8">
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-4 tracking-[0.2em]">Administrative Remarks / Rejection Feedback</label>
              <textarea v-model="adminCommentsInput" rows="4" class="w-full bg-slate-50 border-2 border-slate-100 p-6 rounded-3xl text-sm font-semibold text-slate-700 outline-none transition custom-scrollbar" placeholder="Provide constructive feedback for the owner..."></textarea>
            </div>
          </div>

          <div class="bg-slate-50 p-4 sm:p-8 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4 rounded-b">
            <!-- Primary Action Buttons (Approve / Reject) -->
            <div class="grid grid-cols-2 gap-2.5 w-full sm:w-auto">
              <button type="button" @click="handleReject" :disabled="isSubmitting" class="w-full bg-white hover:bg-red-50 text-red-500 border-2 border-red-200 rounded-xl px-5 py-3 font-bold text-[11px] uppercase tracking-widest transition shadow-sm flex items-center justify-center gap-2 cursor-pointer">
                <i class="fa-solid fa-circle-xmark"></i> Reject
              </button>
              <button type="submit" :disabled="isSubmitting" class="w-full bg-[#2563eb] hover:bg-blue-700 text-white rounded-xl px-5 py-3 font-bold text-[11px] uppercase tracking-widest transition shadow-md flex items-center justify-center gap-2 cursor-pointer">
                <i class="fa-solid fa-circle-check"></i> {{ isSubmitting ? 'Confirming...' : 'Confirm' }}
              </button>
            </div>

            <!-- Secondary Criteria Management Buttons (Add / Update / Delete) -->
            <div class="grid grid-cols-3 gap-2 w-full sm:w-auto">
              <button type="button" @click="showAddCriteriaModal = true" class="bg-[#166534] hover:bg-emerald-800 text-white rounded-xl px-3 py-2.5 font-bold text-[10px] uppercase tracking-widest transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer">
                <i class="fa-solid fa-plus text-[10px]"></i> Add
              </button>
              <button type="button" @click="showUpdateCriteriaModal = true" class="bg-[#d97706] hover:bg-amber-700 text-white rounded-xl px-3 py-2.5 font-bold text-[10px] uppercase tracking-widest transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer">
                <i class="fa-solid fa-pen-to-square text-[10px]"></i> Edit
              </button>
              <button type="button" @click="showDeleteCriteriaModal = true" class="bg-[#b91c1c] hover:bg-red-800 text-white rounded-xl px-3 py-2.5 font-bold text-[10px] uppercase tracking-widest transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer">
                <i class="fa-solid fa-trash-can text-[10px]"></i> Delete
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Lightbox Preview Modal -->
    <div v-if="showPreviewModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-fade-in" @click="closePreview">
      <div class="relative max-w-4xl max-h-[85vh] overflow-hidden bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center" @click.stop>
        <button @click="closePreview" class="absolute top-4 right-4 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 w-10 h-10 rounded-full flex items-center justify-center transition">
          <i class="fa-solid fa-xmark text-lg"></i>
        </button>
        <img :src="previewImageUrl" class="max-w-full max-h-[70vh] object-contain rounded-2xl mb-4 shadow-sm" alt="Document Preview" />
        <button 
          @click="downloadOriginal" 
          :disabled="isDownloading" 
          class="bg-blue-600 hover:bg-black text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition flex items-center gap-2"
        >
          <i v-if="isDownloading" class="fa-solid fa-spinner animate-spin"></i>
          <i v-else class="fa-solid fa-download"></i>
          {{ isDownloading ? 'Downloading...' : 'Download Original' }}
        </button>
      </div>
    </div>

    <!-- Management Modals -->
    <div v-if="showAddCriteriaModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex justify-center items-center p-4">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
        <div class="bg-[#10b981] text-white px-8 py-5 flex justify-between items-center">
          <h3 class="font-black text-lg uppercase tracking-tight">Add New Criteria</h3>
          <button @click="showAddCriteriaModal = false" class="text-white hover:text-emerald-100 transition"><i class="fa-solid fa-xmark text-2xl"></i></button>
        </div>
        <div class="p-10">
          <div class="mb-8">
            <label class="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Criteria Label</label>
            <input type="text" v-model="newCriteriaLabel" required placeholder="e.g. Health Certificate" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-0 focus:border-emerald-500 outline-none transition font-bold text-slate-700">
          </div>
          <div class="flex justify-end gap-4">
            <button @click="showAddCriteriaModal = false" class="px-8 py-3 text-slate-400 font-black text-[11px] uppercase tracking-widest hover:text-slate-600">Cancel</button>
            <button @click="submitAddCriteria" class="bg-[#10b981] hover:bg-emerald-600 text-white px-10 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg transition">Add Item</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showUpdateCriteriaModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex justify-center items-center p-4">
      <div class="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
        <div class="bg-[#f59e0b] text-white px-8 py-5 flex justify-between items-center">
          <h3 class="font-black text-lg uppercase tracking-tight">Update System Criteria</h3>
          <button @click="showUpdateCriteriaModal = false" class="text-white hover:text-amber-100 transition"><i class="fa-solid fa-xmark text-2xl"></i></button>
        </div>
        <div class="p-10 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <div class="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl mb-6 flex gap-3">
            <i class="fa-solid fa-circle-info mt-1"></i>
            <p class="text-[10px] font-bold uppercase tracking-widest leading-relaxed">Note: You can only update custom criteria that you have added. The 8 required institutional documents cannot be modified here.</p>
          </div>
          <div class="space-y-4">
            <div v-for="item in criteria.filter(c => c.house_id === activeApp?.id)" :key="item.id" class="management-item flex items-center justify-between p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl hover:border-amber-400 transition group">
              <span class="text-sm font-black text-slate-700 uppercase tracking-tight">{{ item.label }}</span>
              <button @click="startEditCriteria(item.id, item.label)" class="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition shadow-sm">Edit</button>
            </div>
            <div v-if="criteria.filter(c => c.house_id === activeApp?.id).length === 0" class="py-10 flex flex-col items-center justify-center text-center opacity-40">
              <i class="fa-solid fa-folder-open text-4xl mb-4"></i>
              <p class="text-[10px] font-black uppercase tracking-widest">No custom criteria to manage</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showEditItemModal" class="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[130] flex justify-center items-center p-4">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
        <div class="bg-[#f59e0b] text-white px-8 py-5 flex justify-between items-center">
          <h3 class="font-black text-lg uppercase tracking-tight">Edit Criteria</h3>
          <button @click="showEditItemModal = false" class="text-white hover:text-amber-100 transition"><i class="fa-solid fa-xmark text-2xl"></i></button>
        </div>
        <div class="p-10">
          <div class="mb-8">
            <label class="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Update Label</label>
            <input type="text" v-model="editCriteriaLabel" required class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-0 focus:border-amber-500 outline-none transition font-bold text-slate-700" />
          </div>
          <div class="flex justify-end gap-4">
            <button @click="showEditItemModal = false" class="px-8 py-3 text-slate-400 font-black text-[11px] uppercase tracking-widest hover:text-slate-600">Cancel</button>
            <button @click="submitUpdateCriteria" class="bg-[#f59e0b] hover:bg-amber-600 text-white px-10 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg transition">Save Changes</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showDeleteCriteriaModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex justify-center items-center p-4">
      <div class="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden">
        <div class="bg-[#ef4444] text-white px-8 py-5 flex justify-between items-center">
          <h3 class="font-black text-lg uppercase tracking-tight">Remove Criteria</h3>
          <button @click="showDeleteCriteriaModal = false" class="text-white hover:text-red-100 transition"><i class="fa-solid fa-xmark text-2xl"></i></button>
        </div>
        <div class="p-10 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <div class="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl mb-6 flex gap-3">
            <i class="fa-solid fa-triangle-exclamation mt-1"></i>
            <p class="text-[10px] font-bold uppercase tracking-widest leading-relaxed">Note: You can only delete custom criteria that you have added. The 8 required institutional documents are permanent and cannot be deleted.</p>
          </div>
          <div class="space-y-4">
            <div v-for="item in criteria.filter(c => c.house_id === activeApp?.id)" :key="item.id" class="management-item flex items-center justify-between p-5 bg-red-50 border-2 border-red-100 rounded-2xl hover:border-red-400 transition group">
              <span class="text-sm font-black text-slate-700 uppercase tracking-tight">{{ item.label }}</span>
              <button @click="submitDeleteCriteria(item.id)" class="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition shadow-sm">Delete</button>
            </div>
            <div v-if="criteria.filter(c => c.house_id === activeApp?.id).length === 0" class="py-10 flex flex-col items-center justify-center text-center opacity-40">
              <i class="fa-solid fa-folder-open text-4xl mb-4"></i>
              <p class="text-[10px] font-black uppercase tracking-widest">No custom criteria to manage</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirm Modals -->
    <div v-if="showApproveConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6" @click.self="showApproveConfirmModal = false">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="bg-[#2563eb] px-8 py-5 flex items-center gap-4">
          <div class="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-circle-check text-white text-xl"></i>
          </div>
          <h3 class="text-white font-black text-base uppercase tracking-tight">Confirm Accreditation</h3>
        </div>
        <div class="px-10 py-8">
          <p class="text-slate-700 font-semibold text-sm leading-relaxed mb-2">
            Are you sure you want to <strong class="text-blue-600">approve</strong> this boarding house application with the selected requirements?
          </p>
          <p class="text-slate-400 font-bold text-[11px] uppercase tracking-widest">
            This action will accredit <span class="text-slate-700">{{ activeApp?.name }}</span> and notify the owner.
          </p>
        </div>
        <div class="px-10 pb-8 flex justify-end gap-4">
          <button @click="showApproveConfirmModal = false" class="px-8 py-3 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-500 font-black text-[11px] uppercase tracking-widest rounded-xl transition">
            Cancel
          </button>
          <button @click="execApprove" class="px-8 py-3 bg-[#2563eb] hover:bg-blue-700 text-white font-black text-[11px] uppercase tracking-widest rounded-xl shadow-md transition">
            <i class="fa-solid fa-circle-check mr-2"></i>Confirm Approval
          </button>
        </div>
      </div>
    </div>

    <div v-if="showRejectConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6" @click.self="showRejectConfirmModal = false">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="bg-red-500 px-8 py-5 flex items-center gap-4">
          <div class="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-circle-xmark text-white text-xl"></i>
          </div>
          <h3 class="text-white font-black text-base uppercase tracking-tight">Confirm Rejection</h3>
        </div>
        <div class="px-10 py-8">
          <p class="text-slate-700 font-semibold text-sm leading-relaxed mb-2">
            Are you sure you want to <strong class="text-red-600">reject</strong> this application? The owner will receive your feedback for resubmission.
          </p>
          <p class="text-slate-400 font-bold text-[11px] uppercase tracking-widest">
            Property: <span class="text-slate-700">{{ activeApp?.name }}</span>
          </p>
        </div>
        <div class="px-10 pb-8 flex justify-end gap-4">
          <button @click="showRejectConfirmModal = false" class="px-8 py-3 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-500 font-black text-[11px] uppercase tracking-widest rounded-xl transition">
            Cancel
          </button>
          <button @click="execReject" class="px-8 py-3 bg-red-500 hover:bg-red-600 text-white font-black text-[11px] uppercase tracking-widest rounded-xl shadow-md transition">
            <i class="fa-solid fa-circle-xmark mr-2"></i>Confirm Rejection
          </button>
        </div>
      </div>
    </div>

    <div v-if="showDeleteCriteriaConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6" @click.self="showDeleteCriteriaConfirmModal = false">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div class="bg-red-600 px-8 py-5 flex items-center gap-4">
          <div class="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
            <i class="fa-solid fa-trash-can text-white text-xl"></i>
          </div>
          <h3 class="text-white font-black text-base uppercase tracking-tight">Modal Title</h3>
        </div>
        <div class="px-10 py-8">
          <p class="text-slate-700 font-semibold text-sm leading-relaxed mb-2">
            Are you sure you want to permanently <strong class="text-red-600">delete</strong> this custom criteria?
          </p>
          <p class="text-slate-400 font-bold text-[11px] uppercase tracking-widest">This action cannot be undone.</p>
        </div>
        <div class="px-10 pb-8 flex justify-end gap-4">
          <button @click="showDeleteCriteriaConfirmModal = false; pendingDeleteCriteriaId = null" class="px-8 py-3 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-500 font-black text-[11px] uppercase tracking-widest rounded-xl transition">
            Cancel
          </button>
          <button @click="execDeleteCriteria" class="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-black text-[11px] uppercase tracking-widest rounded-xl shadow-md transition">
            <i class="fa-solid fa-trash-can mr-2"></i>Delete Permanently
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
</style>