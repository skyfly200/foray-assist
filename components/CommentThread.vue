<template>
  <div class="comments">
    <div v-if="tally.length" class="d-flex flex-wrap ga-2 mb-2">
      <v-chip
        v-for="t in tally"
        :key="t.taxon"
        size="small"
        color="primary"
        variant="tonal"
        prepend-icon="mdi-magnify"
        :title="canAgree ? `Agree with ${t.taxon}` : t.taxon"
        @click="canAgree && agree(t.taxon)"
      >
        <i>{{ t.taxon }}</i>&nbsp;· {{ t.votes }}
        <v-icon v-if="canAgree && !agreedWith.has(t.taxon)" icon="mdi-thumb-up-outline" size="14" class="ml-1" />
      </v-chip>
    </div>

    <div v-for="c in list" :key="c.id" class="comment">
      <div class="who">
        <b>{{ c.mine ? 'You' : c.authorName }}</b>
        <span class="kind">{{ c.kind === 'suggestion' ? 'suggests' : c.kind === 'agree' ? 'agrees' : '' }}</span>
        <i v-if="c.taxon">{{ c.taxon }}</i>
        <span class="when">{{ when(c.createdAt) }}</span>
        <v-icon v-if="c.mine && !c.syncedAt" icon="mdi-cloud-upload-outline" size="14" title="Waiting to sync" />
        <v-btn v-if="c.mine" icon="mdi-close" size="x-small" variant="text" aria-label="Delete comment" @click="deleteComment(c.id)" />
      </div>
      <div v-if="c.body" class="body">{{ c.body }}</div>
    </div>

    <div class="add mt-2">
      <v-btn-toggle v-model="mode" density="compact" variant="outlined" color="primary" rounded="xl" mandatory divided class="mb-2">
        <v-btn value="comment" size="small" prepend-icon="mdi-comment-outline">Comment</v-btn>
        <v-btn value="suggestion" size="small" prepend-icon="mdi-magnify">Suggest ID</v-btn>
      </v-btn-toggle>
      <v-text-field v-if="mode === 'suggestion'" v-model="taxon" label="Species or genus" density="compact" variant="outlined" hide-details class="mb-2" />
      <div class="d-flex ga-2">
        <v-text-field
          v-model="body"
          :label="mode === 'suggestion' ? 'Why (optional)' : 'Add a comment'"
          density="compact"
          variant="outlined"
          hide-details
          @keydown.enter="send"
        />
        <v-btn color="primary" icon="mdi-send" size="small" :disabled="!canSend" aria-label="Send" @click="send" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FindComment } from '~/utils/db'
import { summarizeSuggestions } from '~/utils/sharing'
import { addComment, deleteComment } from '~/composables/useSharedForay'
import { useLiveQuery } from '~/composables/useFinds'

const props = defineProps<{ forayId: string; specimenRowId: string; mineFind?: boolean }>()
const mode = ref<'comment' | 'suggestion'>('comment')
const body = ref('')
const taxon = ref('')

const list = useLiveQuery<FindComment[]>(
  async () => (await useDb().comments.where('specimenRowId').equals(props.specimenRowId).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  [],
)
const tally = computed(() => summarizeSuggestions(list.value))
const agreedWith = computed(() => new Set(list.value.filter((c) => c.mine && c.taxon).map((c) => c.taxon!)))
const canAgree = computed(() => true)
const canSend = computed(() => (mode.value === 'suggestion' ? !!taxon.value.trim() : !!body.value.trim()))

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })

async function send() {
  if (!canSend.value) return
  await addComment(props.forayId, props.specimenRowId, mode.value, body.value, mode.value === 'suggestion' ? taxon.value : undefined)
  body.value = ''
  taxon.value = ''
  mode.value = 'comment'
}

async function agree(t: string) {
  if (agreedWith.value.has(t)) return
  await addComment(props.forayId, props.specimenRowId, 'agree', '', t)
}
</script>

<style scoped>
.comment { padding: 6px 0; border-bottom: 1px solid rgba(var(--v-border-color), 0.08); }
.who { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 0.85rem; }
.kind { opacity: 0.7; }
.when { opacity: 0.55; font-size: 0.75rem; margin-left: auto; }
.body { font-size: 0.9rem; white-space: pre-wrap; word-break: break-word; }
</style>
