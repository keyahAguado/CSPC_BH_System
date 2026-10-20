<script setup>
import OwnerDirectPaymentSetup from '../../components/OwnerDirectPaymentSetup.vue';
import OwnerNav from '../../components/partials/OwnerNav.vue';
</script>
<template>
  <div class="management-page owner-page"><OwnerNav />
    <main id="management-content" class="management-content payment-settings">
      <header class="payments-hero"><div><p class="eyebrow">PAYMENT SETTINGS</p><h1>Online payments</h1><p>A simple way for students to pay, directly to your merchant account.</p></div><span class="hero-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></svg> Your account. Your payments.</span></header>
      <OwnerDirectPaymentSetup />
    </main>
  </div>
</template>
<style scoped>
.payment-settings{max-width:1180px;margin:0 auto;padding:28px 24px 48px}
.payments-hero{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:24px;padding:8px 0 4px}
.payments-hero p{font-size:15px;line-height:1.75;color:#334155;margin:10px 0}
.payment-settings .eyebrow{font-size:10px;letter-spacing:.14em;font-weight:750;color:#475569;margin-bottom:6px}
.payment-settings h1{font-size:32px;font-weight:750;letter-spacing:-.035em;color:#0f172a}
.hero-tag{display:flex;align-items:center;gap:8px;background:#edf4ff;border:1px solid #dce8fa;color:#1e3a8a;font-size:11px;font-weight:650;padding:10px 13px;border-radius:10px;white-space:nowrap}
.hero-tag svg{width:17px;height:17px}
@media(max-width:900px){.hero-tag{display:none}}
@media(max-width:639px){.payment-settings{padding:22px 14px 36px}.payments-hero{padding:0}.payment-settings h1{font-size:28px}}

/* Preserve the shared branch's compact payment-page spacing. */
.payment-settings.management-content{padding-top:14px!important}.payment-settings .payments-hero{padding:0;margin-bottom:12px}.payments-hero p{margin:4px 0 0}
@media(max-width:639px){.payment-settings h1{font-size:24px}.payments-hero p{font-size:13.5px}.payment-settings .eyebrow{margin-bottom:2px}}

@media(max-width:639px){
  .payment-settings.management-content{min-width:0;padding-right:12px!important;padding-left:12px!important;padding-bottom:calc(28px + env(safe-area-inset-bottom))!important}
  .payment-settings .payments-hero{display:block;margin-bottom:16px}
  .payments-hero>div{min-width:0}
  .payment-settings h1{font-size:26px;line-height:1.2;margin:6px 0 8px}
  .payments-hero p{font-size:14px;line-height:1.6;overflow-wrap:anywhere}
  .payment-settings .eyebrow{font-size:10px;line-height:1.5;margin:0}
}
</style>
