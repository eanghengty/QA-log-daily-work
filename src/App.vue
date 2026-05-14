<script setup>
import { RouterView } from 'vue-router'
import Sidebar from './components/Sidebar.vue'
</script>

<template>
  <div class="wf row">
    <Sidebar />
    <RouterView />
  </div>
</template>
