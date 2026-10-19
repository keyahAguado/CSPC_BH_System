<script setup>
import {computed,ref,watch} from 'vue';
import {getImageUrl} from '../config/api.js';
const props=defineProps({src:String,name:{type:String,default:'User'},alt:String});
const failed=ref(false);
const photo=computed(()=>props.src?getImageUrl(props.src):'');
watch(photo,()=>{failed.value=false;});
const initials=computed(()=>String(props.name || "User").trim().split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase() || 'U');
</script>
<template><span class="user-avatar" :aria-label="alt || name" role="img"><img v-if="photo && !failed" :src="photo" alt="" referrerpolicy="no-referrer" @error="failed=true"><span v-else aria-hidden="true">{{ initials }}</span></span></template>
<style scoped>.user-avatar{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;vertical-align:middle;background:#e8f0ff;color:#1d4ed8;font-size:inherit;font-weight:600;isolation:isolate}.user-avatar img{display:block;width:100%;height:100%;object-fit:cover}.user-avatar>span{font-size:inherit;line-height:1}</style>
