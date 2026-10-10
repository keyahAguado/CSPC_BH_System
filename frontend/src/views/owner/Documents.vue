<!-- Documents.vue (Updated Script Section) -->
<script setup>
import LoadError from '../../components/management/LoadError.vue';

import PageHeader from '../../components/management/PageHeader.vue';
import '../../styles/management.css';
const isValidPermitDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
};
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import OwnerNav from '../../components/partials/OwnerNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';
import heic2any from 'heic2any';

const route = useRoute();
const router = useRouter();

import { getImageUrl } from '../../config/api';

const house = ref(null);
const criteria = ref([]);
const fileInputs = ref({}); // Store file inputs: { identifier: File }
const expiryDates = ref({}); // Store expiry date inputs: { identifier: 'YYYY-MM-DD' }
const isRejected = ref(false);
const isResubmitted = ref(false);
const adminComments = ref('');

const ownerProperties = ref([]);
const selectedHouseId = ref('');

const isLoading = ref(true);
const isUpdating = ref({});
const alertRef = ref(null);
const token = sessionStorage.getItem('cspc_token');

const showSystemAlert = (message, type = 'error') => {
  if (alertRef.value) {
    alertRef.value.showSystemAlert(message, type);
  }
};

const getDocStatus = (dateVal) => {
  if (!dateVal) return 'none';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return 'none';
  
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });
  const expiryStr = formatter.format(d);
  const todayStr = formatter.format(new Date());
  
  if (expiryStr <= todayStr) return 'expired';
  
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 30);
  const thirtyDaysStr = formatter.format(thirtyDays);
  
  if (expiryStr <= thirtyDaysStr) return 'warning';
  return 'valid';
};

const fetchOwnerProperties = async () => {
  try {
    const res = await axios.get('/api/boarding-houses/my-property', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data.success) {
      ownerProperties.value = res.data.properties || (res.data.data ? [res.data.data] : []);
      
      const paramId = route.params.id;
      const queryHouseName = route.query.houseName;
      
      if (paramId) {
        selectedHouseId.value = paramId;
      } else if (queryHouseName) {
        const matched = ownerProperties.value.find(p => (p.name || '').toLowerCase() === queryHouseName.toLowerCase());
        if (matched) {
          selectedHouseId.value = matched.id;
        } else if (ownerProperties.value.length > 0) {
          selectedHouseId.value = ownerProperties.value[0].id;
        }
      } else if (ownerProperties.value.length > 0) {
        selectedHouseId.value = ownerProperties.value[0].id;
      }
    }
  } catch (err) {
    console.warn('Failed to load owner properties list:', err);
  }
};

const fetchDocuments = async (overrideId) => {
  loadError.value = '';
  try {
    isLoading.value = true;
    const houseId = overrideId || selectedHouseId.value || route.params.id || '';
    
    // Fetch records using correct boarding-houses prefix
    const response = await axios.get(`/api/boarding-houses/documents/${houseId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

     if (response.data.success) {
      house.value = response.data.house;
      if (house.value && house.value.id) {
        selectedHouseId.value = house.value.id;
      }
      const rawCriteria = response.data.criteria || [];
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
      criteria.value = rawCriteria.sort((a, b) => {
        const orderA = a.permit_key ? (mandatoryOrder[a.permit_key] || 90) : 99;
        const orderB = b.permit_key ? (mandatoryOrder[b.permit_key] || 90) : 99;
        return orderA - orderB;
      });
      
      // Active Rejection: Still rejected, no files uploaded yet
      isRejected.value = house.value?.house_status === 'rejected';
      
      // Pending Re-Verification: Re-uploaded corrected files, waiting for Admin review
      isResubmitted.value = house.value?.house_status === 'pending' && (house.value?.is_resubmission === 1 || house.value?.is_resubmission === true);
      
      adminComments.value = house.value?.admin_comments || '';
      // Initialize expiry date model defaults
      criteria.value.forEach(p => {
        const idKey = p.permit_key || p.id;
        
        if (p.current_expiry) {
          const dateObj = new Date(p.current_expiry);
          // Check if the date is valid before parsing to prevent time-value range crashes
          if (!isNaN(dateObj.getTime())) {
            expiryDates.value[idKey] = dateObj.toISOString().split('T')[0];
          } else {
            console.warn(`[DEBUG] Invalid date format for key ${idKey}:`, p.current_expiry);
            expiryDates.value[idKey] = '';
          }
        } else {
          expiryDates.value[idKey] = '';
        }
      });
      console.log('[DEBUG] Loaded document expiries:', expiryDates.value);
    }
  } catch (error) {
    loadError.value = 'The server did not return these records. Refresh the page to try again.';
    console.error('Failed to load documents details:', error);
    showSystemAlert('Could not fetch legal documents data.', 'warning');
  } finally {
    isLoading.value = false;
  }
};

const handleHouseSwitch = (e) => {
  const newId = e.target.value;
  if (newId) {
    selectedHouseId.value = newId;
    fetchDocuments(newId);
  }
};

// Exposing file change handler to Vue Context (_ctx)
const handleFileChange = async (e, identifier) => {
  let file = e.target.files[0];
  if (!file) return;

  // Image-only validation — same as OwnerAccreditation
  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif'];
  const fileName = file.name.toLowerCase();
  const isImageMime = file.type.startsWith('image/');
  const hasImageExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
  if (!isImageMime && !hasImageExtension) {
    showSystemAlert('Invalid file type. Only image files (PNG, JPG, JPEG, WEBP, HEIC) are allowed.', 'error');
    e.target.value = '';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showSystemAlert('File is too large. Maximum size is 10MB.', 'error');
    e.target.value = '';
    return;
  }

  // Automatically transcode HEIC files to JPEG standard
  if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
    try {
      console.log(`[HEIC] Transcoding ${file.name} to JPEG...`);
      showSystemAlert('Transcoding HEIC image... Please wait.', 'success');
      
      const convertedBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.8
      });
      
      // Reconstruct File instance
      const targetName = file.name.replace(/\.[^/.]+$/, "") + ".jpeg";
      file = new File([convertedBlob], targetName, { type: 'image/jpeg' });
      console.log(`[HEIC] Transcoded successfully as: ${file.name}`);
    } catch (err) {
      console.error('[HEIC] Transcoding failed:', err);
      showSystemAlert('HEIC conversion failed. Please upload a standard JPG/PNG file.', 'error');
    }
  }

  fileInputs.value[identifier] = file;
  console.log(`[DEBUG] Staging file update for "${identifier}":`, file.name);
};

const saveDocumentUpdate = async (p) => {
  const identifier = p.permit_key || p.id;
  const isCustom = p.permit_key ? 'false' : 'true';
  const file = fileInputs.value[identifier];
  const expiry = expiryDates.value[identifier];

  if (!file) {
    showSystemAlert('Please select a new scanned file to upload.', 'error');
    return;
  }

  if (!expiry) {
    showSystemAlert('Please specify the permit expiry date.', 'error');
    return;
  }

  if (!isValidPermitDate(expiry)) {
    showSystemAlert('The document expiry date is invalid. Please enter a complete, valid date.', 'error');
    return;
  }

  console.log('[DEBUG] Dispatching Document Update:', {
    houseId: house.value?.id,
    identifier,
    isCustom,
    fileName: file.name,
    expiryDate: expiry
  });

  try {
    isUpdating.value[identifier] = true;
    const formData = new FormData();
    formData.append('identifier', identifier);
    formData.append('is_custom', isCustom);
    formData.append('permit_file', file);
    formData.append('expiry_date', expiry);

    // update endpoint
    const response = await axios.post(`/api/boarding-houses/documents/update/${house.value.id}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.success) {
      showSystemAlert(`${p.label} updated successfully for validation!`, 'success');
      
      // ─── LOCAL SESSION SYNCHRONIZER ───
      // If the owner resubmits documents while rejected, sync state to pending instantly
      const currentUser = JSON.parse(sessionStorage.getItem('cspc_user') || '{}');
      if (currentUser.houseStatus === 'rejected' || currentUser.house_status === 'rejected') {
        currentUser.houseStatus = 'pending';
        currentUser.house_status = 'pending';
        sessionStorage.setItem('cspc_user', JSON.stringify(currentUser));
      }
      
      // Fetch fresh records to reflect changes immediately
      await fetchDocuments();
    }
  } catch (error) {
    console.error('Failed to save document update:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to save document update.', 'error');
  } finally {
    isUpdating.value[identifier] = false;
  }
};

onMounted(async () => {
  await fetchOwnerProperties();
  await fetchDocuments();
});

const loadError = ref('');
</script>

<template>
  <div class="management-page management-form-page bg-slate-100 min-h-screen flex flex-col font-sans">
    <OwnerNav />
    <div aria-live="polite" aria-atomic="false"><FlashAlert ref="alertRef" /></div>

    <main id="management-content" tabindex="-1" class="flex-1 bg-slate-100 py-16 px-4">
      <LoadError :message="loadError" />
<PageHeader title="Legal documents" description="Inspect permit validity and submit document updates for administrative review." />
      
      <div class="max-w-3xl mx-auto mb-6 text-left">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <router-link to="/owner/dashboard" class="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-black uppercase tracking-wide transition">
            <i class="fa-solid fa-arrow-left"></i> Back to Dashboard
          </router-link>

          <!-- Boarding House Selector for Multi-Property Owners -->
          <div v-if="ownerProperties.length > 1" class="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
            <label class="text-[12px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">Property:</label>
            <select aria-label="Property:" :value="selectedHouseId" @change="handleHouseSwitch" class="bg-transparent font-semibold text-slate-800 text-xs outline-none cursor-pointer">
              <option v-for="p in ownerProperties" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
            </select>
          </div>
        </div>
        
        <!-- Rejection Warning Alert Card (Active Rejection) -->
        <div v-if="isRejected" class="mb-10 bg-[#fff1f2] border-2 border-[#fecaca] rounded-[2.5rem] p-10 shadow-sm relative overflow-hidden text-left">
          <div class="flex items-start gap-8 relative z-10">
            <div class="bg-[#ef4444] text-white w-16 h-16 rounded-[1.5rem] flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-200">
              <i class="fa-solid fa-circle-exclamation text-2xl"></i>
            </div>
            <div class="grow">
              <h3 class="text-[#991b1b] font-semibold uppercase text-xl tracking-tight mb-1">Application Rejected</h3>
              <p class="text-[#ef4444] text-[12px] font-bold uppercase tracking-normal mb-6">Please review the comments from SASO Admin below:</p>
              
              <div class="bg-white/90 border-2 border-[#fee2e2] rounded-[1.8rem] p-8 text-slate-700 text-sm font-medium italic shadow-inner mb-6">
                "{{ adminComments || 'No specific comments provided. Please ensure all documents are valid and clearly scanned.' }}"
              </div>
              
              <div class="flex items-center gap-3 text-[#ef4444]">
                <div class="w-2 h-2 bg-[#ef4444] rounded-full animate-ping"></div>
                <p class="text-[12px] font-semibold uppercase tracking-wide leading-relaxed">
                  <i class="fa-solid fa-info-circle mr-1"></i> You can update your information and re-upload the corrected documents below to resubmit your application.
                </p>
              </div>
            </div>
          </div>
          <div class="absolute -bottom-12 -right-12 w-48 h-48 bg-red-500/5 rounded-full blur-3xl"></div>
        </div>

        <!-- Resubmitted / Pending Re-Verification Banner -->
        <div v-if="isResubmitted" class="mb-10 bg-[#eff6ff] border-2 border-[#bfdbfe] rounded-[2.5rem] p-10 shadow-sm relative overflow-hidden text-left">
          <div class="flex items-start gap-8 relative z-10">
            <div class="bg-[#2563eb] text-white w-16 h-16 rounded-[1.5rem] flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-200">
              <i class="fa-solid fa-clock-rotate-left text-2xl"></i>
            </div>
            <div class="grow">
              <h3 class="text-[#1e40af] font-semibold uppercase text-xl tracking-tight mb-1">Updates Submitted for Review</h3>
              <p class="text-slate-500 text-[12px] font-bold uppercase tracking-normal mb-6">Status: Pending Re-Verification</p>
              
              <div class="bg-white/90 border-2 border-blue-100 rounded-[1.8rem] p-8 text-slate-700 text-sm font-medium italic shadow-inner mb-6">
                You have successfully uploaded corrected document files. The SASO Admin has been notified of your updates and is currently reviewing your resubmission. No further action is required from you at this time.
              </div>
              
              <div class="flex items-center gap-3 text-blue-600">
                <div class="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                <p class="text-[12px] font-semibold uppercase tracking-wide leading-relaxed">
                  <i class="fa-solid fa-circle-info mr-1"></i> Your listing will automatically return to active accredited status once approved by the administrator.
                </p>
              </div>
            </div>
          </div>
          <div class="absolute -bottom-12 -right-12 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl"></div>
        </div>
      </div>

      <!-- Main Loader state (PWA inline SVG Loader) -->
      <div v-if="isLoading" class="max-w-3xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-12 text-center flex flex-col items-center justify-center">
        <svg class="animate-spin h-10 w-10 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-slate-400 font-bold uppercase text-[12px] tracking-wide">Loading documents records...</p>
      </div>

      <!-- Main Box -->
      <div v-else class="max-w-3xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden text-left animate-in fade-in duration-300">
        <div class="p-8 md:p-12">
          
          <div class="flex flex-col items-center justify-center text-center mb-8 border-b border-slate-100 pb-8 text-black">
            <div class="flex items-center justify-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-[#2a528a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <h2 class="text-xl font-semibold tracking-tight text-slate-800">Document requirements</h2>
            </div>
            <p v-if="house?.name" class="text-[#2a528a] text-sm font-semibold uppercase tracking-wider mt-2">
              {{ house.name }}
            </p>
          </div>

          <div class="bg-[#fef3c7] text-[#c2862c] px-6 py-5 rounded-md mb-10 text-[14px]">
            <div class="flex flex-col gap-1">
              <p>Ensure your permits are always up-to-date. Select a new file and date, then click <span class="font-bold underline">Save Update</span>.</p>
              <p class="text-[12px] font-semibold uppercase tracking-tight text-amber-600 italic">Note: You must click "Save Update" for each specific document you change.</p>
            </div>
          </div>

          <!-- Criteria Documents list loop -->
          <div class="space-y-8">
            <div v-for="(p, index) in criteria" :key="p.id || index" 
                 class="border border-slate-200 rounded-xl p-6 bg-slate-50/50 relative overflow-hidden group hover:border-blue-300 transition">
              
              <!-- Expiry Badges -->
              <div class="absolute top-0 right-0 px-3 py-1 text-[12px] font-semibold uppercase tracking-wide text-white"
                   :class="[
                     getDocStatus(p.current_expiry) === 'expired' ? 'bg-red-500' :
                     getDocStatus(p.current_expiry) === 'warning' ? 'bg-orange-400' : 
                     getDocStatus(p.current_expiry) === 'valid' ? 'bg-green-500' : 'bg-slate-400'
                   ]">
                {{ 
                  getDocStatus(p.current_expiry) === 'expired' ? 'Expired' :
                  getDocStatus(p.current_expiry) === 'warning' ? 'Expiring Soon' : 
                  getDocStatus(p.current_expiry) === 'valid' ? 'Valid' : 'No Expiry Set'
                }}
              </div>

              <div class="flex items-center gap-2 mb-4 pr-24 flex-wrap">
                <h3 class="text-[13px] font-bold text-slate-800">{{ index + 1 }}. {{ p.label }}</h3>
                <span 
                  class="px-2.5 py-0.5 rounded-full text-[12px] font-semibold uppercase tracking-wider shrink-0"
                  :class="['permit_business_form', 'permit_barangay', 'permit_fire', 'permit_sanitary'].includes(p.permit_key) ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-slate-100 text-slate-500 border border-slate-200'"
                >
                  {{ ['permit_business_form', 'permit_barangay', 'permit_fire', 'permit_sanitary'].includes(p.permit_key) ? 'Required' : 'Optional' }}
                </span>
              </div>
              
              <!-- Re-verification Pending badge indicator -->
              <div v-if="house?.document_update_pending && house?.last_updated_document == (p.permit_key || p.id)" 
                   class="mb-6 inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 px-3 py-1 rounded-full w-fit">
                <div class="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></div>
                <span class="text-[12px] font-semibold uppercase tracking-wide">Pending Re-verification</span>
              </div>

              <!-- Saved record feedback -->
              <div v-if="p.current_file" class="flex items-center gap-3 mb-6 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                <div class="w-8 h-8 rounded bg-blue-50 flex items-center justify-center text-blue-500">
                  <i class="fa-solid fa-file-image"></i>
                </div>
                <div>
                  <a :href="getImageUrl(p.current_file)" target="_blank" class="text-xs font-bold text-blue-600 hover:underline truncate max-w-[200px] block">
                    View Current File
                  </a>
                  <p class="text-[12px] font-semibold text-slate-400">
                    Expiry: {{ p.current_expiry ? new Date(p.current_expiry).toLocaleDateString() : 'N/A' }}
                  </p>
                </div>
              </div>

              <div v-else class="mb-6 inline-flex items-center gap-1.5 bg-red-500 text-white px-3 py-1 rounded-full w-fit shadow-sm">
                <i class="fa-solid fa-file-circle-plus text-[12px]"></i>
                <span class="text-[12px] font-semibold uppercase tracking-wide">Document Missing</span>
              </div>

              <!-- Update specific document form -->
              <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 items-end">
                <div class="w-full">
                  <label class="block text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5 ml-1">New File (Required)</label>
                  <input aria-label="New File (Required)" type="file" @change="e => handleFileChange(e, p.permit_key || p.id)" required
                      accept="image/png,image/jpeg,image/jpg,image/webp,.heic,.heif"
                      class="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:border-0 file:border-r file:border-slate-200 file:text-xs file:font-bold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer" />
                </div>
                
                <div class="w-full sm:w-48">
                  <label class="block text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5 ml-1">New Expiry</label>
                  <input aria-label="New Expiry" type="date" min="1000-01-01" max="9999-12-31" v-model="expiryDates[p.permit_key || p.id]" required
                      class="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-lg text-xs font-bold focus:border-blue-400 outline-none transition" />
                </div>

                <button type="button" @click="saveDocumentUpdate(p)" :disabled="isUpdating[p.permit_key || p.id]" class="w-full sm:w-auto bg-black hover:bg-slate-800 text-white px-6 py-2.5 rounded-lg text-[12px] font-semibold uppercase tracking-wide transition active:scale-95 whitespace-nowrap disabled:opacity-50 management-button">
                  {{ isUpdating[p.permit_key || p.id] ? 'Saving...' : 'Save Update' }}
                </button>
              </div>

            </div>
          </div>

        </div>
      </div>
    </main>
  </div>
</template>