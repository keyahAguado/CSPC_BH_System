<script setup>
import LoadError from '../../components/management/LoadError.vue';
import { confirmTone } from '../../utils/confirmTone.js';
import '../../styles/management.css';
import '../../styles/admin-theme.css';
import { vManagementDialog } from '../../components/management/dialogAccessibility.js';
import { validateInput } from '../../utils/inputValidation.js';
import { FEATURE_ICONS, SITE_SETTING_DEFAULTS } from '../../constants/siteContent.js';
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import AdminNav from '../../components/partials/AdminNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';

const token = sessionStorage.getItem('cspc_token');
const authHeaders = () => ({ headers: { Authorization: `Bearer ${token}` } });
const alertRef = ref(null);
const showSystemAlert = (message, type = 'error') => alertRef.value?.showSystemAlert(message, type);

const isLoading = ref(true);
const loadError = ref('');
const features = ref([]);
const maxFeatures = ref(12);
const savedSettings = ref({ ...SITE_SETTING_DEFAULTS });
const settingsForm = ref({ ...SITE_SETTING_DEFAULTS });
const isSavingSettings = ref(false);
const busyFeatureId = ref(null);

const visibleFeatures = computed(() => features.value.filter(f => f.is_active));
const settingsDirty = computed(() => Object.keys(SITE_SETTING_DEFAULTS).some(key => (settingsForm.value[key] ?? '') !== (savedSettings.value[key] ?? '')));
const iconLabel = (value) => FEATURE_ICONS.find(i => i.value === value)?.label || value;

const fetchContent = async () => {
  loadError.value = '';
  try {
    const response = await axios.get('/api/admin/site-content', authHeaders());
    if (response.data.success) {
      features.value = response.data.features || [];
      maxFeatures.value = response.data.maxFeatures || 12;
      // Keep unsaved footer edits when the list refreshes after a feature action.
      if (!settingsDirty.value) settingsForm.value = { ...SITE_SETTING_DEFAULTS, ...response.data.settings };
      savedSettings.value = { ...SITE_SETTING_DEFAULTS, ...response.data.settings };
    }
  } catch (error) {
    loadError.value = 'The landing page content could not be loaded. Refresh the page to try again.';
    console.error('Failed to load site content:', error);
  } finally {
    isLoading.value = false;
  }
};

// ─── Feature cards ───
const showFeatureModal = ref(false);
const featureForm = ref({ id: null, title: '', description: '', icon: 'shield-halved' });
const isSavingFeature = ref(false);

const openAddFeature = () => {
  featureForm.value = { id: null, title: '', description: '', icon: 'shield-halved' };
  showFeatureModal.value = true;
};
const openEditFeature = (feature) => {
  featureForm.value = { id: feature.id, title: feature.title, description: feature.description, icon: feature.icon };
  showFeatureModal.value = true;
};

const saveFeature = async () => {
  const payload = { title: featureForm.value.title.trim(), description: featureForm.value.description.trim(), icon: featureForm.value.icon };
  const inputError = validateInput('siteFeature', payload);
  if (inputError) { showSystemAlert(inputError, 'error'); return; }
  isSavingFeature.value = true;
  try {
    const url = featureForm.value.id
      ? `/api/admin/site-content/features/update/${featureForm.value.id}`
      : '/api/admin/site-content/features/add';
    const response = await axios.post(url, payload, authHeaders());
    if (response.data.success) {
      showSystemAlert(response.data.message, 'success');
      showFeatureModal.value = false;
      await fetchContent();
    }
  } catch (error) {
    showSystemAlert(error.response?.data?.message || 'Failed to save feature.', 'error');
  } finally {
    isSavingFeature.value = false;
  }
};

const runFeatureAction = async (feature, path, body = {}) => {
  busyFeatureId.value = feature.id;
  try {
    const response = await axios.post(`/api/admin/site-content/features/${path}/${feature.id}`, body, authHeaders());
    if (response.data.success) await fetchContent();
  } catch (error) {
    showSystemAlert(error.response?.data?.message || 'The change could not be saved.', 'error');
  } finally {
    busyFeatureId.value = null;
  }
};
const toggleFeature = (feature) => runFeatureAction(feature, 'toggle');
const moveFeature = (feature, direction) => runFeatureAction(feature, 'move', { direction });

// Delete confirmation (same pattern as the other admin pages)
const showConfirmModal = ref(false);
const pendingDelete = ref(null);
const askDeleteFeature = (feature) => { pendingDelete.value = feature; showConfirmModal.value = true; };
const confirmDelete = async () => {
  const feature = pendingDelete.value;
  showConfirmModal.value = false;
  pendingDelete.value = null;
  if (!feature) return;
  busyFeatureId.value = feature.id;
  try {
    const response = await axios.post(`/api/admin/site-content/features/delete/${feature.id}`, {}, authHeaders());
    if (response.data.success) {
      showSystemAlert(response.data.message, 'success');
      await fetchContent();
    }
  } catch (error) {
    showSystemAlert(error.response?.data?.message || 'Failed to delete feature.', 'error');
  } finally {
    busyFeatureId.value = null;
  }
};

// ─── Section heading + footer details ───
const saveSettings = async () => {
  const payload = Object.fromEntries(Object.keys(SITE_SETTING_DEFAULTS).map(key => [key, (settingsForm.value[key] || '').trim()]));
  payload.footer_custom = JSON.stringify(parseCustom(payload.footer_custom)
    .map(l => ({ label: String(l.label || '').trim(), text: String(l.text || '').trim() }))
    .filter(l => l.text));
  const inputError = validateInput('siteSettings', payload);
  if (inputError) { showSystemAlert(inputError, 'error'); return; }
  isSavingSettings.value = true;
  try {
    const response = await axios.post('/api/admin/site-content/settings', payload, authHeaders());
    if (response.data.success) {
      savedSettings.value = { ...payload };
      settingsForm.value = { ...payload };
      showSystemAlert(response.data.message, 'success');
    }
  } catch (error) {
    showSystemAlert(error.response?.data?.message || 'Failed to save landing page details.', 'error');
  } finally {
    isSavingSettings.value = false;
  }
};
const discardSettings = () => { settingsForm.value = { ...savedSettings.value }; };

// Footer text always shown on the landing page
const footerFields = [
  { key: 'footer_title', label: 'Footer title', max: 120, required: true, wide: true },
  { key: 'footer_tagline', label: 'Tagline', max: 255, wide: true },
  { key: 'footer_copyright', label: 'Copyright notice', max: 255, wide: true }
];
// Extra footer details the admin can add when needed (shown on the landing page only when filled in)
const OPTIONAL_FOOTER_FIELDS = [
  { key: 'footer_office', label: 'Office name', icon: 'fa-solid fa-building-columns', max: 120, placeholder: 'e.g. Student Affairs and Services Office' },
  { key: 'footer_address', label: 'Office address', icon: 'fa-solid fa-location-dot', max: 255, placeholder: 'e.g. CSPC Main Campus, San Miguel, Nabua, Camarines Sur' },
  { key: 'footer_email', label: 'Contact email', icon: 'fa-solid fa-envelope', max: 255, type: 'email', placeholder: 'e.g. saso@cspc.edu.ph' },
  { key: 'footer_phone', label: 'Contact number', icon: 'fa-solid fa-phone', max: 60, placeholder: 'e.g. 09XX XXX XXXX' },
  { key: 'footer_hours', label: 'Office hours', icon: 'fa-solid fa-clock', max: 120, placeholder: 'e.g. Mon–Fri, 8:00 AM – 5:00 PM' },
  { key: 'footer_facebook', label: 'Facebook page link', icon: 'fa-brands fa-facebook', max: 255, type: 'url', placeholder: 'https://facebook.com/…' },
  { key: 'footer_website', label: 'Website link', icon: 'fa-solid fa-globe', max: 255, type: 'url', placeholder: 'https://…' }
];
const addedFooterKeys = ref([]);
const shownOptionalFields = computed(() => OPTIONAL_FOOTER_FIELDS.filter(f => (settingsForm.value[f.key] || '').trim() || addedFooterKeys.value.includes(f.key)));
const addableOptionalFields = computed(() => OPTIONAL_FOOTER_FIELDS.filter(f => !shownOptionalFields.value.includes(f)));
const footerFieldToAdd = ref('');
const addFooterDetail = () => {
  if (!footerFieldToAdd.value) return;
  addedFooterKeys.value = [...addedFooterKeys.value, footerFieldToAdd.value];
  footerFieldToAdd.value = '';
};
const removeFooterDetail = (key) => {
  settingsForm.value[key] = '';
  addedFooterKeys.value = addedFooterKeys.value.filter(k => k !== key);
};
// Free-form footer lines the admin types in (e.g. "Hotline: 0912…", "Office: Room 101")
const MAX_CUSTOM_LINES = 8;
const parseCustom = (raw) => { try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const customLines = computed({
  get: () => parseCustom(settingsForm.value.footer_custom),
  set: (lines) => { settingsForm.value.footer_custom = JSON.stringify(lines); }
});
const addCustomLine = () => { if (customLines.value.length < MAX_CUSTOM_LINES) customLines.value = [...customLines.value, { label: '', text: '' }]; };
const updateCustomLine = (index, field, value) => { customLines.value = customLines.value.map((l, i) => (i === index ? { ...l, [field]: value } : l)); };
const removeCustomLine = (index) => { customLines.value = customLines.value.filter((_, i) => i !== index); };

const previewExtras = computed(() => shownOptionalFields.value
  .filter(f => (settingsForm.value[f.key] || '').trim())
  .map(f => ({ key: f.key, icon: f.icon, text: settingsForm.value[f.key].trim() })));

onMounted(fetchContent);
</script>

<template>
  <div class="admin-shell">
    <AdminNav />
    <div aria-live="polite" aria-atomic="false"><FlashAlert ref="alertRef" /></div>

    <main id="management-content" tabindex="-1" :style="settingsDirty ? 'padding-bottom: 120px;' : ''">
      <LoadError :message="loadError" />

      <header class="admin-page-head">
        <div>
          <h1>Landing page</h1>
        </div>
        <a href="/" target="_blank" rel="noopener" class="admin-btn admin-btn-secondary">
          <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> View landing page
        </a>
      </header>

      <div v-if="isLoading" class="admin-grid admin-grid-main" aria-busy="true" aria-label="Loading landing page content">
        <div class="admin-skeleton" style="height: 420px;"></div>
        <div class="admin-skeleton" style="height: 420px;"></div>
      </div>

      <div v-else-if="!loadError" class="space-y-5">
        <!-- Core features -->
        <div class="admin-grid admin-grid-main">
          <section class="admin-card" aria-labelledby="features-title">
            <div class="admin-card-head">
              <div>
                <h2 id="features-title">Core features</h2>
                <p>{{ visibleFeatures.length }} shown on the landing page · {{ features.length }} of {{ maxFeatures }} cards used</p>
              </div>
              <button type="button" class="admin-btn admin-btn-primary" :disabled="features.length >= maxFeatures" @click="openAddFeature">
                <i class="fa-solid fa-plus" aria-hidden="true"></i> Add feature
              </button>
            </div>

            <div class="admin-form-grid" style="margin-bottom: 18px;">
              <label class="admin-form-field">
                <span>Section label <small>optional</small></span>
                <input v-model="settingsForm.features_eyebrow" type="text" maxlength="60" class="admin-field" placeholder="e.g. The Platform" />
              </label>
              <label class="admin-form-field">
                <span>Section heading</span>
                <input v-model="settingsForm.features_heading" type="text" maxlength="80" required class="admin-field" />
              </label>
            </div>

            <div v-if="features.length === 0" class="admin-empty">
              <i class="fa-solid fa-table-cells-large" aria-hidden="true"></i>
              No feature cards yet. Add one to show it on the landing page.
            </div>
            <ol v-else class="admin-feature-list">
              <li v-for="(feature, index) in features" :key="feature.id" class="admin-feature-item" :class="{ 'is-hidden': !feature.is_active, 'is-busy': busyFeatureId === feature.id }">
                <span class="admin-feature-order">{{ index + 1 }}</span>
                <span class="admin-feature-item-icon" aria-hidden="true"><i :class="['fa-solid', 'fa-' + feature.icon]"></i></span>
                <div class="admin-feature-item-text">
                  <strong>{{ feature.title }}</strong>
                  <p>{{ feature.description }}</p>
                  <span v-if="!feature.is_active" class="admin-badge is-neutral" style="margin-top: 6px;"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i>Hidden from visitors</span>
                </div>
                <div class="admin-feature-actions">
                  <button type="button" class="admin-icon-btn" :disabled="index === 0 || busyFeatureId !== null" :aria-label="`Move ${feature.title} up`" title="Move up" @click="moveFeature(feature, 'up')"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
                  <button type="button" class="admin-icon-btn" :disabled="index === features.length - 1 || busyFeatureId !== null" :aria-label="`Move ${feature.title} down`" title="Move down" @click="moveFeature(feature, 'down')"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>
                  <button type="button" class="admin-icon-btn is-edit" :aria-label="`Edit ${feature.title}`" title="Edit" @click="openEditFeature(feature)"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></button>
                  <button type="button" class="admin-icon-btn" :disabled="busyFeatureId !== null" :aria-label="(feature.is_active ? 'Hide ' : 'Show ') + feature.title" :title="feature.is_active ? 'Hide from landing page' : 'Show on landing page'" @click="toggleFeature(feature)"><i class="fa-solid" :class="feature.is_active ? 'fa-eye' : 'fa-eye-slash'" aria-hidden="true"></i></button>
                  <button type="button" class="admin-icon-btn is-danger" :disabled="busyFeatureId !== null" :aria-label="`Delete ${feature.title}`" title="Delete" @click="askDeleteFeature(feature)"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
                </div>
              </li>
            </ol>
          </section>

          <section class="admin-card" aria-labelledby="features-preview-title">
            <div class="admin-card-head">
              <div>
                <h2 id="features-preview-title">Preview</h2>
                <p>How visitors see the section</p>
              </div>
              <span class="admin-badge is-neutral">Live</span>
            </div>
            <div class="admin-preview-features">
              <p v-if="settingsForm.features_eyebrow" class="admin-preview-eyebrow">{{ settingsForm.features_eyebrow }}</p>
              <p class="admin-preview-heading">{{ settingsForm.features_heading || 'Section heading' }}</p>
              <div v-for="feature in visibleFeatures" :key="feature.id" class="admin-preview-card">
                <span aria-hidden="true"><i :class="['fa-solid', 'fa-' + feature.icon]"></i></span>
                <div><strong>{{ feature.title }}</strong><p>{{ feature.description }}</p></div>
              </div>
              <p v-if="visibleFeatures.length === 0" class="admin-preview-empty">No visible cards. Only the heading will appear.</p>
            </div>
          </section>
        </div>

        <!-- Footer -->
        <div class="admin-grid admin-grid-main">
          <section class="admin-card" aria-labelledby="footer-title">
            <div class="admin-card-head">
              <div>
                <h2 id="footer-title">Footer details</h2>
                <p>The text at the bottom of the landing page. The Data Privacy Policy button is always shown.</p>
              </div>
            </div>
            <form class="admin-form-grid" @submit.prevent="saveSettings">
              <label v-for="field in footerFields" :key="field.key" class="admin-form-field" :class="{ 'is-wide': field.wide }">
                <span>{{ field.label }} <small v-if="!field.required">optional</small></span>
                <input v-model="settingsForm[field.key]" :type="field.type || 'text'" :maxlength="field.max" :required="field.required" :placeholder="field.placeholder" class="admin-field" />
              </label>

              <div v-if="addableOptionalFields.length" class="admin-form-field is-wide">
                <span>Add footer detail <small>optional</small></span>
                <div class="flex gap-2">
                  <select v-model="footerFieldToAdd" class="admin-field flex-1" aria-label="Choose a footer detail to add">
                    <option value="">Choose a detail to add…</option>
                    <option v-for="f in addableOptionalFields" :key="f.key" :value="f.key">{{ f.label }}</option>
                  </select>
                  <button type="button" class="admin-btn admin-btn-success" :disabled="!footerFieldToAdd" @click="addFooterDetail"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add</button>
                </div>
              </div>

              <!-- Extra details added by the admin -->
              <div v-for="field in shownOptionalFields" :key="field.key" class="admin-form-field is-wide">
                <span><i :class="field.icon" aria-hidden="true" style="width: 16px; color: var(--a-faint);"></i> {{ field.label }}</span>
                <div class="flex gap-2">
                  <input v-model="settingsForm[field.key]" :type="field.type || 'text'" :maxlength="field.max" :placeholder="field.placeholder" class="admin-field flex-1" :aria-label="field.label" />
                  <button type="button" class="admin-icon-btn is-danger" :aria-label="'Remove ' + field.label" title="Remove from footer" @click="removeFooterDetail(field.key)"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                </div>
              </div>

              <!-- Custom lines typed by the admin -->
              <div class="admin-form-field is-wide">
                <span>Custom footer lines <small>{{ customLines.length }}/{{ MAX_CUSTOM_LINES }} · optional</small></span>
                <div v-for="(line, index) in customLines" :key="index" class="flex gap-2 mb-2">
                  <input :value="line.label" @input="updateCustomLine(index, 'label', $event.target.value)" type="text" maxlength="60" class="admin-field" style="max-width: 180px;" placeholder="Label (optional)" :aria-label="'Custom line ' + (index + 1) + ' label'" />
                  <input :value="line.text" @input="updateCustomLine(index, 'text', $event.target.value)" type="text" maxlength="255" class="admin-field flex-1" placeholder="Text shown in the footer" :aria-label="'Custom line ' + (index + 1) + ' text'" />
                  <button type="button" class="admin-icon-btn is-danger" :aria-label="'Remove custom line ' + (index + 1)" title="Remove line" @click="removeCustomLine(index)"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
                </div>
                <div>
                  <button type="button" class="admin-btn admin-btn-success" :disabled="customLines.length >= MAX_CUSTOM_LINES" @click="addCustomLine"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add custom line</button>
                </div>
              </div>

            </form>
          </section>

          <section class="admin-card" aria-labelledby="footer-preview-title">
            <div class="admin-card-head">
              <div>
                <h2 id="footer-preview-title">Footer preview</h2>
                <p>Updates as you type</p>
              </div>
              <span class="admin-badge is-neutral">Live</span>
            </div>
            <div class="admin-preview-footer">
              <strong>{{ settingsForm.footer_title || 'Footer title' }}</strong>
              <p v-if="settingsForm.footer_tagline">{{ settingsForm.footer_tagline }}</p>
              <ul v-if="previewExtras.length || customLines.some(l => (l.text || '').trim())">
                <li v-for="item in previewExtras" :key="item.key"><i :class="item.icon" aria-hidden="true"></i>{{ item.text }}</li>
                <li v-for="(line, index) in customLines.filter(l => (l.text || '').trim())" :key="'c' + index"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><strong v-if="line.label">{{ line.label }}:&nbsp;</strong>{{ line.text }}</li>
              </ul>
              <span class="admin-preview-privacy"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Data Privacy Policy</span>
              <small>{{ settingsForm.footer_copyright }}</small>
            </div>
          </section>
        </div>
      </div>
    </main>

    <!-- Unsaved changes bar (section heading + footer) -->
    <div v-if="settingsDirty" class="admin-savebar" role="region" aria-label="Unsaved changes">
      <span><i class="fa-solid fa-circle-info" aria-hidden="true"></i> You have unsaved changes to the section heading or footer.</span>
      <div class="flex gap-2">
        <button type="button" class="admin-btn admin-btn-ghost" :disabled="isSavingSettings" @click="discardSettings">Discard</button>
        <button type="button" class="admin-btn admin-btn-primary" :disabled="isSavingSettings" @click="saveSettings">
          <i class="fa-solid" :class="isSavingSettings ? 'fa-spinner fa-spin' : 'fa-check'" aria-hidden="true"></i> Save changes
        </button>
      </div>
    </div>

    <!-- Add / edit feature -->
    <div v-management-dialog="{ close: () => showFeatureModal = false }" v-if="showFeatureModal" class="admin-dialog-backdrop z-[100]">
      <div class="admin-dialog max-w-xl">
        <div class="admin-dialog-head">
          <div>
            <h3>{{ featureForm.id ? 'Edit feature' : 'Add feature' }}</h3>
            <p>Shown as a card in the Core Features section.</p>
          </div>
          <button type="button" aria-label="Close dialog" class="admin-icon-btn" @click="showFeatureModal = false"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
        <form class="admin-dialog-body space-y-4" @submit.prevent="saveFeature">
          <label class="admin-form-field">
            <span>Title</span>
            <input v-model="featureForm.title" type="text" maxlength="120" required class="admin-field" placeholder="e.g. Online Reservations" />
          </label>
          <label class="admin-form-field">
            <span>Description <small>{{ featureForm.description.length }}/500</small></span>
            <textarea v-model="featureForm.description" maxlength="500" rows="4" required class="admin-field" style="resize: vertical;" placeholder="One or two sentences about what this feature does for students and parents."></textarea>
          </label>
          <fieldset class="admin-form-field">
            <legend>Icon <small>{{ iconLabel(featureForm.icon) }}</small></legend>
            <div class="admin-icon-picker">
              <button v-for="icon in FEATURE_ICONS" :key="icon.value" type="button" :class="{ 'is-selected': featureForm.icon === icon.value }" :aria-pressed="featureForm.icon === icon.value" :aria-label="icon.label" :title="icon.label" @click="featureForm.icon = icon.value">
                <i :class="['fa-solid', 'fa-' + icon.value]" aria-hidden="true"></i>
              </button>
            </div>
          </fieldset>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="admin-btn admin-btn-ghost" @click="showFeatureModal = false">Cancel</button>
            <button type="submit" :class="['admin-btn', featureForm.id ? 'admin-btn-primary' : 'admin-btn-success']" :disabled="isSavingFeature">{{ featureForm.id ? 'Save feature' : 'Add feature' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete confirmation -->
    <div v-management-dialog="{ close: () => showConfirmModal = false }" v-if="showConfirmModal" class="cm-backdrop">
      <div class="cm-panel popup-panel" role="dialog" aria-modal="true">
        <div class="cm-body">
          <span :class="['cm-icon', confirmTone('Delete feature?').tone]" aria-hidden="true"><i :class="['fa-solid', confirmTone('Delete feature?').icon]"></i></span>
          <div><h3 class="cm-title">{{ 'Delete feature?' }}</h3><p class="cm-message popup-message"><strong>{{ pendingDelete?.title }}</strong> will be removed from the landing page permanently. To keep it for later, hide it instead.</p></div>
        </div>
        <div class="cm-actions">
          <button type="button" class="cm-btn cm-cancel" @click="showConfirmModal = false">Cancel</button>
          <button type="button" :class="['cm-btn', confirmTone('Delete feature?').button]" @click="confirmDelete">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>
