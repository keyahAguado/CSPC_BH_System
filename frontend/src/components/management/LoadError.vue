<script setup>
defineProps({ message: String });
</script>
<template><div v-if="message" class="management-load-error no-print" role="alert"><strong>Records could not be loaded</strong><p>{{ message }}</p></div></template>
