<script setup lang="ts">
/**
 * SQL Builder — Group Select Modal
 * Shows related tables after dropping a node; user picks which to include.
 */
import { X, Layers, Link, CheckSquare, Square, ArrowRight } from 'lucide-vue-next'
import type { GroupRelation } from '~/types/sql-builder'
import { OBJECT_TYPE_LABELS, USE_TYPE_LABELS } from '~/types/sql-builder'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useDragDrop } from '~/composables/sql-builder/useDragDrop'

const store    = useSqlBuilderStore()
const dragDrop = useDragDrop()

const data = computed(() => store.groupModalData)

// Which tables are already on canvas (skip creation but show as info)
const onCanvasSet = computed(() => {
  if (!data.value) return new Set<string>()
  const tableNames = store.nodes
    .filter((n: any) => n.type === 'sqlTable')
    .map((n: any) => n.data?.tableName as string)
  return new Set(tableNames)
})

// checked set — all NEW (not on canvas) selected by default
const checked = ref<Set<number>>(new Set())

watch(data, (d) => {
  if (d) {
    checked.value = new Set(
      d.relations.map((r, i) => i).filter(i => !onCanvasSet.value.has(d.relations[i]!.relTable))
    )
  }
}, { immediate: true })

const selectedCount = computed(() => checked.value.size)

const newRelations = computed(() =>
  data.value ? data.value.relations.filter(r => !onCanvasSet.value.has(r.relTable)) : []
)

function toggleAll() {
  const newIndices = data.value!.relations
    .map((r, i) => i)
    .filter(i => !onCanvasSet.value.has(data.value!.relations[i]!.relTable))
  if (checked.value.size === newIndices.length) {
    checked.value = new Set()
  } else {
    checked.value = new Set(newIndices)
  }
}

function toggle(i: number) {
  if (onCanvasSet.value.has(data.value!.relations[i]!.relTable)) return
  const s = new Set(checked.value)
  s.has(i) ? s.delete(i) : s.add(i)
  checked.value = s
}

async function confirm() {
  if (!data.value) return
  const selected: GroupRelation[] = [...checked.value]
    .sort((a, b) => a - b)
    .map(i => data.value!.relations[i]!)
  await dragDrop.createGroupFromSelection(selected)
}

function skip() {
  store.groupModalData = null
}

// USE type badge colors
const USE_COLORS: Record<string, string> = {
  H: 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30',
  D: 'bg-sky-500/20 text-sky-600 border-sky-500/30',
  M: 'bg-violet-500/20 text-violet-600 border-violet-500/30',
  U: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
  V: 'bg-rose-500/20 text-rose-600 border-rose-500/30',
  O: 'bg-zinc-500/20 text-zinc-500 border-zinc-500/30',
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="data"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="skip"
      >
        <div
          class="bg-background border rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden"
          style="height: 75vh"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center gap-3 px-5 py-4 border-b bg-sky-500/5 shrink-0">
            <div class="flex size-9 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-500/25">
              <Layers class="size-4 text-sky-500" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold">ตารางที่เกี่ยวข้อง</p>
              <p class="text-[11px] text-muted-foreground mt-0.5 truncate">
                <span class="font-mono text-sky-500">{{ data.primaryTableName }}</span>
                <span class="mx-1.5 text-muted-foreground/40">·</span>
                พบ <strong class="text-foreground">{{ data.relations.length }}</strong> ตาราง
              </p>
            </div>
            <button @click="skip"
              class="size-7 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground transition-colors">
              <X class="size-4" />
            </button>
          </div>

          <!-- Primary table info -->
          <div class="px-5 py-2.5 border-b bg-muted/20 flex items-center gap-2 shrink-0">
            <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Primary:</span>
            <span class="text-xs font-mono font-semibold text-foreground">{{ data.primaryTableName }}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-500/15 text-emerald-600 border-emerald-500/30 font-bold">H</span>
            <span class="ml-auto text-[10px] text-muted-foreground truncate">{{ data.primaryLabel }}</span>
          </div>

          <!-- Select all row -->
          <div class="px-5 py-2 border-b flex items-center gap-2 shrink-0 bg-muted/10">
            <button @click="toggleAll" class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <component :is="checked.size > 0 && checked.size === newRelations.length ? CheckSquare : Square"
                class="size-3.5"
                :class="checked.size > 0 ? 'text-sky-500' : ''" />
              <span class="font-medium">เลือกทั้งหมด</span>
            </button>
            <span class="text-[10px] text-muted-foreground/60 ml-1">
              {{ selectedCount }} / {{ newRelations.length }} ตารางใหม่
            </span>
            <span v-if="data.relations.length - newRelations.length > 0"
              class="ml-auto text-[10px] text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              {{ data.relations.length - newRelations.length }} อยู่บน Canvas แล้ว
            </span>
          </div>

          <!-- Relation list -->
          <div class="flex-1 overflow-y-auto divide-y divide-border/40">

            <!-- Empty state (API returned no object_table) -->
            <div v-if="!data.relations.length" class="px-5 py-8 text-center flex flex-col items-center gap-2">
              <Layers class="size-8 text-muted-foreground/30" />
              <p class="text-sm font-medium text-muted-foreground">ไม่พบตารางที่เกี่ยวข้อง</p>
              <p class="text-xs text-muted-foreground/60">API ไม่ส่ง object_table สำหรับ object นี้</p>
            </div>

            <div
              v-for="(r, i) in data.relations" :key="i"
              @click="toggle(i)"
              :class="[
                'flex items-start gap-3 px-5 py-3 select-none transition-colors',
                onCanvasSet.has(r.relTable)
                  ? 'opacity-50 cursor-default bg-muted/10'
                  : checked.has(i)
                    ? 'cursor-pointer bg-sky-500/5 hover:bg-sky-500/8'
                    : 'cursor-pointer hover:bg-accent/50',
              ]"
            >
              <!-- Checkbox / on-canvas indicator -->
              <div class="mt-0.5 shrink-0">
                <div v-if="onCanvasSet.has(r.relTable)"
                  class="size-4 rounded border-2 border-emerald-500 bg-emerald-500/20 flex items-center justify-center">
                  <svg class="size-2.5 text-emerald-600" fill="none" viewBox="0 0 10 10">
                    <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                </div>
                <div v-else :class="[
                  'size-4 rounded border-2 flex items-center justify-center transition-all',
                  checked.has(i) ? 'bg-sky-500 border-sky-500' : 'border-border bg-background',
                ]">
                  <svg v-if="checked.has(i)" class="size-2.5 text-white" fill="none" viewBox="0 0 10 10">
                    <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                </div>
              </div>

              <!-- Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <!-- USE type badge (shows code + name from API) -->
                  <span v-if="r.rel.use_type"
                    :class="['text-[9px] px-1.5 py-0.5 rounded border font-bold shrink-0', USE_COLORS[r.rel.use_type] ?? 'bg-muted text-muted-foreground border-border']">
                    {{ r.rel.use_type }}
                    <span v-if="r.rel.use_type_name" class="font-normal opacity-80 ml-0.5">· {{ r.rel.use_type_name }}</span>
                  </span>
                  <!-- Object type badge -->
                  <span v-if="r.rel.object_type"
                    class="text-[9px] px-1.5 py-0.5 rounded border bg-muted/40 text-muted-foreground border-border font-mono shrink-0">
                    {{ r.rel.object_type }}
                  </span>
                </div>

                <!-- Table name -->
                <p class="text-xs font-mono font-semibold mt-1 truncate">{{ r.relTable }}</p>

                <!-- Remark / label (only if different from table name) -->
                <p v-if="r.label && r.label !== r.relTable" class="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {{ r.label }}
                </p>

                <!-- JOIN condition -->
                <div v-if="r.srcCol && r.tgtCol" class="flex items-center gap-1 mt-1">
                  <Link class="size-2.5 text-sky-400 shrink-0" />
                  <span class="text-[9px] font-mono text-sky-500">{{ r.srcCol }}</span>
                  <ArrowRight class="size-2.5 text-muted-foreground/40 shrink-0" />
                  <span class="text-[9px] font-mono text-violet-500">{{ r.tgtCol }}</span>
                </div>
                <p v-else class="text-[9px] text-muted-foreground/40 italic mt-0.5">
                  ไม่มีเงื่อนไข ON — ตั้งค่าได้หลังสร้าง
                </p>
              </div>

              <!-- Right side: on-canvas label OR USE type name -->
              <div class="shrink-0 mt-0.5 flex flex-col items-end gap-1">
                <span v-if="onCanvasSet.has(r.relTable)"
                  class="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 font-semibold whitespace-nowrap">
                  บน Canvas แล้ว
                </span>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between gap-2 px-5 py-3.5 border-t bg-muted/10 shrink-0">
            <button @click="skip"
              class="text-xs px-4 py-2 border rounded-lg hover:bg-accent transition-colors text-muted-foreground">
              ข้าม
            </button>
            <button
              @click="confirm"
              :disabled="selectedCount === 0"
              class="flex items-center gap-1.5 text-xs px-5 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white rounded-lg font-semibold transition-colors"
            >
              <Layers class="size-3.5" />
              สร้างกลุ่ม
              <span class="px-1.5 py-0.5 bg-white/20 rounded-md font-bold">{{ selectedCount }}</span>
              ตาราง
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
