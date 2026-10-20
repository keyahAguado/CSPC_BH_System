<script setup>
// Student-side pagination bar: "Showing 1–6 of 11 boarding houses" · ‹ 1 2 3 ›
import { computed } from 'vue';

const props = defineProps({
  page: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  start: { type: Number, required: true },
  end: { type: Number, required: true },
  total: { type: Number, required: true },
  noun: { type: String, default: 'items' }
});
const emit = defineEmits(['update:page']);

// Page buttons: first, last, and one either side of the current page, with gaps as "…"
const pages = computed(() => {
  const total = Math.max(1, props.totalPages);
  const keep = new Set([1, total, props.page - 1, props.page, props.page + 1].filter(n => n >= 1 && n <= total));
  const list = [];
  let prev = 0;
  [...keep].sort((a, b) => a - b).forEach(n => {
    if (n - prev > 1) list.push('gap-' + n);
    list.push(n);
    prev = n;
  });
  return list;
});
const go = (n) => { if (n >= 1 && n <= props.totalPages && n !== props.page) emit('update:page', n); };
</script>

<template>
  <div class="sp-bar">
    <p class="sp-info">Showing {{ start }}–{{ end }} of {{ total }} {{ noun }}</p>
    <nav class="sp-pages" aria-label="Pagination">
      <button type="button" class="sp-btn" :disabled="page <= 1" aria-label="Previous page" @click="go(page - 1)">
        <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
      </button>
      <template v-for="n in pages" :key="n">
        <span v-if="typeof n === 'string'" class="sp-gap" aria-hidden="true">…</span>
        <button v-else type="button" class="sp-btn" :class="{ 'is-active': n === page }" :aria-label="`Page ${n}`" :aria-current="n === page ? 'page' : undefined" @click="go(n)">{{ n }}</button>
      </template>
      <button type="button" class="sp-btn" :disabled="page >= totalPages" aria-label="Next page" @click="go(page + 1)">
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.sp-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 16px; padding: 12px 4px; }
.sp-info { margin: 0; font-size: 14px; font-weight: 500; color: #64748b; }
.sp-pages { display: flex; align-items: center; gap: 8px; }
.sp-btn { min-width: 44px; height: 44px; padding: 0 10px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; color: #1e293b; font-size: 14px; font-weight: 800; cursor: pointer; transition: border-color .15s, color .15s, background-color .15s; }
.sp-btn i { font-size: 13px; color: #475569; }
.sp-btn:hover:not(:disabled):not(.is-active) { border-color: #93c5fd; color: #1d4ed8; }
.sp-btn:disabled { cursor: default; background: #f8fafc; }
.sp-btn:disabled i { color: #cbd5e1; }
.sp-btn.is-active { background: #1d4ed8; border-color: #1d4ed8; color: #fff; box-shadow: 0 2px 6px rgb(29 78 216 / .25); }
.sp-btn:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
.sp-gap { width: 20px; text-align: center; color: #94a3b8; font-size: 13px; }
@media (max-width: 639px) {
  .sp-bar { justify-content: center; }
  .sp-info { width: 100%; text-align: center; font-size: 13px; }
  .sp-btn { min-width: 40px; height: 40px; }
}
</style>
