<script setup>
import { ref, onMounted } from 'vue';

const deferredPrompt = ref(null);
const showBanner = ref(false);
const showIosModal = ref(false);
const isIos = ref(false);

const checkIfIos = () => {
  const ua = window.navigator.userAgent;
  const isIPhone = /iPhone|iPad|iPod/i.test(ua);
  const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  return isIPhone && !isStandalone;
};

onMounted(() => {
  // Don't show if user previously dismissed
  const isDismissed = localStorage.getItem('pwa_prompt_dismissed');
  
  isIos.value = checkIfIos();

  if (isIos.value) {
    if (!isDismissed) {
      // Delay prompt slightly on first visit for smooth entrance
      setTimeout(() => {
        showBanner.value = true;
      }, 1500);
    }
  } else {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent browser default mini-infobar
      e.preventDefault();
      deferredPrompt.value = e;
      if (!isDismissed) {
        setTimeout(() => {
          showBanner.value = true;
        }, 1500);
      }
    });
  }

  // Hide banner if app is installed
  window.addEventListener('appinstalled', () => {
    showBanner.value = false;
    deferredPrompt.value = null;
  });
});

const handleInstallClick = async () => {
  if (isIos.value) {
    showIosModal.value = true;
    return;
  }

  if (!deferredPrompt.value) {
    showIosModal.value = true;
    return;
  }

  deferredPrompt.value.prompt();
  const { outcome } = await deferredPrompt.value.userChoice;
  if (outcome === 'accepted') {
    showBanner.value = false;
  }
  deferredPrompt.value = null;
};

const dismissBanner = () => {
  showBanner.value = false;
  localStorage.setItem('pwa_prompt_dismissed', 'true');
};

const closeIosModal = () => {
  showIosModal.value = false;
  dismissBanner();
};
</script>

<template>
  <div>
    <!-- Floating Bottom PWA Installation Banner -->
    <transition
      enter-active-class="transform transition ease-out duration-300 duration-300"
      enter-from-class="translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transform transition ease-in duration-200"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-full opacity-0"
    >
      <div
        v-if="showBanner"
        class="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md bg-slate-900/95 backdrop-blur-md text-white p-5 rounded-3xl shadow-2xl z-[999] border border-slate-700/50 flex flex-col gap-3 font-sans"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-xl shadow-lg shadow-blue-500/30 shrink-0">
              <i class="fa-solid fa-mobile-screen-button"></i>
            </div>
            <div>
              <h3 class="text-sm font-black uppercase tracking-tight text-white leading-tight">
                Install CSPC Boarding App
              </h3>
              <p class="text-[11px] font-medium text-slate-300 mt-0.5 leading-tight">
                Install for quick access, full screen view & offline updates.
              </p>
            </div>
          </div>
          <button
            @click="dismissBanner"
            class="text-slate-400 hover:text-white transition p-1 text-lg leading-none"
            aria-label="Close"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="flex items-center gap-2 pt-1">
          <button
            @click="handleInstallClick"
            class="flex-1 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black py-2.5 px-4 rounded-xl text-xs uppercase tracking-widest transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer"
          >
            <i class="fa-solid fa-download"></i>
            Install Now
          </button>
          <button
            @click="dismissBanner"
            class="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </transition>

    <!-- iOS Step-by-Step Installation Modal -->
    <div
      v-if="showIosModal"
      class="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[1000] flex items-end sm:items-center justify-center p-4"
    >
      <div
        class="bg-white text-slate-900 rounded-[2.5rem] p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200"
      >
        <div class="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-4">
          <i class="fa-solid fa-square-plus"></i>
        </div>
        <h3 class="text-lg font-black uppercase tracking-tight text-slate-900 mb-2">
          Install on iOS (iPhone/iPad)
        </h3>
        <p class="text-xs text-slate-500 font-medium mb-6 leading-relaxed">
          Follow these 3 quick steps in Safari to add the app to your Home Screen:
        </p>

        <div class="space-y-4 text-left bg-slate-50 p-4 rounded-2xl mb-6 border border-slate-100 text-xs">
          <div class="flex items-center gap-3">
            <span class="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">1</span>
            <p class="font-bold text-slate-700">
              Tap the <span class="text-blue-600 font-black"><i class="fa-solid fa-share-nodes"></i> Share</span> icon in Safari's menu bar.
            </p>
          </div>
          <div class="flex items-center gap-3">
            <span class="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">2</span>
            <p class="font-bold text-slate-700">
              Scroll down & tap <span class="text-blue-600 font-black"><i class="fa-solid fa-square-plus"></i> Add to Home Screen</span>.
            </p>
          </div>
          <div class="flex items-center gap-3">
            <span class="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">3</span>
            <p class="font-bold text-slate-700">
              Tap <span class="text-blue-600 font-black">Add</span> in the top-right corner.
            </p>
          </div>
        </div>

        <button
          @click="closeIosModal"
          class="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition active:scale-95 cursor-pointer"
        >
          Got it!
        </button>
      </div>
    </div>
  </div>
</template>
