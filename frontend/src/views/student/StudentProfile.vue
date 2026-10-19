<script setup>
import UserAvatar from "../../components/UserAvatar.vue";
import { validateInput } from '../../utils/inputValidation.js';
import { ref, onMounted, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import StudentNav from '../../components/partials/StudentNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';
import { normalizePhPhone, isValidPhPhone } from '../../utils/phoneValidation.js';

const router = useRouter();
const user = ref({});
const isLoading = ref(true);
const isSaving = ref(false);
const successMsg = ref('');
const errorMsg = ref('');
const alertRef = ref(null);

const token = sessionStorage.getItem('cspc_token');
import { getApiBaseUrl, getImageUrl } from '../../config/api';

const API = getApiBaseUrl();

// Form fields
const form = ref({
  name: '',
  email: '', // Added explicitly to the form object
  student_id: '',
  sex: '',
  course: '',
  year_section: '',
  dob: '',
  age: '',
  address: '',
  phone: '',
  emergency_contact: '',
  guardian_name: '',
  existing_profile_pic: ''
});

const profilePicFile = ref(null);
const profilePicPreview = ref('');
const courseOptions = ref([]);

// ── Date of Birth bounds & auto-calculated age ──────────────────────────
// College students realistically fall between ~15 and ~65 years old;
// this blocks impossible entries like a DOB in the last few years.
const MIN_STUDENT_AGE = 15;
const MAX_STUDENT_AGE = 65;

const todayISO = () => new Date().toISOString().split('T')[0];
const yearsAgoISO = (years) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().split('T')[0];
};

const maxDobDate = yearsAgoISO(MIN_STUDENT_AGE);
const minDobDate = yearsAgoISO(MAX_STUDENT_AGE);

const computeAgeFromDob = (dobStr) => {
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age--;
  return age;
};

// Auto-fills age when the student actively changes DOB (not on initial
// profile load, so an existing saved age is never silently overwritten).
// The field stays editable — the student can still correct it manually.
const onDobChange = () => {
  if (form.value.dob) form.value.age = computeAgeFromDob(form.value.dob);
};

const sanitizePhoneInput = (fieldKey) => {
  form.value[fieldKey] = normalizePhPhone(form.value[fieldKey]);
};

const fetchCourses = async () => {
  try {
    const res = await axios.get(`${API}/api/student/courses`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    courseOptions.value = res.data.courses || [];
  } catch (e) {
    console.warn('Failed to load course list:', e.message);
  }
};

// Keeps a previously-saved free-text course value visible in the dropdown even
// if it doesn't match any seeded course code, so switching to the dropdown never
// makes an existing student's saved value appear to vanish.
const legacyCourseValue = computed(() => {
  if (!form.value.course) return null;
  const matches = courseOptions.value.some(c => c.course_code === form.value.course);
  return matches ? null : form.value.course;
});

const fetchProfile = async () => {
  // 1. Instantly read verified Google session from localStorage as a solid fallback
  const savedUser = JSON.parse(sessionStorage.getItem('cspc_user') || '{}');
  
  // 2. Pre-fill UI states immediately so there is never a blank screen
  user.value = savedUser;
  form.value.name = savedUser.name || '';
  form.value.email = savedUser.email || '';

  try {
    // 3. Attempt to fetch up-to-date details from the database API
    const res = await axios.get(`${API}/api/student/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const u = res.data.user || {};
    user.value = u;
    form.value = {
      name: u.name || savedUser.name || '',
      email: u.email || savedUser.email || '',
      student_id: u.student_id || '',
      sex: u.sex || '',
      course: u.course || '',
      year_section: u.year_section || '',
      dob: u.dob ? new Date(u.dob).toISOString().split('T')[0] : '',
      age: u.age || '',
      address: u.address || '',
      phone: normalizePhPhone(u.phone),
      emergency_contact: normalizePhPhone(u.emergency_contact),
      guardian_name: u.guardian_name || '',
      existing_profile_pic: u.profile_pic || ''
    };
    if (u.profile_pic) profilePicPreview.value = getImageUrl(u.profile_pic);
    // Fallback: use Google profile picture from session if no custom pic uploaded
    else if (savedUser.profile_pic) profilePicPreview.value = savedUser.profile_pic;
  } catch (e) {
    console.warn('Failed to load profile from database, using active Google session:', e.message);
  } finally {
    isLoading.value = false;
  }
};

const handleFileChange = (e) => {
  const file = e.target.files[0];
  if (file) {
    profilePicFile.value = file;
    profilePicPreview.value = URL.createObjectURL(file);
  }
};

const validateForm = () => {
  const inputError = validateInput('studentProfile', form.value);
  if (inputError) return inputError;
  if (form.value.dob) {
    if (form.value.dob > maxDobDate) {
      return `Date of birth is invalid — you must be at least ${MIN_STUDENT_AGE} years old.`;
    }
    if (form.value.dob < minDobDate) {
      return 'Date of birth is invalid — please check the year entered.';
    }
  }
  if (form.value.phone && !isValidPhPhone(form.value.phone)) {
    return 'Contact number must be a valid PH mobile number (11 digits, starting with 09).';
  }
  if (form.value.emergency_contact && !isValidPhPhone(form.value.emergency_contact)) {
    return 'Emergency contact number must be a valid PH mobile number (11 digits, starting with 09).';
  }
  return null;
};

const saveProfile = async () => {
  // Refresh the existing automatic age calculation before validating a saved DOB.
  onDobChange();
  const validationError = validateForm();
  if (validationError) {
    errorMsg.value = validationError;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  isSaving.value = true;
  successMsg.value = '';
  errorMsg.value = '';
  try {
    const fd = new FormData();
    Object.entries(form.value).forEach(([k, v]) => fd.append(k, v));
    if (profilePicFile.value) fd.append('profile_pic', profilePicFile.value);
    
    // Inayos ang endpoint para magtugma sa /api/
    await axios.post(`${API}/api/student/update-profile`, fd, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }
    });
    
    successMsg.value = 'Profile updated successfully! Redirecting to Student Dashboard...';
    if (alertRef.value) {
      alertRef.value.showSystemAlert('Profile updated successfully! Redirecting to Student Dashboard...', 'success');
    }

    setTimeout(() => {
      router.push('/student/dashboard');
    }, 1200);
  } catch (e) {
    errorMsg.value = e.response?.data?.message || 'Failed to save profile. Please try again.';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    console.error(e);
  } finally {
    isSaving.value = false;
  }
};

const userInitial = () => (user.value.name || 'S').charAt(0).toUpperCase();

import { setupAddressAutocomplete } from '../../utils/placesAutocomplete.js';

const initAddressAutocomplete = (el) => {
  if (el) {
    setupAddressAutocomplete(el, (selectedAddress) => {
      form.value.address = selectedAddress;
    });
  }
};

onMounted(() => {
  fetchProfile();
  fetchCourses();
});
</script>

<template>
  <div class="bg-slate-100 min-h-screen font-sans">
    <FlashAlert ref="alertRef" />
    <StudentNav />

    <div v-if="isLoading" class="flex items-center justify-center py-32">
      <div class="w-8 h-8 border-4 border-[#2a528a] border-t-transparent rounded-full animate-spin"></div>
    </div>

    <main v-else class="bg-slate-100 py-16 px-4">
      <div class="max-w-4xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">

        <!-- Header Bar -->
        <div class="bg-slate-50 border-b border-slate-200 px-8 py-5 flex items-center justify-between gap-4">
          <h1 class="font-black text-xs tracking-[0.3em] uppercase text-black">Student Information Profile</h1>
          <router-link
            to="/student/dashboard"
            class="text-[10px] font-black text-slate-400 hover:text-black uppercase tracking-widest transition text-right shrink-0 ml-auto"
          >&larr; Back to Dashboard</router-link>
        </div>

        <div class="p-8 md:p-12">
          <!-- Success/Error Alerts -->
          <div v-if="successMsg" class="mb-6 bg-green-50 border border-green-200 text-green-700 text-sm font-bold px-5 py-4 rounded-xl flex items-center gap-3">
            <i class="fa-solid fa-circle-check"></i> {{ successMsg }}
          </div>
          <div v-if="errorMsg" class="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm font-bold px-5 py-4 rounded-xl flex items-center gap-3">
            <i class="fa-solid fa-circle-exclamation"></i> {{ errorMsg }}
          </div>

          <form @submit.prevent="saveProfile" class="space-y-12">

            <!-- Profile Header -->
            <div class="flex flex-col md:flex-row items-center md:items-start gap-8 mb-12 pb-8 border-b border-slate-100 text-center md:text-left">
              <div class="relative group cursor-pointer w-24 h-24 flex-shrink-0 rounded-full border border-blue-200 shadow-sm overflow-hidden">
                <UserAvatar :src="profilePicPreview" :name="user.name" class="w-full h-full" />
                <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  </svg>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  @change="handleFileChange"
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  title="Change Profile Picture"
                />
              </div>
              <div class="mt-2">
                <h2 class="text-3xl font-bold text-black tracking-tight">{{ user.name || 'New Student' }}</h2>
                <p class="text-sm font-mono font-bold text-[#2a528a] tracking-wider mt-1">{{ form.student_id || 'ID NOT SET' }}</p>
                <span class="inline-block mt-3 bg-green-100 text-green-700 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full">Enrolled &amp; Verified</span>
              </div>
            </div>

            <!-- Section I: Academic Identity -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-8">
              <div class="md:col-span-1 border-b md:border-b-0 border-slate-100 pb-4 md:pb-0">
                <h3 class="text-xs font-black text-black uppercase tracking-[0.2em]">I. Academic Identity</h3>
                <p class="text-[10px] text-slate-400 mt-1 uppercase leading-relaxed">Institution Records &amp; Identity</p>
              </div>
              <div class="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Lock the Full Name field with readonly and gray bg -->
                <div class="col-span-1 md:col-span-2">
                  <label class="block text-[10px] font-bold text-black uppercase mb-2 ml-0.5">Full Name</label>
                  <input 
                    type="text" 
                    v-model="form.name" 
                    readonly
                    class="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded text-sm text-slate-500 font-semibold cursor-not-allowed outline-none"
                  />
                  <p class="text-[9px] text-slate-400 mt-1.5 ml-1 italic">Verified by CSPC Google Account.</p>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-black uppercase mb-2 ml-0.5">Student ID</label>
                  <input type="text" v-model="form.student_id" placeholder="e.g. 221002008"
                    class="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded text-sm text-black font-semibold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition shadow-sm font-mono" required />
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-black uppercase mb-2 ml-0.5">Gender</label>
                  <select v-model="form.sex"
                    class="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded text-sm text-black font-semibold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition shadow-sm appearance-none" required>
                    <option value="" disabled>Select Gender</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-black uppercase mb-2 ml-0.5">Course</label>
                  <select v-model="form.course"
                    class="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded text-sm text-black font-semibold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition shadow-sm appearance-none" required>
                    <option value="" disabled>Select Course</option>
                    <option v-if="legacyCourseValue" :value="legacyCourseValue">{{ legacyCourseValue }} (previously saved)</option>
                    <option v-for="c in courseOptions" :key="c.course_code" :value="c.course_code">
                      {{ c.course_code }} — {{ c.course_name }}
                    </option>
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-black uppercase mb-2 ml-0.5">Year &amp; Section</label>
                  <input type="text" v-model="form.year_section" placeholder="e.g. 3D"
                    class="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded text-sm text-black font-semibold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition shadow-sm" required />
                </div>
              </div>
            </div>

            <!-- Section II: Personal Details -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-8">
              <div class="md:col-span-1 border-b md:border-b-0 border-slate-100 pb-4 md:pb-0">
                <h3 class="text-xs font-black text-black uppercase tracking-[0.2em]">II. Personal Details</h3>
                <p class="text-[10px] text-slate-400 mt-1 uppercase leading-relaxed">Private Information</p>
              </div>
              <div class="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="col-span-1 md:col-span-2">
                  <label class="block text-[10px] font-bold text-black uppercase mb-2 ml-0.5">Date of Birth</label>
                  <input type="date" v-model="form.dob" @change="onDobChange" :min="minDobDate" :max="maxDobDate"
                    class="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded text-sm text-black font-semibold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition shadow-sm" required />
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-black uppercase mb-2 ml-0.5">Age</label>
                  <input type="number" v-model="form.age"
                    class="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded text-sm text-black font-semibold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition shadow-sm" required />
                  <p class="text-[9px] text-slate-400 mt-1.5 ml-1 font-medium">Calculated automatically from Date of Birth.</p>
                </div>
                <div class="col-span-1 md:col-span-3">
                  <label class="block text-[10px] font-bold text-black uppercase mb-2 ml-0.5">Email Address</label>
                  <input type="email" :value="form.email"
                    class="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded text-sm text-slate-500 font-semibold cursor-not-allowed outline-none" readonly />
                  <p class="text-[9px] text-slate-400 mt-1.5 ml-1 italic">Tied to your CSPC Google Account.</p>
                </div>
                <div class="col-span-1 md:col-span-3">
                  <label class="block text-[10px] font-bold text-black uppercase mb-2 ml-0.5">Permanent Home Address</label>
                  <input type="text" :ref="initAddressAutocomplete" v-model="form.address" placeholder="e.g. Zone 4, Barangay San Isidro, Nabua, Camarines Sur" required
                    class="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded text-sm text-black font-semibold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition shadow-sm" />
                  <p class="text-[9px] text-slate-400 mt-1.5 ml-1 italic">Your permanent or family residence, distinct from your current boarding house accommodation.</p>
                </div>
              </div>
            </div>

            <!-- Section III: Contact & Emergency -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-8">
              <div class="md:col-span-1 border-b md:border-b-0 border-slate-100 pb-4 md:pb-0">
                <h3 class="text-xs font-black text-black uppercase tracking-[0.2em]">III. Contact &amp; Emergency</h3>
                <p class="text-[10px] text-slate-400 mt-1 uppercase leading-relaxed">Communication records</p>
              </div>
              <div class="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label class="block text-[10px] font-bold text-black uppercase mb-2 ml-0.5">Your Contact Number</label>
                  <input type="text" v-model="form.phone" @input="sanitizePhoneInput('phone')"
                    inputmode="numeric" maxlength="11" placeholder="09XXXXXXXXX" required
                    class="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded text-sm text-black font-semibold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition shadow-sm" />
                  <p class="text-[9px] text-slate-400 mt-1.5 ml-1 italic">PH mobile format, e.g. 0912 345 6789.</p>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-black uppercase mb-2 ml-0.5">Emergency Contact #</label>
                  <input type="text" v-model="form.emergency_contact" @input="sanitizePhoneInput('emergency_contact')"
                    inputmode="numeric" maxlength="11" placeholder="09XXXXXXXXX" required
                    class="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded text-sm text-black font-semibold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition shadow-sm" />
                  <p class="text-[9px] text-slate-400 mt-1.5 ml-1 italic">PH mobile format, e.g. 0912 345 6789.</p>
                </div>
                <div class="col-span-1 md:col-span-2">
                  <label class="block text-[10px] font-bold text-black uppercase mb-2 ml-0.5">Guardian Full Name</label>
                  <input type="text" v-model="form.guardian_name" required
                    class="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded text-sm text-black font-semibold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition shadow-sm" />
                </div>
              </div>
            </div>

            <!-- Submit -->
            <div class="pt-10 mt-6 flex justify-end border-t border-slate-200">
              <button
                type="submit"
                :disabled="isSaving"
                class="w-full md:w-auto bg-black hover:bg-blue-600 text-white text-[11px] font-black tracking-[0.3em] uppercase px-16 py-4 rounded-xl shadow-lg transition-all active:scale-95 text-center disabled:opacity-50 flex items-center gap-2 justify-center"
              >
                <div v-if="isSaving" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {{ isSaving ? 'Saving...' : 'Save Profile Changes' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  </div>
</template>