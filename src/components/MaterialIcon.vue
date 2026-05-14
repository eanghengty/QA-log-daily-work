<script setup>
defineProps({
  name: {
    type: String,
    required: true,
  },
  size: {
    type: [Number, String],
    default: 18,
  },
})
</script>

<template>
  <span
    class="material-symbols-outlined material-icon"
    :style="{ fontSize: `${size}px` }"
    aria-hidden="true"
  >
    {{ name }}
  </span>
</template>
