<script setup>
import MaterialIcon from './MaterialIcon.vue'

defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  checklistId: {
    type: [String, Number],
    required: true,
  },
  parentDepth: {
    type: Number,
    default: 1,
  },
  draftTitles: {
    type: Object,
    default: () => ({}),
  },
  statusClass: {
    type: Function,
    required: true,
  },
  statusLabel: {
    type: Function,
    required: true,
  },
})

const emit = defineEmits([
  'add-child',
  'rename',
  'toggle-done',
  'toggle-na',
  'open-log',
  'remove',
  'update-draft',
])

function getChildren(item) {
  return Array.isArray(item?.childItems) ? item.childItems : []
}

function getInputKey(checklistId, itemId) {
  return `${checklistId}:${itemId}`
}

function getDraftValue(draftTitles, checklistId, itemId) {
  return draftTitles[getInputKey(checklistId, itemId)] || ''
}
</script>

<template>
  <div class="col gap-2 nested-subtask-list">
    <div
      v-for="item in items"
      :key="item.id"
      class="box-dash p-3 col gap-2 nested-subtask"
      :style="{ '--nested-depth': parentDepth }"
    >
      <div class="nested-subtask-row">
        <input
          class="field grow"
          type="text"
          :value="item.title"
          @change="emit('rename', item, $event)"
        />
        <div class="row gap-2" style="flex-wrap: wrap">
          <label class="row items-center gap-2">
            <input
              type="checkbox"
              :checked="item.status === 'done'"
              @change="emit('toggle-done', item)"
            />
            <span class="small" style="color: var(--ink)">Done</span>
          </label>
          <span class="chip" :class="statusClass(item.status)">
            <MaterialIcon
              :name="item.status === 'done' ? 'check_circle' : item.status === 'na' ? 'do_not_disturb_on' : 'radio_button_unchecked'"
              :size="14"
            />
            {{ statusLabel(item.status) }}
          </span>
          <button
            type="button"
            class="chip"
            :class="item.status === 'na' ? 'chip-neutral' : ''"
            @click="emit('toggle-na', item)"
          >
            <MaterialIcon name="do_not_disturb_on" :size="14" />
            {{ item.status === 'na' ? 'Clear N/A' : 'Mark N/A' }}
          </button>
        </div>
        <div class="row gap-2" style="flex-wrap: wrap">
          <button type="button" class="chip" @click="emit('open-log', item)">
            <MaterialIcon name="history" :size="14" />
            Log
          </button>
          <button type="button" class="chip" @click="emit('remove', item)">
            <MaterialIcon name="delete" :size="14" />
            Remove
          </button>
        </div>
      </div>

      <ChecklistNestedSubtasks
        v-if="getChildren(item).length"
        :items="getChildren(item)"
        :checklist-id="checklistId"
        :parent-depth="parentDepth + 1"
        :draft-titles="draftTitles"
        :status-class="statusClass"
        :status-label="statusLabel"
        @add-child="(...args) => emit('add-child', ...args)"
        @rename="(...args) => emit('rename', ...args)"
        @toggle-done="(...args) => emit('toggle-done', ...args)"
        @toggle-na="(...args) => emit('toggle-na', ...args)"
        @open-log="(...args) => emit('open-log', ...args)"
        @remove="(...args) => emit('remove', ...args)"
        @update-draft="(...args) => emit('update-draft', ...args)"
      />

      <div class="row gap-2 nested-subtask-add" style="flex-wrap: wrap">
        <input
          class="field grow"
          type="text"
          :value="getDraftValue(draftTitles, checklistId, item.id)"
          placeholder="Add subtask under this subtask"
          @input="emit('update-draft', getInputKey(checklistId, item.id), $event.target.value)"
          @keydown.enter.prevent="emit('add-child', item)"
        />
        <button type="button" class="chip" @click="emit('add-child', item)">
          <MaterialIcon name="subdirectory_arrow_right" :size="14" />
          Add subtask
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nested-subtask-list {
  margin-left: calc(18px + (var(--nested-depth, 1) - 1) * 12px);
  padding-left: 14px;
  border-left: 2px dashed var(--line);
}

.nested-subtask-row {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(180px, auto) minmax(130px, auto);
  gap: 12px;
  align-items: center;
}

.nested-subtask-add {
  margin-left: 18px;
}

@media (max-width: 900px) {
  .nested-subtask-row {
    grid-template-columns: 1fr;
  }
}
</style>
