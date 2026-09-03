<script setup>
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import AdminNav from '../../components/partials/AdminNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';

const applications = ref([]);
const criteria = ref([]);
const dynamicDocs = ref([]);
const checklistResults = ref([]);

const isLoading = ref(true);
const alertRef = ref(null);
import { getImageUrl } from '../../config/api';
const token = sessionStorage.getItem('cspc_token');

// Modals toggles
const showDocModal = ref(false);
const showChecklistModal = ref(false);
const showAddModal = ref(false);
const showUpdateModal = ref(false);
const showDeleteModal = ref(false);
const showEditItemModal = ref(false);
const showConfirmModal = ref(false);

// Active contexts
const activeApp = ref(null);
const activeDocs = ref([]);
const activeCriteria = ref([]);
const adminComments = ref('');
const checklistChecks = ref({}); // { [criteriaId]: boolean }

// Custom criteria management form states
const newCriteriaLabel = ref('');
const editingCriteriaItem = ref({ id: '', label: '' });

// Confirm Modal States
const confirmTitle = ref('');
const confirmMessage = ref('');
const confirmAction = ref(null);

// Hover Preview State
const hoverPreviewUrl = ref('');
const hoverPreviewX = ref(0);
const hoverPreviewY = ref(0);
const isHoverPreviewVisible = ref(false);

const showSystemAlert = (message, type = 'error') => {
  if (alertRef.value) {
    alertRef.value.showSystemAlert(message, type);
  }
};

const triggerConfirm = (title, message, action) => {
  confirmTitle.value = title;
  confirmMessage.value = message;
  confirmAction.value = action;
  showConfirmModal.value = true;
};

const executeConfirm = async () => {
  showConfirmModal.value = false;
  if (confirmAction.value) {
    await confirmAction.value();
    confirmAction.value = null;
  }
};

const fetchApplications = async () => {
  try {
    isLoading.value = true;
    const response = await axios.get('/api/admin/applications/pending', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.data.success) {
      applications.value = response.data.applications || [];
      criteria.value = response.data.criteria || [];
      dynamicDocs.value = response.data.dynamicDocs || [];
      checklistResults.value = response.data.checklistResults || [];
    }
  } catch (error) {
    console.error('Failed to load applications:', error);
    showSystemAlert('Could not fetch new applications.', 'warning');
  } finally {
    isLoading.value = false;
  }
};

const openDocViewer = (app) => {
  activeApp.value = app;
  
  const permits = [
    { label: 'Business Permit', key: 'permit_business_form' },
    { label: 'Cedula', key: 'permit_cedula' },
    { label: 'DTI Registration', key: 'permit_dti' },
    { label: 'Barangay Clearance', key: 'permit_barangay' },
    { label: 'Building Inspection', key: 'permit_building' },
    { label: 'Zoning/Locational', key: 'permit_zoning' },
    { label: 'Sanitary/Health', key: 'permit_sanitary' },
    { label: 'Fire Safety', key: 'permit_fire' },
    { label: 'House Image', key: 'img' }
  ];

  const uploads = permits.map(p => ({
    label: p.label,
    file: app[p.key] || null,
    isDynamic: false
  }));

  const dynamicUploaded = dynamicDocs.value
    .filter(d => d.house_id === app.id)
    .map(d => ({
      label: d.criteria_label || 'Additional Doc',
      file: d.file_path,
      isDynamic: true
    }));

  activeDocs.value = [...uploads, ...dynamicUploaded];
  showDocModal.value = true;
};

const closeDocViewer = () => {
  showDocModal.value = false;
  activeDocs.value = [];
};

const openChecklist = (app) => {
  activeApp.value = app;
  adminComments.value = app.admin_comments || '';
  
  // Filter criteria for this house (institutional + house-specific)
  activeCriteria.value = criteria.value.filter(c => !c.house_id || c.house_id === app.id);
  
  // Initialize checklist values from checklistResults
  const checks = {};
  activeCriteria.value.forEach(c => {
    const existingResult = checklistResults.value.find(r => r.house_id === app.id && r.criteria_id === c.id);
    checks[c.id] = existingResult ? existingResult.verified === 1 : false;
  });
  checklistChecks.value = checks;

  showChecklistModal.value = true;
};

const closeChecklist = () => {
  showChecklistModal.value = false;
  activeCriteria.value = [];
  checklistChecks.value = {};
};

const handleConfirmAccreditation = async () => {
  // Check if all criteria checkboxes are ticked
  const allChecked = activeCriteria.value.every(c => checklistChecks.value[c.id]);
  if (!allChecked) {
    showSystemAlert('All institutional requirements must be checked and verified before you can confirm accreditation.', 'error');
    return;
  }

  try {
    const response = await axios.post(`/api/admin/approve/${activeApp.value.id}`, {
      checklist: checklistChecks.value,
      admin_comments: adminComments.value
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      showSystemAlert('Boarding house approved and accredited successfully!', 'success');
      closeChecklist();
      fetchApplications();
    }
  } catch (error) {
    console.error('Approve failed:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to approve application.', 'error');
  }
};

const handleRejectApplication = async () => {
  try {
    const response = await axios.post(`/api/admin/reject/${activeApp.value.id}`, {
      admin_comments: adminComments.value
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      showSystemAlert('Boarding house application rejected.', 'info');
      closeChecklist();
      fetchApplications();
    }
  } catch (error) {
    console.error('Reject failed:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to reject application.', 'error');
  }
};

// Criteria Management Methods
const handleAddCriteria = async () => {
  if (!newCriteriaLabel.value) {
    showSystemAlert('Label cannot be empty.', 'error');
    return;
  }
  try {
    const response = await axios.post('/api/admin/criteria/add', {
      house_id: activeApp.value.id,
      label: newCriteriaLabel.value
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      showSystemAlert('New criteria added successfully!', 'success');
      newCriteriaLabel.value = '';
      showAddModal.value = false;
      
      // Refresh applications and local checklist
      await fetchApplications();
      activeCriteria.value = criteria.value.filter(c => !c.house_id || c.house_id === activeApp.value.id);
      checklistChecks.value[response.data.criteria.id] = false;
    }
  } catch (error) {
    console.error('Failed to add criteria:', error);
    showSystemAlert('Failed to add new criteria.', 'error');
  }
};

const startEditingItem = (item) => {
  editingCriteriaItem.value = { id: item.id, label: item.label };
  showEditItemModal.value = true;
};

const handleSaveItemEdit = async () => {
  if (!editingCriteriaItem.value.label) return;
  try {
    const response = await axios.post(`/api/admin/criteria/edit/${editingCriteriaItem.value.id}`, {
      label: editingCriteriaItem.value.label
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      showSystemAlert('Criteria label updated successfully!', 'success');
      showEditItemModal.value = false;
      
      // Refresh
      await fetchApplications();
      activeCriteria.value = criteria.value.filter(c => !c.house_id || c.house_id === activeApp.value.id);
    }
  } catch (error) {
    console.error('Failed to edit criteria:', error);
    showSystemAlert('Failed to edit criteria.', 'error');
  }
};

const handleDeleteCriteria = async (itemId) => {
  try {
    const response = await axios.post(`/api/admin/criteria/delete/${itemId}`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.data.success) {
      showSystemAlert('Criteria deleted successfully.', 'success');
      
      // Refresh
      await fetchApplications();
      activeCriteria.value = criteria.value.filter(c => !c.house_id || c.house_id === activeApp.value.id);
    }
  } catch (error) {
    console.error('Failed to delete criteria:', error);
    showSystemAlert('Failed to delete criteria.', 'error');
  }
};

// Hover Preview Functions
const showPreview = (e, fileUrl) => {
  if (!fileUrl || fileUrl.includes('#') || fileUrl.endsWith('/uploads/')) return;
  hoverPreviewUrl.value = fileUrl;
  
  const x = e.clientX + 20;
  let y = e.clientY - 150;
  if (y < 20) y = 20;
  if (y + 400 > window.innerHeight) y = window.innerHeight - 420;

  hoverPreviewX.value = x;
  hoverPreviewY.value = y;
  isHoverPreviewVisible.value = true;
};

const hidePreview = () => {
  isHoverPreviewVisible.value = false;
  hoverPreviewUrl.value = '';
};

// Check if a document in pending application has resubmitted (updated pending)
const getUpdatedDocNames = (app) => {
  if (!app.document_update_pending) return '';
  const updatedKeys = (app.last_updated_document || '').split(',').filter(k => k);
  
  const matches = updatedKeys.map(key => {
    let c = criteria.value.find(item => item.permit_key === key);
    if (!c) c = criteria.value.find(item => item.id == key);
    return c;
  }).filter(c => c);

  const docLabels = matches.map(c => c.label);
  if (docLabels.length > 1) {
    return docLabels.slice(0, -1).join(', ') + ' and ' + docLabels.slice(-1);
  }
  return docLabels[0] || 'documents';
};

const isRowHighlighted = (app, criterion) => {
  if (!app.document_update_pending) return false;
  const updatedKeys = (app.last_updated_document || '').split(',').filter(k => k);
  return updatedKeys.includes(criterion.permit_key) || updatedKeys.includes(String(criterion.id));
};

onMounted(() => {
  fetchApplications();
});
</script>

<template>
  <div class="bg-slate-100 min-h-screen flex flex-col font-sans">
    <AdminNav />
    <FlashAlert ref="alertRef" />

    <!-- Main Content -->
    <main class="max-w-[1450px] mx-auto py-10 px-6 flex-1 w-full text-left">
      <div class="text-center mb-10 mt-6">
        <h1 class="text-[32px] text-slate-700 tracking-tight font-black uppercase">List of New Boarding House Application</h1>
        <div class="w-16 h-1 bg-[#1e8b52] mx-auto rounded-full mt-2"></div>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="p-20 text-center bg-white rounded-[2rem] shadow-sm border border-slate-200 flex flex-col items-center justify-center">
        <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
        <p class="text-slate-400 font-bold uppercase text-[9px] tracking-widest">Loading pending applications...</p>
      </div>

      <!-- Table Container -->
      <div v-else class="bg-white shadow-xl border border-slate-200 overflow-hidden rounded-lg">
        <div class="overflow-x-auto">
          <table class="w-full text-center border-collapse">
            <thead>
              <tr class="bg-[#222831] text-white text-[13px] font-bold tracking-wide uppercase">
                <th class="py-5 px-4 w-12 border-r border-slate-600">#</th>
                <th class="py-5 px-4 border-r border-slate-600">Owner Name</th>
                <th class="py-5 px-4 border-r border-slate-600">Email</th>
                <th class="py-5 px-4 border-r border-slate-600">Boarding House</th>
                <th class="py-5 px-4 border-r border-slate-600">Date</th>
                <th class="py-5 px-4 border-r border-slate-600">Documents</th>
                <th class="py-5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody class="text-[13px] font-medium text-slate-800">
              <tr v-if="applications.length === 0">
                <td colspan="7" class="py-20 text-slate-400 italic font-bold uppercase tracking-widest text-center">
                  No pending applications at the moment.
                </td>
              </tr>
              <tr v-for="(app, index) in applications" :key="app.id" class="border-b border-slate-200 hover:bg-slate-50 transition">
                <td class="py-6 px-4 border-r border-slate-200 text-slate-500 font-bold">
                  {{ index + 1 }}
                </td>
                <td class="py-6 px-4 border-r border-slate-200 font-semibold">
                  {{ app.owner_name }}
                </td>
                <td class="py-6 px-4 border-r border-slate-200 text-slate-600">
                  {{ app.owner_email }}
                </td>
                <td class="py-6 px-4 border-r border-slate-200 font-black text-slate-900">
                  {{ app.name }}
                </td>
                <td class="py-6 px-4 border-r border-slate-200 text-slate-400 font-bold">
                  {{ app.created_at ? new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A' }}
                </td>
                <td class="py-6 px-4 border-r border-slate-200">
                  <button @click="openDocViewer(app)" class="text-blue-500 border border-blue-200 bg-white hover:bg-blue-50 rounded px-5 py-2 flex items-center justify-center gap-2 mx-auto transition text-[11px] font-black uppercase tracking-widest shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    View Docs
                  </button>
                </td>
                <td class="py-6 px-4">
                  <button @click="openChecklist(app)" class="bg-[#1e8b52] hover:bg-[#166c3f] text-white rounded px-5 py-2 flex items-center justify-center gap-2 mx-auto transition shadow-md text-[11px] font-black uppercase tracking-widest">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="m9 11-2 2 4 4L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                    Requirement Checklist
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- Checklist Modal -->
    <div v-if="showChecklistModal" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex justify-center items-center p-8">
      <div class="bg-[#f8fafc] w-full max-w-6xl rounded shadow-2xl flex flex-col overflow-hidden max-h-[95vh] text-left">
        <div class="bg-[#2563eb] text-white px-8 py-5 flex justify-between items-center rounded-t sticky top-0 z-[60] shadow-sm shrink-0">
          <div class="flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="15" y2="17" />
            </svg>
            <h2 class="text-lg font-bold tracking-tight uppercase">Requirement Checklist</h2>
          </div>
          <button @click="closeChecklist" class="text-white hover:text-blue-100 transition flex items-center justify-center h-10 w-10 rounded-full hover:bg-white/10">
            &times;
          </button>
        </div>

        <form @submit.prevent="handleConfirmAccreditation" class="flex flex-col h-full overflow-hidden">
          <div class="p-10 overflow-y-auto grow">
            <!-- Simple Header -->
            <div class="mb-8 border-b border-slate-100 pb-4">
              <h3 class="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em]">Institutional Compliance List</h3>
            </div>

            <!-- Reverification Banner -->
            <div v-if="activeApp && activeApp.document_update_pending" class="mb-6 bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-2xl shadow-sm">
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h4 class="text-[11px] font-bold text-amber-800 uppercase tracking-widest mb-1">Institutional Re-Verification</h4>
                  <p class="text-[13px] font-medium text-amber-700 leading-tight">
                    The owner has resubmitted the <span class="font-bold underline">{{ getUpdatedDocNames(activeApp) }}</span>. Please carefully review the new evidence (highlighted in the checklist below) for institutional compliance.
                  </p>
                </div>
              </div>
            </div>

            <!-- Resubmission Banner -->
            <div v-if="activeApp && activeApp.is_resubmission" class="mb-6 bg-blue-50 border-l-4 border-blue-500 p-5 rounded-r-2xl shadow-sm">
              <div class="flex items-start gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500 mt-1">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <div class="w-full">
                  <h4 class="text-[11px] font-bold text-blue-900 uppercase tracking-widest mb-1">Resubmission Alert</h4>
                  <p class="text-[10px] text-blue-700 leading-relaxed font-medium">This property was previously <strong class="text-red-600 font-bold">REJECTED</strong>. The owner has corrected their application and resubmitted it for your review.</p>

                  <!-- Previous Remarks -->
                  <div v-if="activeApp.admin_comments" class="mt-3 p-3 bg-white/60 rounded-xl border border-blue-200">
                    <p class="text-[9px] font-bold text-blue-400 uppercase tracking-widest mb-1">Previous Admin Remarks:</p>
                    <p class="text-[10px] text-slate-600 font-semibold italic">{{ activeApp.admin_comments }}</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="overflow-hidden border border-slate-100 rounded-2xl shadow-sm mb-10 bg-white">
              <table class="w-full text-slate-800 border-collapse">
                <thead>
                  <tr class="bg-slate-50/80 text-[10px] font-bold text-left uppercase text-slate-400 tracking-widest border-b border-slate-100">
                    <th class="p-5 w-20 text-center">#</th>
                    <th class="p-5">Checklist Item</th>
                    <th class="p-5 text-center">File Evidence</th>
                    <th class="p-5 text-center">Verification</th>
                  </tr>
                </thead>
                <tbody class="text-[12px] font-medium">
                  <tr v-for="(item, i) in activeCriteria" :key="item.id"
                      class="border-b border-slate-50 last:border-0 hover:bg-amber-50/40 transition-colors"
                      :class="isRowHighlighted(activeApp, item) ? 'bg-amber-100 border-l-4 border-l-amber-500 shadow-inner' : ''">
                    <td class="p-6 text-center text-slate-300 font-bold text-xs italic">
                      {{ i + 1 }}
                    </td>
                    <td class="p-6">
                      <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-3">
                          <span class="text-slate-800 font-semibold text-[14px] tracking-tight">
                            {{ item.label }}
                          </span>
                          <span v-if="!item.house_id" class="px-2.5 py-0.5 rounded-full text-[7px] font-bold uppercase tracking-widest bg-blue-50 text-blue-500 border border-blue-100 shadow-sm">Official Policy</span>
                          <span v-if="isRowHighlighted(activeApp, item)" class="px-2 py-0.5 rounded-full text-[7px] font-bold uppercase tracking-widest bg-amber-500 text-white shadow-md">Needs Review</span>
                        </div>
                      </div>
                    </td>
                    <td class="p-6 text-center">
                      <div class="flex items-center justify-center">
                        <template v-if="item.permit_key ? activeApp[item.permit_key] : dynamicDocs.find(d => d.house_id === activeApp.id && d.criteria_label === item.label)">
                          <a :href="getImageUrl(item.permit_key ? activeApp[item.permit_key] : dynamicDocs.find(d => d.house_id === activeApp.id && d.criteria_label === item.label).file_path)"
                             target="_blank"
                             @mouseenter="showPreview($event, getImageUrl(item.permit_key ? activeApp[item.permit_key] : dynamicDocs.find(d => d.house_id === activeApp.id && d.criteria_label === item.label).file_path))"
                             @mouseleave="hidePreview"
                             class="text-blue-600 hover:text-blue-800 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" />
                            </svg>
                            View File
                          </a>
                        </template>
                        <template v-else>
                          <span class="text-slate-200 italic text-[10px] font-bold uppercase tracking-widest">No File Attached</span>
                        </template>
                      </div>
                    </td>
                    <td class="p-6">
                      <div class="flex justify-center">
                        <input v-model="checklistChecks[item.id]" type="checkbox" class="w-6 h-6 rounded-md border-slate-300 text-[#2563eb] focus:ring-0 cursor-pointer transition-all hover:scale-110 shadow-sm" />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="mt-8">
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-4 tracking-[0.2em]">Administrative Remarks / Rejection Feedback</label>
              <textarea v-model="adminComments" rows="4" class="w-full bg-slate-50 border-2 border-slate-100 p-6 rounded-3xl text-sm font-semibold text-slate-700 focus:bg-white focus:border-blue-500 outline-none transition shadow-inner" placeholder="Provide constructive feedback for the owner if rejection is necessary..."></textarea>
            </div>
          </div>

          <div class="bg-slate-50 p-8 border-t border-slate-100 flex flex-wrap justify-between items-center gap-4 rounded-b sticky bottom-0 z-50">
            <button type="button" @click="triggerConfirm('Confirm Rejection?', 'Are you sure you want to reject this boarding house application with current comments?', handleRejectApplication)"
                    class="bg-white hover:bg-red-50 text-red-500 border-2 border-red-200 rounded-xl px-8 py-3 font-bold text-[11px] uppercase tracking-widest transition shadow-sm flex items-center justify-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              Reject
            </button>

            <div class="flex flex-wrap gap-3">
              <button type="submit" class="bg-[#2563eb] hover:bg-blue-700 text-white rounded-xl px-8 py-3 font-bold text-[11px] uppercase tracking-widest transition shadow-md flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Confirm Verification
              </button>
              <button type="button" @click="showAddModal = true" class="bg-[#166534] hover:bg-emerald-800 text-white rounded-xl px-6 py-3 font-bold text-[11px] uppercase tracking-widest transition shadow-md flex items-center justify-center gap-2">
                &plus; Add Criteria
              </button>
              <button type="button" @click="showUpdateModal = true" class="bg-[#d97706] hover:bg-amber-700 text-white rounded-xl px-6 py-3 font-bold text-[11px] uppercase tracking-widest transition shadow-md flex items-center justify-center gap-2">
                Update Criteria
              </button>
              <button type="button" @click="showDeleteModal = true" class="bg-[#b91c1c] hover:bg-red-800 text-white rounded-xl px-6 py-3 font-bold text-[11px] uppercase tracking-widest transition shadow-md flex items-center justify-center gap-2">
                Delete Criteria
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Document Viewer Modal -->
    <div v-if="showDocModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex justify-center items-center p-8">
      <div class="bg-white w-full max-w-6xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in duration-300 text-left">
        <div class="bg-[#2563eb] text-white px-10 py-6 flex justify-between items-center shrink-0">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
              </svg>
            </div>
            <h2 class="text-xl font-black uppercase tracking-tight">{{ activeApp ? activeApp.owner_name : '' }} - Legal Documents</h2>
          </div>
          <button @click="closeDocViewer" class="text-white hover:text-red-300 transition flex items-center justify-center h-10 w-10 rounded-full hover:bg-white/10 text-2xl focus:outline-none">
            &times;
          </button>
        </div>
        <div class="p-10 overflow-y-auto grow bg-white">
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-8">
            <div v-for="doc in activeDocs" :key="doc.label">
              <div v-if="!doc.file" class="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] p-10 h-80 flex flex-col items-center justify-center text-center opacity-60">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-slate-300 mb-4">
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><circle cx="10" cy="13" r="1" /><circle cx="10" cy="17" r="1" />
                </svg>
                <h3 class="font-black text-[11px] text-slate-400 uppercase tracking-widest">{{ doc.label }}</h3>
                <p class="text-[8px] text-slate-300 mt-1 font-bold uppercase tracking-widest">NOT UPLOADED</p>
              </div>

              <div v-else class="bg-white border border-slate-100 rounded-[2rem] shadow-md overflow-hidden h-80 flex flex-col group transition hover:shadow-2xl hover:-translate-y-1">
                <div class="h-56 bg-slate-50 relative flex items-center justify-center p-6">
                  <img :src="getImageUrl(doc.file)" class="w-full h-full object-contain filter group-hover:scale-110 transition duration-500" />
                  <div class="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center">
                    <a :href="getImageUrl(doc.file)" target="_blank" class="bg-white text-slate-900 px-6 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-600 hover:text-white transition">Full Preview</a>
                  </div>
                </div>
                <div class="p-6 text-center border-t border-slate-50 flex-1 flex flex-col justify-center">
                  <h3 class="font-black text-[12px] leading-tight text-slate-900 uppercase tracking-tight">{{ doc.label }}</h3>
                  <p class="text-[8px] mt-2 font-black uppercase tracking-widest" :class="doc.isDynamic ? 'text-blue-500' : 'text-slate-400'">
                    {{ doc.isDynamic ? 'New Requirement' : 'Verification Required' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Management Modals (Add) -->
    <div v-if="showAddModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex justify-center items-center p-4">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden text-left animate-in zoom-in-95 duration-200">
        <div class="bg-[#10b981] text-white px-8 py-5 flex justify-between items-center">
          <h3 class="font-black text-lg uppercase tracking-tight">Add New Criteria</h3>
          <button @click="showAddModal = false" class="text-white hover:text-emerald-100 transition text-2xl focus:outline-none">&times;</button>
        </div>
        <form @submit.prevent="handleAddCriteria" class="p-10">
          <div class="mb-8">
            <label class="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Criteria Label</label>
            <input v-model="newCriteriaLabel" type="text" required placeholder="e.g. Health Certificate" class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-0 focus:border-emerald-500 outline-none transition font-bold text-slate-700" />
          </div>
          <div class="flex justify-end gap-4">
            <button type="button" @click="showAddModal = false" class="px-8 py-3 text-slate-400 font-black text-[11px] uppercase tracking-widest hover:text-slate-600 focus:outline-none">Cancel</button>
            <button type="submit" class="bg-[#10b981] hover:bg-emerald-600 text-white px-10 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg transition">Add Item</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Management Modals (Update) -->
    <div v-if="showUpdateModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex justify-center items-center p-4">
      <div class="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden text-left animate-in zoom-in-95 duration-200">
        <div class="bg-[#f59e0b] text-white px-8 py-5 flex justify-between items-center">
          <h3 class="font-black text-lg uppercase tracking-tight">Update System Criteria</h3>
          <button @click="showUpdateModal = false" class="text-white hover:text-amber-100 transition text-2xl focus:outline-none">&times;</button>
        </div>
        <div class="p-10 max-h-[60vh] overflow-y-auto">
          <div class="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl mb-6 flex gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="text-[10px] font-bold uppercase tracking-widest leading-relaxed">
              Note: You can only update custom criteria that you have added. The 8 required institutional documents cannot be modified here.
            </p>
          </div>
          <div class="space-y-4">
            <template v-for="item in activeCriteria" :key="item.id">
              <div v-if="item.house_id" class="flex items-center justify-between p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl hover:border-amber-400 transition">
                <span class="text-sm font-black text-slate-700 uppercase tracking-tight">
                  {{ item.label }}
                </span>
                <button @click="startEditingItem(item)" class="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition shadow-sm">Edit</button>
              </div>
            </template>
            <div v-if="!activeCriteria.some(c => c.house_id)" class="py-10 flex flex-col items-center justify-center text-center opacity-40">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="mb-4">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <p class="text-[10px] font-black uppercase tracking-widest">No custom criteria to manage</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Item Modal (Sub-Update) -->
    <div v-if="showEditItemModal" class="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[130] flex justify-center items-center p-4">
      <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden text-left animate-in zoom-in-95 duration-200">
        <div class="bg-[#f59e0b] text-white px-8 py-5 flex justify-between items-center">
          <h3 class="font-black text-lg uppercase tracking-tight">Edit Criteria</h3>
          <button @click="showEditItemModal = false" class="text-white hover:text-amber-100 transition text-2xl focus:outline-none">&times;</button>
        </div>
        <form @submit.prevent="handleSaveItemEdit" class="p-10">
          <div class="mb-8">
            <label class="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">Update Label</label>
            <input v-model="editingCriteriaItem.label" type="text" required class="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-0 focus:border-amber-500 outline-none transition font-bold text-slate-700" />
          </div>
          <div class="flex justify-end gap-4">
            <button type="button" @click="showEditItemModal = false" class="px-8 py-3 text-slate-400 font-black text-[11px] uppercase tracking-widest hover:text-slate-600 focus:outline-none">Cancel</button>
            <button type="submit" class="bg-[#f59e0b] hover:bg-amber-600 text-white px-10 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest shadow-lg transition">Save Changes</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Criteria Modal -->
    <div v-if="showDeleteModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex justify-center items-center p-4">
      <div class="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden text-left animate-in zoom-in-95 duration-200">
        <div class="bg-[#ef4444] text-white px-8 py-5 flex justify-between items-center">
          <h3 class="font-black text-lg uppercase tracking-tight">Remove Criteria</h3>
          <button @click="showDeleteModal = false" class="text-white hover:text-red-100 transition text-2xl focus:outline-none">&times;</button>
        </div>
        <div class="p-10 max-h-[60vh] overflow-y-auto">
          <div class="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl mb-6 flex gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p class="text-[10px] font-bold uppercase tracking-widest leading-relaxed">
              Note: You can only delete custom criteria that you have added. The 8 required institutional documents are permanent and cannot be deleted.
            </p>
          </div>
          <div class="space-y-4">
            <template v-for="item in activeCriteria" :key="item.id">
              <div v-if="item.house_id" class="flex items-center justify-between p-5 bg-red-50 border-2 border-red-100 rounded-2xl hover:border-red-400 transition">
                <span class="text-sm font-black text-slate-700 uppercase tracking-tight">
                  {{ item.label }}
                </span>
                <button type="button" @click="triggerConfirm('Confirm Delete?', `Are you sure you want to delete '${item.label}' criteria permanently?`, () => handleDeleteCriteria(item.id))"
                        class="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition shadow-sm">Delete</button>
              </div>
            </template>
            <div v-if="!activeCriteria.some(c => c.house_id)" class="py-10 flex flex-col items-center justify-center text-center opacity-40">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="mb-4">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <p class="text-[10px] font-black uppercase tracking-widest">No custom criteria to manage</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Custom Confirmation Modal -->
    <div v-if="showConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center border border-slate-100 animate-in zoom-in-95 duration-200">
        <div class="text-[#2a528a] mb-4 flex justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">{{ confirmTitle }}</h3>
        <p class="text-slate-500 text-xs font-medium mb-6 leading-relaxed">{{ confirmMessage }}</p>
        
        <div class="flex gap-3">
          <button @click="executeConfirm" class="flex-1 bg-blue-600 hover:bg-black text-white text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition active:scale-95">
            Confirm
          </button>
          <button @click="showConfirmModal = false" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black py-3.5 rounded-xl uppercase tracking-widest transition active:scale-95">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Live Document Hover Preview Container -->
    <div v-show="isHoverPreviewVisible" class="fixed z-[1000] bg-white border-4 border-white rounded-[1.5rem] shadow-2xl w-80 overflow-hidden pointer-events-none transition-all duration-200"
         :style="{ left: `${hoverPreviewX}px`, top: `${hoverPreviewY}px` }">
      <img :src="hoverPreviewUrl" alt="Preview Image" class="w-full h-auto max-h-[400px] object-cover" />
    </div>

  </div>
</template>
