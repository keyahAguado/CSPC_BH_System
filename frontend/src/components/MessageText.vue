<script setup>
import {computed} from 'vue';
import {messageSegments} from '../utils/messageEmphasis.js';
const props=defineProps({text:[String,Number]});
const segments=computed(()=>messageSegments(props.text));
</script>
<template><span class="message-text"><template v-for="(part,index) in segments" :key="index"><strong v-if="part.strong">{{ part.text }}</strong><template v-else>{{ part.text }}</template></template></span></template>
<style scoped>.message-text{white-space:inherit;overflow-wrap:anywhere}.message-text strong{font-weight:700;color:#102e50}</style>
