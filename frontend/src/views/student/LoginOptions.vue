<script setup>
import Header from '../../components/partials/Header.vue';

import { getApiBaseUrl } from '../../config/api';

const API = getApiBaseUrl();

const handleGoogleLogin = () => {
  const currentOrigin = window.location.origin;
  window.location.href = `${API}/api/auth/google?origin=${encodeURIComponent(currentOrigin)}`;
};
</script>

<template>
  <div class="bg-slate-50 min-h-screen font-sans">
    <Header />

    <main class="min-h-[85vh] flex items-center justify-center p-6 bg-slate-50">
      <div class="bg-white rounded-[2rem] shadow-2xl p-8 max-w-md w-full text-center border border-slate-100">
          
        <div class="mb-10 text-center">
          <h1 class="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Portal Access</h1>
          <p class="text-blue-600 font-bold uppercase text-[10px] tracking-[0.3em]">CSPC Boarding House Selection</p>
          <div class="w-12 h-1 bg-blue-600 mx-auto rounded-full mt-4"></div>
        </div>

        <div class="space-y-4">
          <!-- 1. STUDENT LOGIN -->
          <button 
            @click="handleGoogleLogin"
            class="w-full group flex items-center bg-white hover:bg-slate-50 border-2 border-slate-100 hover:border-blue-500 p-3 rounded-2xl transition-all duration-300 shadow-sm cursor-pointer"
          >
            <div class="bg-slate-50 group-hover:bg-blue-50 p-2.5 rounded-xl transition-colors">
              <img src="/img/CSPC_logo.png" alt="Logo" class="w-6 h-6 object-contain" />
            </div>
            <span class="flex-1 font-bold text-[13px] text-slate-700 uppercase tracking-widest text-center pr-10">Student</span>
          </button>

          <!-- 2. OWNER SECTION -->
          <div class="grid grid-cols-2 gap-3">
            <router-link to="/login"
               class="group flex flex-col items-center bg-white hover:bg-slate-50 border-2 border-slate-100 hover:border-blue-500 p-4 rounded-2xl transition-all duration-300 shadow-sm">
              <div class="bg-slate-50 group-hover:bg-blue-50 p-2.5 rounded-xl mb-2 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-slate-400 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
              </div>
              <span class="font-bold text-[10px] text-slate-700 uppercase tracking-[0.2em]">Owner Login</span>
            </router-link>
            
            <router-link to="/register"
               class="group flex flex-col items-center bg-white hover:bg-slate-50 border-2 border-slate-100 hover:border-blue-500 p-4 rounded-2xl transition-all duration-300 shadow-sm font-bold">
              <div class="bg-slate-50 group-hover:bg-blue-50 p-2.5 rounded-xl mb-2 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-slate-400 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <span class="font-bold text-[10px] text-slate-700 uppercase tracking-[0.2em]">Owner Sign-up</span>
            </router-link>
          </div>

          <!-- 3. ADMIN LOGIN -->
          <router-link to="/login"
             class="group flex items-center bg-white hover:bg-slate-50 border-2 border-slate-100 hover:border-blue-500 p-3 rounded-2xl transition-all duration-300 shadow-sm">
            <div class="bg-slate-50 group-hover:bg-blue-50 p-2.5 rounded-xl transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-slate-400 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span class="flex-1 font-bold text-[13px] text-slate-700 uppercase tracking-widest text-center pr-10">Admin</span>
          </router-link>

          <!-- 4. GUEST LOGIN -->
          <router-link to="/student/dashboard?guest=true"
             class="group flex items-center bg-white hover:bg-slate-50 border-2 border-slate-100 hover:border-blue-500 p-3 rounded-2xl transition-all duration-300 shadow-sm">
            <div class="bg-slate-50 group-hover:bg-blue-50 p-2.5 rounded-xl transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-slate-400 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span class="flex-1 font-bold text-[13px] text-slate-700 uppercase tracking-widest text-center pr-10">Guest</span>
          </router-link>
        </div>
        
        <p class="mt-8 text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">CSPC Boarding House System v1.0</p>
      </div>
    </main>
  </div>
</template>