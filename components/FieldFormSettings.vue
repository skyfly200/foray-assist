<template>
  <v-card class="fa-card" variant="flat">
    <v-card-text>
      <p class="text-body-2 text-medium-emphasis mb-3">
        Tap a field to show or hide it on each find and on the printed form, and add your own.
        Turning a field off keeps anything already written in it.
      </p>

      <div v-for="g in builtIn" :key="g.id" class="mb-2">
        <div class="text-caption font-weight-bold text-medium-emphasis">{{ g.emoji }} {{ g.title }}</div>
        <div class="d-flex flex-wrap ga-1 mt-1">
          <v-chip
            v-for="f in g.fields"
            :key="f.key"
            class="fa-pill"
            size="small"
            :color="hidden.has(f.key) ? undefined : 'primary'"
            :variant="hidden.has(f.key) ? 'outlined' : 'tonal'"
            :prepend-icon="hidden.has(f.key) ? 'mdi-eye-off-outline' : 'mdi-check'"
            :aria-pressed="!hidden.has(f.key)"
            @click="toggle(f.key)"
          >
            {{ f.label }}
          </v-chip>
        </div>
      </div>

      <div class="text-caption font-weight-bold text-medium-emphasis mt-4">✏️ Your fields</div>
      <div v-if="!config.custom.length" class="text-caption text-medium-emphasis">None yet.</div>
      <div v-for="c in config.custom" :key="c.key" class="d-flex align-center py-1">
        <div class="flex-grow-1">
          <div class="text-body-2">{{ c.label }}</div>
          <div v-if="c.options?.length" class="text-caption text-medium-emphasis">{{ c.options.join(', ') }}</div>
        </div>
        <v-btn size="small" variant="text" icon="mdi-delete" :aria-label="`Remove ${c.label}`" @click="remove(c.key)" />
      </div>

      <div class="d-flex flex-column ga-2 mt-2">
        <v-text-field v-model="label" label="New field name" placeholder="e.g. Taste, Latex color, Collector" density="comfortable" variant="outlined" hide-details="auto" :error-messages="labelError" @keydown.enter="add" />
        <v-text-field v-model="options" label="Quick picks (optional, comma separated)" placeholder="e.g. mild, bitter, acrid" density="comfortable" variant="outlined" hide-details @keydown.enter="add" />
        <div><v-btn color="primary" variant="tonal" prepend-icon="mdi-plus" :disabled="!label.trim()" @click="add">Add field</v-btn></div>
      </div>
      <div class="text-caption text-medium-emphasis mt-2">
        Voice notes fill your fields too: say the field name then the value ("taste mild"), or one of its quick picks.
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { FIELD_DEFS, FIELD_GROUPS, customFieldKey, parseOptions, type FieldKey } from '~/utils/fieldForm'

const { config, save } = useFormConfig()
const hidden = computed(() => new Set<string>(config.value.hidden))
const builtIn = FIELD_GROUPS.map((g) => ({ ...g, fields: g.keys.map((k) => FIELD_DEFS.find((f) => f.key === k)!) }))
const label = ref('')
const options = ref('')
const labelError = ref('')

function toggle(key: FieldKey) {
  const h = new Set(config.value.hidden)
  if (h.has(key)) h.delete(key)
  else h.add(key)
  void save({ hidden: [...h] })
}

function add() {
  const name = label.value.trim()
  if (!name) return
  const taken = [...FIELD_DEFS.map((f) => f.label), ...config.value.custom.map((c) => c.label)].map((l) => l.toLowerCase())
  if (taken.includes(name.toLowerCase())) { labelError.value = 'There is already a field with that name.'; return }
  labelError.value = ''
  const key = customFieldKey(name, config.value.custom.map((c) => c.key))
  const opts = parseOptions(options.value)
  void save({ custom: [...config.value.custom, { key, label: name, ...(opts.length ? { options: opts } : {}) }] })
  label.value = ''
  options.value = ''
}

function remove(key: string) {
  void save({ custom: config.value.custom.filter((c) => c.key !== key) })
}
</script>
