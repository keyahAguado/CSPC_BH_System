<!-- Documents.vue (Updated Script Section) -->
<script setup>
import LoadError from '../../components/management/LoadError.vue';

import '../../styles/management.css';
import '../../styles/admin-theme.css';
const isValidPermitDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
};
import { ref, computed, onMounted } from 'vue';
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
const documentFiles = (document) => {
  const files = Array.isArray(document.current_files) && document.current_files.length
    ? document.current_files : document.current_file ? [document.current_file] : [];
  return [...new Set(files.filter(file => typeof file === 'string' && file.trim()))];
};
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
      delete fileInputs.value[identifier];
      await fetchDocuments();
      return true;
    }
  } catch (error) {
    console.error('Failed to save document update:', error);
    showSystemAlert(error.response?.data?.message || 'Failed to save document update.', 'error');
  } finally {
    isUpdating.value[identifier] = false;
  }
  return false;
};

onMounted(async () => {
  await fetchOwnerProperties();
  await fetchDocuments();
});

const loadError = ref('');

// Row 1: the four required permits. Row 2: the four additional permits. Extra SASO requirements follow.
const REQUIRED_KEYS = ['permit_business_form', 'permit_barangay', 'permit_fire', 'permit_sanitary'];
const isRequiredDoc = (p) => REQUIRED_KEYS.includes(p.permit_key);
const requiredDocs = computed(() => criteria.value.filter(isRequiredDoc));
const additionalDocs = computed(() => criteria.value.filter(p => !isRequiredDoc(p)));
const STATUS_TEXT = { expired: 'Expired', warning: 'Expiring soon', valid: 'Valid', none: 'No expiry set' };
const formatExpiry = (v) => (v ? new Date(v).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A');
const docKey = (p) => p.permit_key || p.id;
const statusLine = (p) => {
  if (!p.current_file) return 'Not uploaded';
  const status = getDocStatus(p.current_expiry);
  if (status === 'none') return 'Uploaded · no expiry set';
  return `${STATUS_TEXT[status]} · ${status === 'expired' ? 'expired' : 'expires'} ${formatExpiry(p.current_expiry)}`;
};

// Header status chip
const HOUSE_STATUS = {
  accredited: { label: 'Accredited', tone: 'success' },
  pending: { label: 'Pending review', tone: 'warning' },
  rejected: { label: 'Rejected', tone: 'danger' },
  archived: { label: 'Archived', tone: 'neutral' }
};
const houseStatus = computed(() => HOUSE_STATUS[house.value?.house_status] || null);

// Per-document status pill and icon
const PILL_TEXT = { expired: 'Expired', warning: 'Expiring soon', valid: 'Valid', none: 'Uploaded' };
const docTone = (p) => (p.current_file ? getDocStatus(p.current_expiry) : 'missing');
const docPill = (p) => (p.current_file ? PILL_TEXT[getDocStatus(p.current_expiry)] : 'Not uploaded');
const DOC_ICONS = { permit_fire: 'fa-shield-halved', permit_sanitary: 'fa-notes-medical' };
const docIcon = (p) => DOC_ICONS[p.permit_key] || 'fa-file-lines';

// Line under each document name: pending review or needed action (nothing when up to date)
const docNote = (p) => {
  if (house.value?.document_update_pending && house.value?.last_updated_document == docKey(p)) return { tone: 'pending', icon: 'fa-rotate', text: 'Pending re-verification' };
  const tone = docTone(p);
  if (tone === 'missing') return isRequiredDoc(p)
    ? { tone: 'danger', icon: 'fa-circle-exclamation', text: 'Needs action · upload required' }
    : null;
  if (tone === 'expired') return { tone: 'danger', icon: 'fa-circle-exclamation', text: 'Needs action · renew now' };
  if (tone === 'warning') return { tone: 'expiry', icon: 'fa-clock', text: 'Needs action · renew soon' };
  return null;
};

// Collapsible sections
const collapsed = ref({ required: false, additional: false });

</script>


<template>
  <div class="management-page owner-page docs-page flex flex-col font-sans">
    <OwnerNav />
    <div aria-live="polite" aria-atomic="false"><FlashAlert ref="alertRef" /></div>

    <main id="management-content" tabindex="-1" class="docs-main">
      <LoadError :message="loadError" />

      <!-- Status banners -->
      <div v-if="isRejected" class="docs-banner is-danger" role="alert">
        <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
        <div>
          <strong>Application rejected.</strong>
          <span>"{{ adminComments || 'No specific comments provided. Please ensure all documents are valid and clearly scanned.' }}"</span>
          <span class="docs-banner-hint">Re-upload the corrected documents below to resubmit.</span>
        </div>
      </div>
      <div v-if="isResubmitted" class="docs-banner is-info" role="status">
        <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
        <div>
          <strong>Updates submitted for review.</strong>
          <span>SASO is reviewing your corrected files. Your listing returns to accredited status once approved.</span>
        </div>
      </div>

      <div class="dx-panel">
        <!-- Panel header -->
        <header class="dx-head">
          <span class="dx-head-badge" aria-hidden="true"><i class="fa-solid fa-folder-open"></i></span>
          <h1>Legal documents</h1>
          <div class="dx-head-chips">
            <label v-if="ownerProperties.length > 1" class="dx-chip dx-chip-select">
              <span class="dx-sr">Property</span>
              <select :value="selectedHouseId" @change="handleHouseSwitch">
                <option v-for="prop in ownerProperties" :key="prop.id" :value="prop.id">{{ prop.name }}</option>
              </select>
              <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
            </label>
            <span v-else-if="house?.name" class="dx-chip">{{ house.name }}</span>
            <span v-if="houseStatus" :class="['dx-chip', 'dx-status', 'is-' + houseStatus.tone]"><span class="dx-dot" aria-hidden="true"></span>{{ houseStatus.label }}</span>
          </div>
        </header>

        <div v-if="isLoading" class="docs-loading" role="status">
          <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading documents…
        </div>

        <div v-else class="dx-sections">
          <section v-for="section in [{ key: 'required', title: 'Required Documents', icon: 'fa-shield-halved', items: requiredDocs, offset: 0 }, { key: 'additional', title: 'Additional Documents', icon: 'fa-folder-open', items: additionalDocs, offset: requiredDocs.length }]"
                   v-show="section.items.length" :key="section.key" :class="['dx-section', 'is-' + section.key]" :aria-label="section.title">
            <button type="button" class="dx-section-head" :aria-expanded="!collapsed[section.key]" @click="collapsed[section.key] = !collapsed[section.key]">
              <i :class="['fa-solid', section.icon, 'dx-section-icon']" aria-hidden="true"></i>
              <h2>{{ section.title }}</h2>
              <span class="dx-count">{{ section.key === 'required' ? 'Required' : 'Optional' }} (Items {{ section.offset + 1 }}-{{ section.offset + section.items.length }})</span>
              <i :class="['fa-solid', 'dx-chevron', collapsed[section.key] ? 'fa-chevron-down' : 'fa-chevron-up']" aria-hidden="true"></i>
            </button>

            <div v-show="!collapsed[section.key]" class="dx-grid">
              <article v-for="(p, idx) in section.items" :key="p.id || docKey(p)" class="dx-card">
                <div class="dx-card-top">
                  <div class="dx-info">
                    <h3><span class="dx-num">{{ section.offset + idx + 1 }}.</span> {{ p.label }}</h3>
                    <p v-if="docNote(p)" :class="['dx-note', 'is-' + docNote(p).tone]"><i :class="['fa-solid', docNote(p).icon]" aria-hidden="true"></i>{{ docNote(p).text }}</p>
                  </div>
                  <span v-if="!isRequiredDoc(p) && !p.current_file" class="dx-pill is-optional">Optional</span>
                  <span v-else :class="['dx-pill', 'is-' + docTone(p)]">{{ docPill(p) }}</span>
                </div>

                <!-- Inline update form: file + view, editable expiry date, save -->
                <div class="dx-field">
                  <span class="dx-label">Scanned File</span>
                  <div class="dx-file-row">
                    <label class="dx-file" :title="fileInputs[docKey(p)]?.name || 'Choose a scanned file'">
                      <span class="dx-file-btn">Choose File</span>
                      <span :class="['dx-file-name', { 'has-file': fileInputs[docKey(p)] }]">
                        <i v-if="fileInputs[docKey(p)]" class="fa-solid fa-circle-check" aria-hidden="true"></i>
                        {{ fileInputs[docKey(p)] ? fileInputs[docKey(p)].name : 'No file chosen' }}
                      </span>
                      <input :id="'docs-file-' + docKey(p)" type="file" class="dx-sr" :aria-label="'Scanned file for ' + p.label"
                             accept="image/png,image/jpeg,image/jpg,image/webp,.heic,.heif"
                             @click="e => e.target.value = ''" @change="e => handleFileChange(e, docKey(p))" />
                    </label>
                    <div v-if="documentFiles(p).length" class="dx-file-links">
                      <a v-for="(file, fileIndex) in documentFiles(p)" :key="file" :href="getImageUrl(file)" target="_blank" rel="noopener noreferrer" class="dx-view" :aria-label="'View ' + p.label + ', file ' + (fileIndex + 1)">
                        <i class="fa-regular fa-eye" aria-hidden="true"></i> {{ documentFiles(p).length > 1 ? 'File ' + (fileIndex + 1) : 'View' }}
                      </a>
                    </div>
                    <span v-else class="dx-view is-disabled" aria-disabled="true"><i class="fa-regular fa-eye-slash" aria-hidden="true"></i> View</span>
                  </div>
                </div>

                <div class="dx-field">
                  <label class="dx-label" :for="'docs-exp-' + docKey(p)">Expiration Date</label>
                  <div class="dx-date-row">
                    <input :id="'docs-exp-' + docKey(p)" type="date" min="1000-01-01" max="9999-12-31" v-model="expiryDates[docKey(p)]" class="dx-date" />
                    <button type="button" class="dx-save" @click="saveDocumentUpdate(p)" :disabled="isUpdating[docKey(p)]">
                      <i :class="isUpdating[docKey(p)] ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-check'" aria-hidden="true"></i>
                      {{ isUpdating[docKey(p)] ? 'Saving' : 'Save' }}
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Legal documents — same look as the accreditation form's Legal Documents step */
.docs-main { flex: 1; width: 100%; max-width: 1600px !important; padding: 18px clamp(16px, 2.2vw, 32px) 18px !important; text-align: left; }
.docs-main, .docs-main :is(h1, h2, h3, p, span, a, label, button, input, select, option, strong) { font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif !important; }
.docs-page { min-height: 100vh; height: auto; overflow: visible; }
.docs-page > .docs-main { display: flex; flex-direction: column; overflow: visible; }
.dx-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Banners */
.docs-banner { display: flex; align-items: flex-start; gap: 12px; padding: 10px 14px; margin-bottom: 12px; border-radius: 12px; font-size: 13px; line-height: 1.5; }
.docs-banner i { margin-top: 3px; }
.docs-banner div { display: flex; flex-wrap: wrap; gap: 4px 8px; }
.docs-banner-hint { font-weight: 600; }
.docs-banner.is-danger { background: #fbeae8; border: 1px solid #f0c9c5; color: #a93c34; }
.docs-banner.is-info { background: #e7eef8; border: 1px solid #c9d7ec; color: #1e4a8d; }

/* One white panel holding everything */
.dx-panel { flex: 1; display: flex; flex-direction: column; min-height: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 1px 2px rgba(20, 43, 74, .04); padding: 14px 18px 16px; }
.docs-loading { padding: 48px; text-align: center; color: #5b6e86; font-weight: 600; }

/* Panel header */
.dx-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding-bottom: 12px; margin-bottom: 4px; border-bottom: 1px solid #f1f5f9; }
.dx-head-badge { width: 40px; height: 40px; flex-shrink: 0; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: #3b82f6; color: #fff; font-size: 16px; box-shadow: 0 1px 2px rgba(37, 99, 235, .3); }
.dx-head h1 { margin: 0; font-size: 15px !important; font-weight: 600 !important; color: #0f172a; letter-spacing: 0; line-height: 1.3; }
.dx-head-chips { margin-left: auto; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dx-chip { position: relative; display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 12px; border-radius: 999px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; font-size: 12.5px; font-weight: 700; }
.dx-chip-select { padding-right: 30px; }
.dx-chip-select select { appearance: none; border: 0; background: transparent; color: inherit; font-size: 12.5px; font-weight: 700; min-height: 0 !important; height: 28px; padding: 0 !important; outline: none; cursor: pointer; }
.dx-chip-select i { position: absolute; right: 11px; font-size: 10px; pointer-events: none; }
.dx-status.is-success { background: #ecfdf5; border-color: #a7f3d0; color: #047857; }
.dx-status.is-warning { background: #fffbeb; border-color: #fde68a; color: #b45309; }
.dx-status.is-danger { background: #fff1f2; border-color: #fecdd3; color: #be123c; }
.dx-status.is-neutral { background: #f1f5f9; border-color: #e2e8f0; color: #64748b; }
.dx-dot { width: 7px; height: 7px; border-radius: 999px; background: currentColor; flex-shrink: 0; }

/* Sections */
.dx-sections { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
.dx-section { display: flex; flex-direction: column; min-height: 0; }
.dx-section-head { width: 100%; display: flex; align-items: center; gap: 8px; padding: 10px 0 8px; border: 0; background: transparent; text-align: left; cursor: pointer; min-height: 0 !important; }
.dx-section-head:focus-visible { outline: 3px solid #7fa6db; outline-offset: 2px; border-radius: 8px; }
.dx-section-icon { font-size: 13px; color: #2563eb; }
.dx-section.is-additional .dx-section-icon { color: #64748b; }
.dx-section-head h2 { margin: 0; font-size: 12.5px !important; font-weight: 600 !important; color: #0f172a; text-transform: none !important; letter-spacing: 0; }
.dx-count { margin-left: auto; padding: 3px 12px; border-radius: 999px; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; }
.dx-section.is-additional .dx-count { background: #f1f5f9; border-color: #e2e8f0; color: #64748b; }
.dx-chevron { font-size: 11px; color: #64748b; width: 16px; text-align: center; }

.dx-grid { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); align-content: start; }
@media (min-width: 768px) { .dx-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 1180px) { .dx-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }

/* Document cards */
.dx-card { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px 14px; border: 1px solid #e2e8f0; border-radius: 14px; background: rgba(248, 250, 252, .6); min-width: 0; transition: border-color .15s, background .15s; }
.dx-card:hover { border-color: #93c5fd; background: #fff; }
.dx-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.dx-info { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.dx-info h3 { margin: 0; font-size: 12.5px !important; font-weight: 700 !important; color: #1e293b; line-height: 1.4; text-transform: none !important; letter-spacing: 0 !important; }
.dx-num { color: #2563eb; font-weight: 600; margin-right: 2px; }
.dx-section.is-additional .dx-num { color: #94a3b8; }
.dx-note { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 11.5px; font-weight: 600; }
.dx-note i { font-size: 11px; }
.dx-note.is-pending { color: #b45309; }
.dx-note.is-danger { color: #be123c; }
.dx-note.is-expiry { color: #ea580c; }

/* Status badge (top right of each card) */
.dx-pill { flex-shrink: 0; padding: 2px 10px; border-radius: 999px; border: 1px solid #e2e8f0; background: #f1f5f9; color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; }
.dx-pill.is-valid { background: #ecfdf5; border-color: #a7f3d0; color: #047857; }
.dx-pill.is-warning { background: #fb923c; border-color: #fb923c; color: #fff; }
.dx-pill.is-expired, .dx-pill.is-missing { background: #fff1f2; border-color: #fecdd3; color: #e11d48; }
.dx-pill.is-none { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }

/* Fields */
.dx-field { display: flex; flex-direction: column; gap: 5px; }
.dx-label { font-size: 12px; font-weight: 600; color: #64748b; }
.dx-file-row, .dx-date-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dx-file { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; cursor: pointer; }
.dx-file:focus-within .dx-file-btn { outline: 3px solid #7fa6db; outline-offset: 2px; }
.dx-file-btn { flex-shrink: 0; padding: 6px 12px; border-radius: 9px; border: 1px solid #3b82f6; background: #3b82f6; color: #fff; font-size: 12px; font-weight: 700; transition: background .15s, color .15s, border-color .15s; }
.dx-file:hover .dx-file-btn { background: #2563eb; border-color: #2563eb; color: #fff; }
.dx-file-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: #64748b; }
.dx-file-name.has-file { color: #047857; font-weight: 600; }
.dx-file-links { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; max-width: 100%; }
.dx-file-row { flex-wrap: wrap; }
.dx-view { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 9px; border: 1px solid #d6e2f3; background: #fff; color: #1e4a8d; font-size: 12px; font-weight: 600; text-decoration: none; }
.dx-view:hover { background: #f3f7fd; border-color: #a9c1e4; }
.dx-view:focus-visible { outline: 3px solid #7fa6db; outline-offset: 2px; }
.dx-view.is-disabled { color: #a0aec0; border-style: dashed; background: #f8fafc; cursor: not-allowed; }
.dx-date { flex: 1; min-width: 0; height: 38px; min-height: 38px !important; padding: 0 12px; border: 1px solid #e2e8f0 !important; border-radius: 12px; background: #fff; font-size: 12px; font-weight: 600; color: #334155; outline: none; }
.dx-date:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59, 130, 246, .12) !important; }
.dx-save { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 38px; min-height: 38px !important; padding: 0 14px; border: 0; border-radius: 12px; background: #22c55e; color: #fff; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: background .15s; }
.dx-save:hover:not(:disabled) { background: #16a34a; }
.dx-save:disabled { opacity: .7; cursor: default; }
.dx-save:focus-visible { outline: 3px solid #7fa6db; outline-offset: 2px; }

@media (max-width: 640px) {
  .dx-panel { padding: 12px; }
  .dx-head-chips { margin-left: 0; }
}
</style>
