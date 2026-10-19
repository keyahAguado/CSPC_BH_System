<script setup>
// Data-table style pagination bar ("Showing 1 to 10 of 42 entries · Rows per page · ‹ Prev 1 2 3 Next ›").
// Used above and below the admin tables so paging is reachable without scrolling; shown even when the list is empty.
import { computed } from 'vue';

const props = defineProps({
  page: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  start: { type: Number, required: true },
  end: { type: Number, required: true },
  total: { type: Number, required: true },
  perPage: { type: Number, default: null },
  noun: { type: String, default: 'entries' },
  position: { type: String, default: 'bottom' },
  // Rows-per-page choices; small lists (e.g. admin room tables) can offer fewer rows
  options: { type: Array, default: () => [10, 25, 50, 100] }
});
const emit = defineEmits(['update:page', 'update:perPage']);

// Page buttons: first, last, and up to two around the current page, with gaps as "…"
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
  <div :class="['tp-bar', 'is-' + position, 'no-print']">
    <div class="tp-info">
      <span>Showing {{ start }} to {{ end }} of {{ total }} {{ noun }}</span>
      <label v-if="perPage" class="tp-rows">
        <span>Rows per page</span>
        <select :value="perPage" aria-label="Rows per page" @change="emit('update:perPage', Number($event.target.value))">
          <option v-for="n in options" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
    </div>
    <nav class="tp-pages" aria-label="Pagination">
      <button type="button" :disabled="page <= 1" aria-label="Previous page" @click="go(page - 1)"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Prev</button>
      <template v-for="n in pages" :key="n">
        <span v-if="typeof n === 'string'" class="tp-gap" aria-hidden="true">…</span>
        <button v-else type="button" :class="{ 'is-active': n === page }" :aria-current="n === page ? 'page' : undefined" @click="go(n)">{{ n }}</button>
      </template>
      <button type="button" :disabled="page >= totalPages" aria-label="Next page" @click="go(page + 1)">Next <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
    </nav>
  </div>
</template>

<style scoped>
.tp-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; padding: 10px 16px; background: #f8fafc; font-size: 13px; font-weight: 600; color: #475569; flex-shrink: 0; }
.tp-bar.is-top { border-bottom: 1px solid #e2e8f0; }
.tp-bar.is-bottom { border-top: 1px solid #e2e8f0; }
.tp-info { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; }
.tp-rows { display: inline-flex; align-items: center; gap: 8px; color: #64748b; }
.tp-rows select { height: 32px; min-height: 32px !important; padding: 0 8px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; font-size: 13px; font-weight: 700; color: #334155; outline: none; cursor: pointer; }
.tp-pages { display: flex; align-items: center; gap: 6px; }
.tp-pages button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 34px; height: 34px; min-height: 34px !important; padding: 0 10px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; color: #334155; font-size: 13px; font-weight: 700; cursor: pointer; }
.tp-pages button i { font-size: 11px; }
.tp-pages button:hover:not(:disabled):not(.is-active) { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
.tp-pages button.is-active { background: #2563eb; border-color: #2563eb; color: #fff; }
.tp-pages button:disabled { opacity: .45; cursor: default; }
.tp-gap { padding: 0 2px; color: #94a3b8; }
</style>
