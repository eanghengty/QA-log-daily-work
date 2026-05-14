<script setup>
defineProps({
  label: String,
  value: [String, Number],
  accent: {
    type: String,
    default: 'var(--ink)',
  },
  sub: String,
})
</script>

<template>
  <div class="box p-4" style="min-width: 140px">
    <div class="label">{{ label }}</div>
    <div class="row items-center gap-2" style="margin-top: 8px">
      <div class="mono" style="font-size: 32px; font-weight: 600; color: var(--accent)" :style="{ color: accent }">{{ value }}</div>
      <div v-if="sub" class="small">{{ sub }}</div>
    </div>
  </div>
</template>
