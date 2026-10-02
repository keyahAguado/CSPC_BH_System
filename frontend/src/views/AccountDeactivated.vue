<template>
  <main class="min-h-screen bg-slate-50 flex items-center justify-center p-6">
    <section class="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 sm:p-10 text-center shadow-sm" aria-labelledby="account-status-title">
      <img src="/img/CSPC_logo.png" alt="CSPC" class="h-16 w-16 object-contain mx-auto mb-6" />
      <p class="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Account Status Notice</p>
      <h1 id="account-status-title" class="text-2xl font-bold text-slate-900">Account Deactivated</h1>
      <p class="mt-4 text-sm leading-relaxed text-slate-600">Your account has been deactivated by the Office of Student Affairs and Services (SASO). Access is currently unavailable.</p>
      <p class="mt-3 text-sm leading-relaxed text-slate-600">Please contact SASO for assistance. Once your account is reactivated, you may sign in again.</p>
      <router-link to="/login" class="inline-block mt-7 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Return to Sign In</router-link>
    </section>
  </main>
</template>
