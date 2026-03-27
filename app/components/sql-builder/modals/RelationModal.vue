<script setup lang="ts">
import { X, Plus, Trash2, GitMerge, Link2, ChevronDown, Key } from 'lucide-vue-next'
import { JOIN_TYPES, JOIN_EDGE_COLORS, getEdgeStyle, getColTypeBadge } from '~/types/sql-builder'
import type { JoinType, EdgeMapping } from '~/types/sql-builder'
import { useSqlBuilderStore } from '~/stores/sql-builder'

const store = useSqlBuilderStore()

const edge       = computed(() => store.edges.find((e: any) => e.id === store.relationEdgeId) as any)
const sourceNode = computed(() => store.nodes.find((n: any) => n.id === edge.value?.source))
const targetNode = computed(() => store.nodes.find((n: any) => n.id === edge.value?.target))

const sourceDetails = computed(() =>
  (sourceNode.value?.data?.details ?? []) as Array<{ column_name: string; column_type: string; data_pk?: string; remark?: string }>
)
const targetDetails = computed(() =>
  (targetNode.value?.data?.details ?? []) as Array<{ column_name: string; column_type: string; data_pk?: string; remark?: string }>
)

const joinType = ref<JoinType>('LEFT JOIN')
const mappings = ref<EdgeMapping[]>([])
let mappingIdSeq = 0

watch(() => store.relationEdgeId, (id) => {
  if (!id) return
  const e = store.edges.find((e: any) => e.id === id) as any
  if (!e) return
  joinType.value = e.data?.joinType ?? 'LEFT JOIN'
  mappings.value = JSON.parse(JSON.stringify(e.data?.mappings ?? []))
  mappingIdSeq   = mappings.value.reduce((m: number, r: EdgeMapping) => Math.max(m, r._id), 0)
}, { immediate: true })

// SVG dash preview per join type
const JOIN_DASH: Record<JoinType, string> = {
  'INNER JOIN': '',
  'LEFT JOIN':  '6 3',
  'RIGHT JOIN': '6 3',
  'FULL JOIN':  '2 4 8 4',
  'CROSS JOIN': '4 4',
}

const JOIN_DESC: Record<JoinType, string> = {
  'INNER JOIN': 'เฉพาะแถวที่ตรงกันทั้งสองตาราง',
  'LEFT JOIN':  'ทุกแถวจากตารางซ้าย + แถวที่ตรงกันจากขวา',
  'RIGHT JOIN': 'ทุกแถวจากตารางขวา + แถวที่ตรงกันจากซ้าย',
  'FULL JOIN':  'ทุกแถวจากทั้งสองตาราง',
  'CROSS JOIN': 'ผลคูณคาร์ทีเชียนของสองตาราง',
}

function addMapping() {
  mappings.value.push({ _id: ++mappingIdSeq, source: '', target: '', operator: '=' })
}

function removeMapping(id: number) {
  mappings.value = mappings.value.filter(m => m._id !== id)
}

function save() {
  if (!store.relationEdgeId) return
  const style = getEdgeStyle(joinType.value)
  store.edges = store.edges.map((e: any) =>
    e.id === store.relationEdgeId
      ? { ...e, ...style, data: { ...e.data, joinType: joinType.value, mappings: mappings.value } }
      : e
  )
  store.relationEdgeId = null
}

function close() {
  store.relationEdgeId = null
}

function deleteEdge() {
  const id = store.relationEdgeId
  if (!id) return
  store.edges = store.edges.filter((e: any) => e.id !== id)
  store.relationEdgeId = null
}

// ── Custom column dropdown ────────────────────────────────────────────────
const openDrop = ref<{ mappingId: number; side: 'source' | 'target' } | null>(null)
const dropPos  = ref<{ top: number; left: number; width: number } | null>(null)

function toggleDrop(mappingId: number, side: 'source' | 'target', e: MouseEvent) {
  if (openDrop.value?.mappingId === mappingId && openDrop.value?.side === side) {
    openDrop.value = null; dropPos.value = null; return
  }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  dropPos.value = { top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 240) }
  openDrop.value = { mappingId, side }
}

function closeDrop() { openDrop.value = null; dropPos.value = null }

function selectCol(col: string) {
  if (!openDrop.value) return
  const m = mappings.value.find(m => m._id === openDrop.value!.mappingId)
  if (m) {
    if (openDrop.value.side === 'source') m.source = col
    else m.target = col
  }
  closeDrop()
}

const activeDetails = computed(() =>
  openDrop.value?.side === 'source' ? sourceDetails.value : targetDetails.value
)

function activeSelectedCol(mappingId: number, side: 'source' | 'target'): string {
  const m = mappings.value.find(m => m._id === mappingId)
  return side === 'source' ? m?.source ?? '' : m?.target ?? ''
}

function colDetail(details: typeof sourceDetails.value, colName: string) {
  return details.find(c => c.column_name === colName)
}
</script>

<template>
  <!-- Click-outside trap -->
  <Teleport to="body">
    <div v-if="openDrop !== null" class="fixed inset-0 z-[190]" @click="closeDrop" />
  </Teleport>

  <!-- Column dropdown -->
  <Teleport to="body">
    <div
      v-if="openDrop !== null && dropPos"
      class="fixed z-[200] bg-background border rounded-xl shadow-2xl overflow-hidden flex flex-col"
      :style="{ top: dropPos.top + 'px', left: dropPos.left + 'px', width: dropPos.width + 'px', maxHeight: '260px' }"
      @click.stop
    >
      <div class="overflow-y-auto flex-1">
        <button
          v-for="c in activeDetails" :key="c.column_name"
          @click="selectCol(c.column_name)"
          :class="[
            'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
            openDrop?.side === 'source' ? 'hover:bg-sky-500/8' : 'hover:bg-violet-500/8',
            activeSelectedCol(openDrop!.mappingId, openDrop!.side) === c.column_name
              ? (openDrop?.side === 'source' ? 'bg-sky-500/10' : 'bg-violet-500/10')
              : '',
          ]"
        >
          <Key v-if="c.data_pk === 'Y'" class="size-3 text-amber-400 shrink-0" />
          <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(c.column_type).cls]">
            {{ getColTypeBadge(c.column_type).label }}
          </span>
          <div class="flex-1 min-w-0 flex flex-col leading-none gap-0.5">
            <span class="font-mono text-[11px] truncate" :class="c.data_pk === 'Y' ? 'text-amber-400 font-semibold' : ''">
              {{ c.column_name }}
            </span>
            <span v-if="c.remark" class="text-[9px] text-muted-foreground/55 truncate">{{ c.remark }}</span>
          </div>
          <span class="text-[9px] text-muted-foreground/40 font-mono shrink-0">{{ c.column_type }}</span>
        </button>
        <div v-if="!activeDetails.length" class="px-3 py-2 text-[10px] text-muted-foreground italic">
          ไม่พบ columns
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="store.relationEdgeId"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="close"
      >
        <div class="bg-background border rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden flex flex-col max-h-[90vh]" @click.stop>

          <!-- Header -->
          <div class="flex items-center gap-3 px-5 py-4 border-b shrink-0"
            :style="{ backgroundColor: JOIN_EDGE_COLORS[joinType] + '10', borderBottomColor: JOIN_EDGE_COLORS[joinType] + '30' }">
            <div class="flex size-9 items-center justify-center rounded-xl border-2"
              :style="{ backgroundColor: JOIN_EDGE_COLORS[joinType] + '20', borderColor: JOIN_EDGE_COLORS[joinType] + '50' }">
              <GitMerge class="size-4.5" :style="{ color: JOIN_EDGE_COLORS[joinType] }" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold">ตั้งค่าความสัมพันธ์ JOIN</p>
              <p class="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                <span class="text-sky-500 font-semibold">{{ sourceNode?.data?.label ?? sourceNode?.id }}</span>
                <span class="mx-2 text-muted-foreground/40">→</span>
                <span class="text-violet-500 font-semibold">{{ targetNode?.data?.label ?? targetNode?.id }}</span>
              </p>
            </div>
            <button @click="close"
              class="size-7 flex items-center justify-center rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
              <X class="size-4" />
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

            <!-- JOIN type selector -->
            <div>
              <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">ประเภท JOIN</p>
              <div class="grid grid-cols-5 gap-2">
                <button
                  v-for="jt in JOIN_TYPES" :key="jt"
                  @click="joinType = jt"
                  class="flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer"
                  :style="joinType === jt
                    ? { borderColor: JOIN_EDGE_COLORS[jt], backgroundColor: JOIN_EDGE_COLORS[jt] + '15' }
                    : { borderColor: 'transparent', backgroundColor: 'hsl(var(--muted)/0.3)' }"
                >
                  <svg width="44" height="14" viewBox="0 0 44 14">
                    <line x1="2" y1="7" x2="36" y2="7"
                      :stroke="JOIN_EDGE_COLORS[jt]" stroke-width="2"
                      :stroke-dasharray="JOIN_DASH[jt] || undefined" stroke-linecap="round" />
                    <polygon points="33,4 42,7 33,10" :fill="JOIN_EDGE_COLORS[jt]" />
                  </svg>
                  <span class="text-[9px] font-bold leading-tight text-center"
                    :style="{ color: joinType === jt ? JOIN_EDGE_COLORS[jt] : 'hsl(var(--muted-foreground))' }">
                    {{ jt.replace(' JOIN', '') }}
                  </span>
                </button>
              </div>
              <div class="mt-2.5 px-3 py-2 rounded-lg text-xs text-center"
                :style="{ backgroundColor: JOIN_EDGE_COLORS[joinType] + '12', color: JOIN_EDGE_COLORS[joinType] }">
                <span class="font-semibold">{{ joinType }}</span>
                <span class="text-muted-foreground ml-2">— {{ JOIN_DESC[joinType] }}</span>
              </div>
            </div>

            <!-- Mappings / ON conditions -->
            <div>
              <div class="flex items-center justify-between mb-2.5">
                <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  เงื่อนไข ON
                  <span v-if="mappings.length"
                    class="ml-1.5 px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-500 text-[9px] font-bold">
                    {{ mappings.length }}
                  </span>
                </p>
                <button @click="addMapping"
                  class="flex items-center gap-1 text-xs font-semibold text-sky-500 hover:text-sky-400 transition-colors">
                  <Plus class="size-3" /> เพิ่มเงื่อนไข
                </button>
              </div>

              <div v-if="!mappings.length"
                class="text-xs text-muted-foreground/50 text-center py-5 border border-dashed rounded-xl bg-muted/10 italic">
                ยังไม่มีเงื่อนไข ON<br/>
                <span class="text-[10px]">คลิก "+ เพิ่มเงื่อนไข" เพื่อระบุ column ที่ใช้ join</span>
              </div>

              <div class="flex flex-col gap-2">
                <div
                  v-for="(m, i) in mappings" :key="m._id"
                  class="rounded-xl border bg-muted/10 p-3 flex flex-col gap-2"
                >
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] font-semibold text-muted-foreground">เงื่อนไขที่ {{ i + 1 }}</span>
                    <button @click="removeMapping(m._id)"
                      class="size-5 flex items-center justify-center rounded hover:text-destructive text-muted-foreground transition-colors">
                      <X class="size-3.5" />
                    </button>
                  </div>

                  <div class="flex items-end gap-2">
                    <!-- Source column picker -->
                    <div class="flex-1 min-w-0">
                      <p class="text-[9px] font-bold text-sky-500 mb-1 truncate">
                        {{ sourceNode?.data?.label ?? 'Source' }}
                      </p>
                      <button
                        @click="toggleDrop(m._id, 'source', $event)"
                        :class="[
                          'w-full flex items-center gap-2 text-xs border rounded-lg px-2 py-1.5 bg-background text-left transition-colors',
                          m.source ? 'border-sky-400/40' : 'border-border hover:border-sky-400/30',
                          openDrop?.mappingId === m._id && openDrop?.side === 'source' ? 'ring-2 ring-sky-400/40' : '',
                        ]"
                      >
                        <template v-if="m.source && colDetail(sourceDetails, m.source)">
                          <Key v-if="colDetail(sourceDetails, m.source)?.data_pk === 'Y'" class="size-3 text-amber-400 shrink-0" />
                          <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(colDetail(sourceDetails, m.source)?.column_type ?? '').cls]">
                            {{ getColTypeBadge(colDetail(sourceDetails, m.source)?.column_type ?? '').label }}
                          </span>
                          <div class="flex-1 min-w-0 flex flex-col leading-none gap-0.5">
                            <span class="font-mono text-[11px] truncate">{{ m.source }}</span>
                            <span v-if="colDetail(sourceDetails, m.source)?.remark" class="text-[9px] text-muted-foreground/55 truncate">
                              {{ colDetail(sourceDetails, m.source)?.remark }}
                            </span>
                          </div>
                        </template>
                        <span v-else class="text-muted-foreground text-[11px] flex-1">-- column --</span>
                        <ChevronDown :class="['size-3 shrink-0 text-muted-foreground transition-transform', openDrop?.mappingId === m._id && openDrop?.side === 'source' ? 'rotate-180' : '']" />
                      </button>
                    </div>

                    <!-- Operator -->
                    <div class="shrink-0">
                      <p class="text-[9px] font-bold text-muted-foreground mb-1 text-center">OP</p>
                      <select v-model="m.operator"
                        class="w-12 text-xs border rounded-lg px-1 py-1.5 bg-background text-center focus:outline-none focus:ring-1 focus:ring-sky-400">
                        <option value="=">=</option>
                        <option value="!=">!=</option>
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                      </select>
                    </div>

                    <!-- Target column picker -->
                    <div class="flex-1 min-w-0">
                      <p class="text-[9px] font-bold text-violet-500 mb-1 truncate">
                        {{ targetNode?.data?.label ?? 'Target' }}
                      </p>
                      <button
                        @click="toggleDrop(m._id, 'target', $event)"
                        :class="[
                          'w-full flex items-center gap-2 text-xs border rounded-lg px-2 py-1.5 bg-background text-left transition-colors',
                          m.target ? 'border-violet-400/40' : 'border-border hover:border-violet-400/30',
                          openDrop?.mappingId === m._id && openDrop?.side === 'target' ? 'ring-2 ring-violet-400/40' : '',
                        ]"
                      >
                        <template v-if="m.target && colDetail(targetDetails, m.target)">
                          <Key v-if="colDetail(targetDetails, m.target)?.data_pk === 'Y'" class="size-3 text-amber-400 shrink-0" />
                          <span :class="['text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0', getColTypeBadge(colDetail(targetDetails, m.target)?.column_type ?? '').cls]">
                            {{ getColTypeBadge(colDetail(targetDetails, m.target)?.column_type ?? '').label }}
                          </span>
                          <div class="flex-1 min-w-0 flex flex-col leading-none gap-0.5">
                            <span class="font-mono text-[11px] truncate">{{ m.target }}</span>
                            <span v-if="colDetail(targetDetails, m.target)?.remark" class="text-[9px] text-muted-foreground/55 truncate">
                              {{ colDetail(targetDetails, m.target)?.remark }}
                            </span>
                          </div>
                        </template>
                        <span v-else class="text-muted-foreground text-[11px] flex-1">-- column --</span>
                        <ChevronDown :class="['size-3 shrink-0 text-muted-foreground transition-transform', openDrop?.mappingId === m._id && openDrop?.side === 'target' ? 'rotate-180' : '']" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between gap-2 px-5 py-3.5 border-t bg-muted/10 shrink-0">
            <button @click="deleteEdge"
              class="text-xs px-3 py-2 border border-destructive/40 text-destructive hover:bg-destructive/10 rounded-lg transition-colors flex items-center gap-1.5 font-semibold">
              <Trash2 class="size-3.5" /> ลบเส้นเชื่อม
            </button>
            <div class="flex items-center gap-2">
              <button @click="close"
                class="text-xs px-4 py-2 border rounded-lg hover:bg-accent transition-colors">
                ยกเลิก
              </button>
              <button @click="save"
                class="text-xs px-5 py-2 rounded-lg font-semibold text-white transition-colors flex items-center gap-1.5"
                :style="{ backgroundColor: JOIN_EDGE_COLORS[joinType] }">
                <Link2 class="size-3.5" /> บันทึก {{ joinType }}
              </button>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>
