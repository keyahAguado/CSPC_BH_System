<script setup>
defineProps({ title: String, description: String, eyebrow: String });
</script>
<template><header class="management-page-header no-print"><div><p v-if="eyebrow" class="management-eyebrow">{{ eyebrow }}</p><h1>{{ title }}</h1><p v-if="description" class="management-page-description">{{ description }}</p></div><div v-if="$slots.default" class="management-header-actions"><slot /></div></header></template>
