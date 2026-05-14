<script setup>
defineProps({
  title: {
    type: [String, Object],
    required: true,
  },
  subtitle: {
    type: [String, Object],
    default: null,
  },
})

defineSlots()
</script>

<template>
  <div class="between" style="padding: 18px 28px; border-bottom: 1.5px solid var(--line)">
    <div class="col gap-2">
      <div class="title-xl">{{ title }}</div>
      <div v-if="subtitle" class="small">{{ subtitle }}</div>
    </div>
    <div class="row gap-2">
      <slot />
    </div>
  </div>
</template>
