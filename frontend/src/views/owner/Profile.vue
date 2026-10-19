<script setup>
import UserAvatar from "../../components/UserAvatar.vue";
import LoadError from '../../components/management/LoadError.vue';

import PageHeader from '../../components/management/PageHeader.vue';
import '../../styles/management.css';
import '../../styles/admin-theme.css';
import '../../styles/owner-pages.css';
import { validateInput } from '../../utils/inputValidation.js';
import { ref, onMounted } from 'vue';
import axios from 'axios';
import OwnerNav from '../../components/partials/OwnerNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';
import AddressPicker from '../../components/AddressPicker.vue';
import { normalizePhPhone, isValidPhPhone } from '../../utils/phoneValidation.js';

// State Variables
const user = ref({
  profile_pic: '',
  name: '',
  phone: '',
  address: '',
  email: ''
});

const nameInput = ref('');
const phoneInput = ref('');
const addressInput = ref('');

const savedUserSession = JSON.parse(sessionStorage.getItem('cspc_user') || '{}');
const selectedFile = ref(null);
const filePreview = ref(savedUserSession.profile_pic || '');
const isSaving = ref(false);
const isLoading = ref(true);

// Password Update State variables
const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
});
const showCurrentPassword = ref(false);
const showNewPassword = ref(false);
const showConfirmPassword = ref(false);
const isUpdatingPassword = ref(false);

const alertRef = ref(null);
const token = sessionStorage.getItem('cspc_token');
import { getImageUrl } from '../../config/api';

const showSystemAlert = (message, type = 'error') => {
  if (alertRef.value) alertRef.value.showSystemAlert(message, type);
};

// Dynamic helper script injector for Apple device image support
const loadScript = (url) => {
  return new Promise((resolve, reject) => {
    if (window.heic2any) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

// Transcodes iPhone HEIC images quietly to standard JPEG format
const transcodeHeicFile = async (file) => {
  const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';
  if (!isHeic) return file;

  try {
    console.log("[PROFILE DECODER] iPhone HEIC picture detected. Transcoding in background...");
    await loadScript('https://unpkg.com/heic2any@0.0.4/dist/heic2any.min.js');
    
    const resultBlob = await window.heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.8
    });

    const convertedBlob = Array.isArray(resultBlob) ? resultBlob[0] : resultBlob;
    const sanitizedName = file.name.replace(/\.[^/.]+$/, "") + ".jpeg";

    return new File([convertedBlob], sanitizedName, { type: 'image/jpeg' });
  } catch (err) {
    console.error("[PROFILE DECODER] Image conversion thread crashed, falling back:", err);
    return file;
  }
};

const fetchProfile = async (retries = 2) => {
  loadError.value = '';
  try {
    isLoading.value = true;
    const response = await axios.get(`/api/owner/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000 // 15s timeout to handle Render cold starts
    });

    if (response.data.success) {
      const data = response.data.user;
      user.value = data;
      
      // Map database payload values onto inputs
      nameInput.value = data.name || '';
      phoneInput.value = normalizePhPhone(data.phone);
      addressInput.value = data.address || '';
      if (data.profile_pic) {
        filePreview.value = getImageUrl(data.profile_pic);
      } else {
        // Use Google profile pic from session as fallback
        const savedUser = JSON.parse(sessionStorage.getItem('cspc_user') || '{}');
        if (savedUser.profile_pic) filePreview.value = savedUser.profile_pic;
      }

      // Explicitly reset password form to prevent credential manager autofill bleeding across accounts
      passwordForm.value = {
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      };
    }
  } catch (error) {
    loadError.value = 'The server did not return these records. Refresh the page to try again.';
    console.error('Failed to load profile details:', error);
    if (retries > 0) {
      // Retry once after 3s — handles Render cold start delays
      setTimeout(() => fetchProfile(retries - 1), 3000);
    } else {
      showSystemAlert('Could not fetch profile details. The server may be waking up — please try refreshing.', 'warning');
    }
  } finally {
    isLoading.value = false;
  }
};

const handleFileChange = async (e) => {
  const file = e.target.files[0];
  if (file) {
    const processedFile = await transcodeHeicFile(file);
    selectedFile.value = processedFile;
    filePreview.value = URL.createObjectURL(processedFile);
  }
};

const sanitizePhoneInput = () => {
  phoneInput.value = normalizePhPhone(phoneInput.value);
};

const handleSaveProfile = async () => {
  const inputError = validateInput('ownerProfile', { name: nameInput.value, phone: phoneInput.value, address: addressInput.value });
  if (inputError) { showSystemAlert(inputError, 'error'); return; }
  if (!isValidPhPhone(phoneInput.value)) {
    showSystemAlert('Contact number must be a valid PH mobile number (11 digits, starting with 09).', 'error');
    return;
  }
  try {
    isSaving.value = true;
    const fd = new FormData();
    fd.append('name', nameInput.value);
    fd.append('phone', phoneInput.value);
    fd.append('address', addressInput.value);

    if (selectedFile.value) {
      fd.append('profile_pic', selectedFile.value);
    }

    const response = await axios.post(`/api/owner/update-profile`, fd, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.success) {
      showSystemAlert('Profile changes saved successfully!', 'success');
      
      // Update local storage so headers update immediately
      const rawUser = sessionStorage.getItem('cspc_user');
      if (rawUser && rawUser !== 'undefined') {
        try {
          const userObj = JSON.parse(rawUser);
          userObj.name = nameInput.value;
          if (response.data.profile_pic) {
            userObj.profile_pic = response.data.profile_pic;
          }
          sessionStorage.setItem('cspc_user', JSON.stringify(userObj));
        } catch (parseError) {
          console.warn("[PROFILE] Ignored corrupted localStorage user string:", parseError);
        }
      }
      
      // Re-fetch profile to keep local states synced
      await fetchProfile();
    }
  } catch (error) {
    console.error('Failed to update profile:', error);
    showSystemAlert(error.response?.data?.message || 'Profile changes failed to save.', 'error');
  } finally {
    isSaving.value = false;
  }
};

const handleChangePassword = async () => {
  const inputError = validateInput('password', passwordForm.value);
  if (inputError) { showSystemAlert(inputError, 'error'); return; }
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    showSystemAlert('New passwords do not match.', 'error');
    return;
  }

  try {
    isUpdatingPassword.value = true;
    const payload = {
      newPassword: passwordForm.value.newPassword
    };
    if (user.value.hasPassword) {
      payload.currentPassword = passwordForm.value.currentPassword;
    }

    const res = await axios.post(
      `/api/auth/change-password`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (res.data.success) {
      showSystemAlert(res.data.message || 'Your account password has been updated successfully.', 'success');
      passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' };
      await fetchProfile();
    }
  } catch (e) {
    showSystemAlert(e.response?.data?.message || 'Failed to update credentials. Please check your inputs.', 'error');
    console.error(e);
  } finally {
    isUpdatingPassword.value = false;
  }
};

onMounted(() => {
  fetchProfile();
});

const loadError = ref('');
</script>

<template>
  <div class="management-page owner-page bg-slate-100 min-h-screen flex flex-col font-sans">
    <OwnerNav />
    <div aria-live="polite" aria-atomic="false"><FlashAlert ref="alertRef" /></div>

    <main id="management-content" tabindex="-1" class="profile-main flex-1 w-full py-6 px-4 sm:px-6 lg:px-8 text-left">
      <LoadError :message="loadError" />
      <!-- Header -->
      <div class="mb-5">
        <PageHeader title="Profile & security" />
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="p-20 text-center bg-white rounded-[2.5rem] shadow-sm border border-slate-200/60 flex flex-col items-center justify-center">
        <div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
        <p class="text-slate-400 font-bold uppercase text-[12px] tracking-wide">Compiling Account Profile...</p>
      </div>

      <div v-else-if="user" class="profile-grid grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch animate-in fade-in duration-300">
        <!-- PROFILE FIELDS CARD -->
        <div class="bg-white rounded-[2.5rem] shadow-xl border border-slate-200/60 overflow-hidden text-left flex flex-col">
          <div class="p-6 md:p-7 h-full flex flex-col">
            <div class="flex items-center gap-4 mb-5">
              <div class="bg-blue-600 w-2 h-8 rounded-full"></div>
              <h2 class="text-2xl font-semibold text-[#1e293b] uppercase tracking-tight">Profile Information</h2>
            </div>
            <form @submit.prevent="handleSaveProfile" class="space-y-5 flex-1 flex flex-col">

              <!-- Profile Pic Section -->
              <div class="flex flex-col sm:flex-row gap-5 items-center border-b border-slate-100 pb-5">
                <div class="w-20 h-20 rounded-full overflow-hidden shadow-lg border-4 border-slate-50 shrink-0 bg-slate-50 relative group">
                  <UserAvatar :src="filePreview" :name="user.name" class="w-full h-full" />
                </div>
                <div class="grow text-center sm:text-left space-y-2">
                  <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Account Photo</h3>
                  <input aria-label="Field" type="file" @change="handleFileChange" accept="image/*" class="text-xs font-bold text-slate-500 file:mr-4 file:py-2.5 file:px-6 file:rounded-full file:border-0 file:text-[12px] file:font-semibold file:bg-blue-50 file:text-[#2a528a] hover:file:bg-blue-100 transition cursor-pointer" />
                  <p class="text-[12px] text-slate-400 font-bold uppercase tracking-wide leading-none">JPEG and PNG formats accepted.</p>
                </div>
              </div>

              <!-- Profile Fields -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1 tracking-wide">Full Name</label>
                  <input aria-label="Full Name" v-model="nameInput" type="text" required class="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" placeholder="Juan Dela Cruz" />
                </div>

                <div>
                  <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1 tracking-wide">Contact Phone Number</label>
                  <input aria-label="Contact Phone Number" v-model="phoneInput" @input="sanitizePhoneInput" type="text" inputmode="numeric" maxlength="11" required class="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" placeholder="09xxxxxxxxx" />
                </div>

                <div class="sm:col-span-2">
                  <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1 tracking-wide">Email Address (Read Only)</label>
                  <input aria-label="Email Address (Read Only)" :value="user.email" type="email" disabled class="w-full bg-slate-100 border border-slate-200 px-4 py-3 rounded-xl text-sm font-bold text-slate-400 outline-none cursor-not-allowed select-none" />
                </div>

                <div class="sm:col-span-2">
                  <p class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1 tracking-wide">Residential / Contact Address</p>
                  <AddressPicker v-model="addressInput" id-prefix="owner-profile-address"
                    field-class="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition"
                    label-class="block text-[11px] font-semibold text-slate-400 uppercase mb-1.5 ml-1 tracking-wide" />
                </div>
              </div>

              <!-- Action buttons -->
              <div class="pt-5 mt-auto border-t border-slate-100 flex justify-center">
                <button type="submit" :disabled="isSaving" class="bg-blue-600 hover:bg-black text-white font-semibold py-3.5 px-16 rounded-xl text-[12px] uppercase tracking-wide shadow-xl flex items-center justify-center gap-3 transition active:scale-95 disabled:opacity-50 w-full max-w-sm cursor-pointer management-button management-button-primary">
                  {{ isSaving ? 'Saving Changes...' : 'Save Changes' }}
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- CHANGE PASSWORD SECURITY CARD -->
        <div class="bg-white rounded-[2.5rem] shadow-xl border border-slate-200/60 overflow-hidden text-left flex flex-col">
          <div class="p-6 md:p-7 h-full flex flex-col">
            <div class="flex items-center gap-4 mb-5">
              <div class="bg-blue-600 w-2 h-8 rounded-full"></div>
              <h2 class="text-2xl font-semibold text-[#1e293b] uppercase tracking-tight">Security Credentials</h2>
            </div>

            <!-- Google SSO Info Banner -->
            <div v-if="user.isGoogleUser" class="mb-4 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-start gap-3">
              <svg class="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Your account is connected to <strong>Google SSO</strong>. {{ user.hasPassword ? 'You can update your local password below anytime.' : 'Set a password below to enable manual Email + Password login as well.' }}</span>
            </div>

            <form @submit.prevent="handleChangePassword" autocomplete="off" class="space-y-4 flex-1 flex flex-col">
              <!-- Dummy fields to trap browser password manager autofill -->
              <input aria-label="Field" type="text" name="prevent_autofill_user" class="hidden" tabindex="-1" autocomplete="off" />
              <input aria-label="Field" type="password" name="prevent_autofill_pass" class="hidden" tabindex="-1" autocomplete="new-password" />

              <!-- Current Password (Required whenever a password already exists) -->
              <div v-if="user.hasPassword">
                <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1 tracking-wide">Current Password</label>
                <div class="relative">
                  <input aria-label="Enter your current password" v-model="passwordForm.currentPassword" :type="showCurrentPassword ? 'text' : 'password'" required 
                    name="current_password_field" autocomplete="new-password" placeholder="Enter your current password"
                    class="w-full bg-slate-50 border border-slate-200 px-4 py-3 pr-12 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
                  <button aria-label="Toggle password visibility" type="button" @click="showCurrentPassword = !showCurrentPassword" class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition cursor-pointer">
                    <i :class="showCurrentPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"></i>
                  </button>
                </div>
              </div>

              <div>
                <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1 tracking-wide">New Password</label>
                <div class="relative">
                  <input aria-label="At least 6 characters" v-model="passwordForm.newPassword" :type="showNewPassword ? 'text' : 'password'" required 
                    name="new_password_field" autocomplete="new-password" placeholder="At least 6 characters"
                    class="w-full bg-slate-50 border border-slate-200 px-4 py-3 pr-12 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
                  <button aria-label="Toggle password visibility" type="button" @click="showNewPassword = !showNewPassword" class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition cursor-pointer">
                    <i :class="showNewPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"></i>
                  </button>
                </div>
              </div>

              <div>
                <label class="block text-[12px] font-semibold text-slate-400 uppercase mb-2 ml-1 tracking-wide">Confirm New Password</label>
                <div class="relative">
                  <input aria-label="Repeat new password" v-model="passwordForm.confirmPassword" :type="showConfirmPassword ? 'text' : 'password'" required 
                    name="confirm_password_field" autocomplete="new-password" placeholder="Repeat new password"
                    class="w-full bg-slate-50 border border-slate-200 px-4 py-3 pr-12 rounded-xl text-sm font-bold focus:bg-white focus:border-blue-500 outline-none transition" />
                  <button aria-label="Toggle password visibility" type="button" @click="showConfirmPassword = !showConfirmPassword" class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition cursor-pointer">
                    <i :class="showConfirmPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"></i>
                  </button>
                </div>
              </div>

              <div class="pt-5 mt-auto border-t border-slate-100 flex justify-center">
                <button type="submit" :disabled="isUpdatingPassword" 
                  class="bg-blue-600 hover:bg-black text-white font-semibold py-3.5 px-16 rounded-xl text-[12px] uppercase tracking-wide shadow-xl flex items-center justify-center gap-3 transition active:scale-95 disabled:opacity-50 w-full max-w-sm cursor-pointer management-button management-button-primary">
                  <div v-if="isUpdatingPassword" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  {{ isUpdatingPassword ? 'Saving Password...' : (user.hasPassword ? 'Update Password' : 'Create Account Password') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Profile & security fits in one screen on laptops: tighter cards, shorter fields, smaller headings.
   Text stays readable; nothing is scaled. */
@media (min-width: 1024px) {
  .profile-main { padding-top: 16px !important; padding-bottom: 16px !important; }
  .profile-main > .mb-5 { margin-bottom: 12px !important; }
  .profile-grid { gap: 18px !important; }
  .profile-grid > div { border-radius: 20px !important; }
  .profile-grid > div > div { padding: 18px 22px !important; }
  .profile-grid h2 { font-size: 17px !important; }
  .profile-grid h2 + * , .profile-grid .mb-5 { margin-bottom: 12px !important; }
  .profile-grid .bg-blue-600.w-2 { height: 22px; }
  .profile-grid form { gap: 0; }
  .profile-grid form.space-y-5 > * + *, .profile-grid form.space-y-4 > * + * { margin-top: 12px !important; }
  .profile-grid .pb-5 { padding-bottom: 12px !important; }
  .profile-grid .w-20.h-20 { width: 64px; height: 64px; }
  .profile-grid label.block { margin-bottom: 4px !important; }
  .profile-grid input:not([type='file']):not(.hidden) { height: 42px; min-height: 42px !important; padding-top: 0 !important; padding-bottom: 0 !important; }
  .profile-grid .pt-5 { padding-top: 12px !important; }
  .profile-grid button[type='submit'] { padding-top: 11px !important; padding-bottom: 11px !important; }
  .profile-grid .p-4 { padding: 10px 12px !important; }
}
</style>
