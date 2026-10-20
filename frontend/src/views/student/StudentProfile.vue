<script setup>
import UserAvatar from "../../components/UserAvatar.vue";
import { validateInput } from '../../utils/inputValidation.js';
import { ref, onMounted, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import StudentNav from '../../components/partials/StudentNav.vue';
import FlashAlert from '../../components/partials/FlashAlert.vue';
import AddressPicker from '../../components/AddressPicker.vue';
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
  if (!String(form.value.address || '').trim()) return 'Please complete your permanent home address (select down to the barangay).';
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
    
    // Lets the top bar show the new photo/name right away
    window.dispatchEvent(new Event('profile-updated'));
    successMsg.value = 'Profile updated successfully! Redirecting to Student Dashboard...';
    if (alertRef.value) {
      alertRef.value.showSystemAlert('Profile updated successfully! Redirecting to Student Dashboard...', 'success');
    }

    // Phones stay on the profile (edited in place); desktop returns to the dashboard
    if (isPhone()) {
      successMsg.value = 'Profile updated successfully!';
      showAddressPicker.value = false;
      profilePicFile.value = null;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
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

// ---------- Phone layout: every detail row is editable in place, saved with "Save Changes" ----------
const showAddressPicker = ref(false);
const isPhone = () => window.matchMedia('(max-width: 767px)').matches;

const dobLabel = computed(() => {
  if (!form.value.dob) return '';
  const [y, m, d] = form.value.dob.split('-');
  return `${m}/${d}/${y}`;
});

// [icon, label, form field, input type, hint]
const infoSections = [
  { title: 'Academic Information', numeral: 'I', subtitle: 'Institution Records & Identity', rows: [
    ['fa-user', 'Full Name', 'name', 'readonly', 'Verified by CSPC Google Account.'],
    ['fa-id-card', 'Student ID', 'student_id', 'text'],
    ['fa-venus-mars', 'Gender', 'sex', 'sex'],
    ['fa-book-open', 'Course', 'course', 'course'],
    ['fa-users', 'Year & Section', 'year_section', 'text']
  ] },
  { title: 'Personal Details', numeral: 'II', subtitle: 'Private Information', rows: [
    ['fa-calendar-days', 'Date of Birth', 'dob', 'date'],
    ['fa-cake-candles', 'Age', 'age', 'number', 'Calculated automatically from Date of Birth.'],
    ['fa-envelope', 'Email Address', 'email', 'readonly', 'Tied to your CSPC Google Account.'],
    ['fa-house', 'Permanent Home Address', 'address', 'address']
  ] },
  { title: 'Contact & Emergency Information', numeral: 'III', subtitle: 'Communication records', rows: [
    ['fa-phone', 'Your Contact Number', 'phone', 'phone', 'PH mobile format, e.g. 0912 345 6789.'],
    ['fa-phone-volume', 'Emergency Contact #', 'emergency_contact', 'phone', 'PH mobile format, e.g. 0912 345 6789.'],
    ['fa-user-group', 'Guardian Full Name', 'guardian_name', 'text']
  ] }
];

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

    <template v-else>
    <!-- ===================== PHONE: profile with details edited in place ===================== -->
    <form class="md:hidden bg-[#f4f7fc] min-h-screen px-4 pt-5 pb-8 text-left" @submit.prevent="saveProfile" novalidate>
      <h1 class="text-[28px] font-black text-[#0f1f45] tracking-tight mb-4">Profile</h1>

      <div v-if="successMsg" role="status" class="mb-4 bg-green-50 border border-green-200 text-green-700 text-[13px] font-semibold px-4 py-3 rounded-xl flex items-center gap-2.5">
        <i class="fa-solid fa-circle-check" aria-hidden="true"></i> {{ successMsg }}
      </div>
      <div v-if="errorMsg" role="alert" class="mb-4 bg-red-50 border border-red-200 text-red-700 text-[13px] font-semibold px-4 py-3 rounded-xl flex items-center gap-2.5">
        <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ errorMsg }}
      </div>

      <!-- Identity card -->
      <section class="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_18px_rgb(15_47_102/.06)] p-4 flex items-center gap-4">
        <!-- Tap the photo to change it (same as desktop) -->
        <div class="relative shrink-0 rounded-full overflow-hidden">
          <UserAvatar :src="profilePicPreview" :name="user.name" class="pv-avatar" />
          <input type="file" accept="image/*" @change="handleFileChange" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="Change profile picture" title="Change profile picture">
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="text-[19px] font-black text-[#0f1f45] uppercase leading-tight tracking-tight break-words">{{ user.name || 'New Student' }}</h2>
          <p class="text-[15px] text-slate-500 tracking-[0.15em] mt-0.5">{{ form.student_id || 'ID not set' }}</p>
          <span class="inline-flex items-center gap-1.5 mt-2.5 bg-green-50 border border-green-100 text-green-700 text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-full">
            <i class="fa-solid fa-circle-check" aria-hidden="true"></i> Enrolled &amp; Verified
          </span>
          <p v-if="profilePicFile" class="text-[11px] text-blue-700 mt-2">New photo selected. Tap Save Changes to keep it.</p>
        </div>
      </section>

      <!-- Student information (tap a value to edit it) -->
      <section aria-label="Student information" class="mt-4 bg-white rounded-2xl border border-slate-100 shadow-[0_4px_18px_rgb(15_47_102/.06)] p-3">

        <div class="space-y-3">
          <div v-for="section in infoSections" :key="section.title" class="rounded-xl border border-slate-100 overflow-hidden">
            <div class="bg-[#eef3fb] px-3 py-2.5">
            <h3 class="flex items-center gap-2.5 text-[15px] font-bold text-black">
              <span class="shrink-0">{{ section.numeral }}.</span> {{ section.title }}
            </h3>
            <p class="mt-1 text-[11px] text-black">{{ section.subtitle }}</p>
            </div>
            <div class="px-3">
              <div v-for="row in section.rows" :key="row[2]" class="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.5fr)] items-start gap-x-2 py-1 border-b border-slate-100 last:border-b-0">
                <label :for="'pv-' + row[2]" class="text-[12.5px] text-slate-500 leading-snug pt-[7px]">{{ row[1] }}</label>
                <div class="min-w-0">
                  <!-- Read-only (tied to the Google account) -->
                  <p v-if="row[3] === 'readonly'" :id="'pv-' + row[2]" class="pv-static">{{ form[row[2]] || 'Not set' }}</p>

                  <select v-else-if="row[3] === 'sex'" :id="'pv-' + row[2]" v-model="form.sex" class="pv-input pv-select">
                    <option value="" disabled>Select gender</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                  </select>

                  <select v-else-if="row[3] === 'course'" :id="'pv-' + row[2]" v-model="form.course" class="pv-input pv-select">
                    <option value="" disabled>Select course</option>
                    <option v-if="legacyCourseValue" :value="legacyCourseValue">{{ legacyCourseValue }} (previously saved)</option>
                    <option v-for="c in courseOptions" :key="c.course_code" :value="c.course_code">{{ c.course_code }} — {{ c.course_name }}</option>
                  </select>

                  <input v-else-if="row[3] === 'date'" :id="'pv-' + row[2]" type="date" v-model="form.dob" @change="onDobChange" :min="minDobDate" :max="maxDobDate" class="pv-input">

                  <input v-else-if="row[3] === 'number'" :id="'pv-' + row[2]" type="number" inputmode="numeric" v-model="form.age" class="pv-input">

                  <input
                    v-else-if="row[3] === 'phone'"
                    :id="'pv-' + row[2]"
                    type="text"
                    inputmode="numeric"
                    maxlength="11"
                    placeholder="09XXXXXXXXX"
                    v-model="form[row[2]]"
                    @input="sanitizePhoneInput(row[2])"
                    class="pv-input"
                  >

                  <template v-else-if="row[3] === 'address'">
                    <button
                      v-if="!showAddressPicker"
                      :id="'pv-' + row[2]"
                      type="button"
                      @click="showAddressPicker = true"
                      class="pv-input pv-wrap text-left h-auto"
                    >{{ form.address || 'Tap to set your address' }}</button>
                    <div v-else class="pt-1">
                      <AddressPicker v-model="form.address" id-prefix="student-address-m"
                        field-class="w-full bg-slate-50 border border-slate-300 rounded-lg text-sm text-black font-medium focus:bg-white focus:border-blue-500 outline-none transition"
                        label-class="block text-[11px] font-semibold text-slate-500 mb-1" />
                      <button type="button" @click="showAddressPicker = false" class="mt-2 text-[12px] font-semibold text-blue-700">Done</button>
                    </div>
                  </template>

                  <input v-else :id="'pv-' + row[2]" type="text" v-model="form[row[2]]" class="pv-input">

                  <span v-if="row[4]" class="block text-[11px] text-slate-400 italic leading-tight pb-1 px-1.5">{{ row[4] }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          :disabled="isSaving"
          class="mt-5 w-full bg-blue-700 hover:bg-blue-800 text-white text-[15px] font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <span v-if="isSaving" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true"></span>
          {{ isSaving ? 'Saving…' : 'Save Changes' }}
        </button>
      </section>
    </form>

    <!-- ===================== DESKTOP FORM ===================== -->
    <main class="hidden md:block bg-slate-100 py-16 px-4">
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
                  <p class="block text-[10px] font-bold text-black uppercase mb-2 ml-0.5">Permanent Home Address</p>
                  <AddressPicker v-model="form.address" id-prefix="student-address"
                    field-class="w-full bg-slate-50 border border-slate-300 rounded text-sm text-black font-semibold focus:bg-white focus:border-blue-500 outline-none transition shadow-sm"
                    label-class="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 ml-0.5" />
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
    </template>
  </div>
</template>

<style scoped>
.pv-avatar { width: 92px; height: 92px; border-radius: 999px; border: 3px solid #eef3fb; box-shadow: 0 4px 14px rgb(15 47 102 / .12); font-size: 28px; }
/* Detail values look like plain text but are editable fields */
.pv-input { width: 100%; min-height: 34px; padding: 6px; margin: 0; border: 1px solid transparent; border-radius: 10px; background-color: transparent; color: #000; font-size: 14px; font-weight: 500; line-height: 1.35; outline: none; appearance: none; -webkit-appearance: none; }
.pv-input:hover { background-color: #f4f7fc; }
.pv-input:focus { border-color: #3b82f6; background-color: #fff; box-shadow: 0 0 0 3px rgb(59 130 246 / .12); }
.pv-select { padding-right: 22px; text-overflow: ellipsis; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M1 3l4 4 4-4' fill='none' stroke='%2364748b' stroke-width='1.5'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 8px center; }
.pv-static { padding: 6px; font-size: 14px; font-weight: 500; color: #000; line-height: 1.35; }
.pv-static, .pv-wrap { overflow-wrap: anywhere; white-space: normal; }
</style>
