<script setup>
defineProps({ label: String, value: [String, Number], description: String, to: String, icon: String });
</script>
<template><component :is="to ? 'router-link' : 'article'" :to="to" class="management-metric"><div class="management-metric-top"><span>{{ label }}</span><i v-if="icon" :class="['fa-solid', icon]" aria-hidden="true"></i></div><strong>{{ value }}</strong><p>{{ description }}</p></component></template>
