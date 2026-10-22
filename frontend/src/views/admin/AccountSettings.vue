<script setup>
import { onMounted, reactive, ref } from 'vue';
import axios from 'axios';
import AdminNav from '../../components/partials/AdminNav.vue';
import '../../styles/management.css';
import '../../styles/admin-theme.css';

const form = reactive({ name: '', email: '', currentPassword: '', newPassword: '', confirmPassword: '' });
const loading = ref(true);
const loaded = ref(false);
const saving = ref(false);
const error = ref('');
const success = ref('');
const showPasswords = ref(false);
const headers = () => ({ headers: { Authorization: `Bearer ${sessionStorage.getItem('cspc_token')}` } });
async function load() {
  error.value = '';
  loading.value = true;
  try {
    const { data } = await axios.get('/api/admin/account', headers());
    form.name = data.account.name;
    form.email = data.account.email;
    loaded.value = true;
  } catch { error.value = 'Unable to load account settings. Please try again.'; }
  finally { loading.value = false; }
}
async function save() {
  error.value = '';
  success.value = '';
  if (form.newPassword !== form.confirmPassword) { error.value = 'New passwords do not match.'; return; }
  if (form.newPassword && (form.newPassword.length < 12 || new TextEncoder().encode(form.newPassword).length > 72)) {
    error.value = 'Use at least 12 characters and at most 72 UTF-8 bytes for the new password.';
    return;
  }
  saving.value = true;
  try {
    const { data } = await axios.put('/api/admin/account', { name: form.name, email: form.email, currentPassword: form.currentPassword, newPassword: form.newPassword }, headers());
    form.name = data.account.name;
    form.email = data.account.email;
    form.currentPassword = form.newPassword = form.confirmPassword = '';
    try {
      const user = JSON.parse(sessionStorage.getItem('cspc_user') || '{}');
      sessionStorage.setItem('cspc_user', JSON.stringify({ ...user, name: form.name, email: form.email }));
    } catch { /* Account changes have already been saved on the server. */ }
    success.value = 'Account settings saved. Use the updated details the next time you sign in.';
  } catch (err) { error.value = err.response?.data?.message || 'Unable to save account settings. Please try again.'; }
  finally { saving.value = false; }
}
onMounted(load);
</script>

<template>
  <div class="admin-shell">
    <AdminNav />
    <main id="management-content" tabindex="-1">
      <header class="admin-page-head"><div><h1>Account settings</h1><p>Manage your administrator name and password.</p></div></header>
      <div v-if="loading" class="admin-card account-loading" role="status"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading account settings...</div>
      <div v-if="error" role="alert" class="account-error">{{ error }}</div>
      <div v-if="success" role="status" class="account-success">{{ success }}</div>
      <button v-if="!loading && !loaded" type="button" class="admin-btn admin-btn-secondary" @click="load">Retry loading</button>
      <form v-if="!loading && loaded" class="account-form" @submit.prevent="save">
        <fieldset :disabled="saving">
          <legend class="sr-only">Administrator profile and security</legend>
          <div class="account-grid">
            <section class="admin-card" aria-labelledby="account-profile-title">
              <div class="admin-card-head"><div><h2 id="account-profile-title">Administrator profile</h2><p>Your assigned account and display name.</p></div><i class="fa-solid fa-user-shield account-icon" aria-hidden="true"></i></div>
              <div class="admin-form-grid">
                <label class="admin-form-field is-wide" for="admin-name"><span>Full name</span><input id="admin-name" v-model="form.name" class="admin-field" autocomplete="name" maxlength="255" required /></label>
                <label class="admin-form-field is-wide" for="admin-email"><span>Institutional email <small>Read-only</small></span><input id="admin-email" :value="form.email" class="admin-field account-readonly" type="email" autocomplete="username" readonly aria-describedby="admin-email-help" /></label>
              </div>
              <p id="admin-email-help" class="account-note"><i class="fa-solid fa-lock" aria-hidden="true"></i><span>The institutional email is fixed. Contact the server administrator for an official account transfer.</span></p>
            </section>
            <section class="admin-card" aria-labelledby="account-security-title">
              <div class="admin-card-head"><div><h2 id="account-security-title">Password and security</h2><p>Confirm your current password to save any changes.</p></div><i class="fa-solid fa-key account-icon" aria-hidden="true"></i></div>
              <div class="admin-form-grid">
                <label class="admin-form-field is-wide" for="admin-current-password"><span>Current password <small>Required</small></span><input id="admin-current-password" v-model="form.currentPassword" class="admin-field" :type="showPasswords ? 'text' : 'password'" autocomplete="current-password" required /></label>
                <label class="admin-form-field" for="admin-new-password"><span>New password <small>Optional</small></span><input id="admin-new-password" v-model="form.newPassword" class="admin-field" :type="showPasswords ? 'text' : 'password'" autocomplete="new-password" minlength="12" maxlength="72" aria-describedby="admin-password-help" /></label>
                <label class="admin-form-field" for="admin-confirm-password"><span>Confirm new password</span><input id="admin-confirm-password" v-model="form.confirmPassword" class="admin-field" :type="showPasswords ? 'text' : 'password'" autocomplete="new-password" :required="Boolean(form.newPassword)" maxlength="72" /></label>
              </div>
              <label class="account-show"><input v-model="showPasswords" type="checkbox" /> Show passwords</label>
              <p id="admin-password-help" class="account-help">Use at least 12 characters for a new password. Leave both new-password fields empty to keep your current password.</p>
            </section>
          </div>
          <div class="account-footer"><p><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Existing signed-in sessions remain active after a password change.</p><button type="submit" class="admin-btn admin-btn-primary"><i :class="saving ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-check'" aria-hidden="true"></i>{{ saving ? 'Saving...' : 'Save changes' }}</button></div>
        </fieldset>
      </form>
    </main>
  </div>
</template>

<style scoped>
.account-form { width: 100%; }
.account-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: start; }
@media (min-width: 1050px) { .account-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); } }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.account-icon { color: var(--a-primary); background: var(--a-bg); padding: 12px; border-radius: var(--a-radius-sm); }
.account-readonly { background: var(--a-bg); color: var(--a-muted); }
.account-note { display: flex; gap: 10px; align-items: flex-start; padding: 14px; margin-top: 20px; background: var(--a-bg); border: 1px solid var(--a-border); border-radius: var(--a-radius-sm); font-size: 12.5px; line-height: 1.6; color: var(--a-muted); }
.account-note i { margin-top: 4px; }
.account-show { display: flex; gap: 8px; align-items: center; font-size: 13px; margin: 18px 0 10px; color: var(--a-heading); }
.account-show input { width: 16px; height: 16px; accent-color: var(--a-primary); }
.account-help { font-size: 12.5px; color: var(--a-muted); line-height: 1.6; margin: 0; }
.account-footer { display: flex; justify-content: space-between; align-items: center; gap: 18px; border-top: 1px solid var(--a-border); margin-top: 24px; padding-top: 20px; }
.account-footer p { font-size: 12.5px; color: var(--a-muted); line-height: 1.6; margin: 0; }
.account-footer button { flex-shrink: 0; }
.account-loading { display: flex; align-items: center; gap: 12px; color: var(--a-muted); }
.account-error, .account-success { padding: 14px; margin-bottom: 18px; border-radius: var(--a-radius-sm); overflow-wrap: anywhere; }
.account-error { background: #fef2f2; color: #991b1b; }
.account-success { background: #f0fdf4; color: #166534; }
fieldset:disabled { opacity: .7; }
@media (max-width: 640px) { .account-footer { flex-direction: column; align-items: stretch; } .account-footer button { width: 100%; } .admin-field { font-size: 16px; } }
</style>
