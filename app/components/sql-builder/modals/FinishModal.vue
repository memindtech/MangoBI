<script setup lang="ts">
/**
 * SQL Builder — Finish / Save-to-API Modal
 * Triggered by store.showFinishModal = true from any component.
 * Loads column mapping via GeneratorSQL API, lets user rename columns,
 * then saves the SQL Builder record to the backend.
 */
import { storeToRefs } from 'pinia'
import { CloudUpload, CheckCircle2, Loader2, AlertCircle, X, Globe, Lock } from 'lucide-vue-next'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useMangoBIApi } from '~/composables/useMangoBIApi'

const store = useSqlBuilderStore()
const api   = useMangoBIApi()
const { $xt } = useNuxtApp() as any

// storeToRefs — the correct Pinia way to get reactive refs for watch
const { showFinishModal, savedName, savedId, savedIsPublic, generatedSQL, nodes, edges } = storeToRefs(store)

const finishName    = ref('')
const finishIsPublic = ref(false)
const finishSaving  = ref(false)
const finishError   = ref('')
const finishSuccess = ref(false)
const colMapLoading = ref(false)
const colMapError   = ref('')
const colMapRows    = ref<{ columnName: string; dataType: string; newName: string }[]>([])

function close() { store.closeFinishModal() }

// flush:'post' fires after DOM is updated so the modal backdrop is already visible
watch(showFinishModal, async (open) => {
  if (!open) return

  finishName.value     = savedName.value || ''
  finishIsPublic.value = savedIsPublic.value
  finishError.value   = ''
  finishSuccess.value = false
  colMapError.value   = ''
  colMapRows.value    = []
  colMapLoading.value = true

  const sql = generatedSQL.value?.trim()
  if (!sql || sql.startsWith('--')) {
    colMapError.value   = 'ไม่มีข้อมูล column — ตรวจสอบว่ามี Table บน Canvas'
    colMapLoading.value = false
    return
  }

  try {
    const res: any = await $xt.postServerJson('AnywhereAPI/SQLGenerator/GeneratorSQL', {
      SqlText: sql,
    })
    const cols: any[] = res?.data ?? res?.columns ?? []

    // Pre-fill newName from previously saved column mapping
    let savedMap: Record<string, string> = {}
    if (savedId.value) {
      try {
        const saved: any = await api.loadSQLBuilder(savedId.value)
        if (saved?.columnMapping) {
          const parsed: any[] = JSON.parse(saved.columnMapping)
          for (const e of parsed) savedMap[e.columnName] = e.newColumnName
        }
      } catch {}
    }

    colMapRows.value = cols.map((c: any) => {
      const col = c.ColumnName ?? c.columnName ?? c.column_name ?? c.Name ?? c.name ?? ''
      return {
        columnName: col,
        dataType:   c.DataType ?? c.dataType ?? c.ColumnType ?? c.columnType ?? c.data_type ?? c.type ?? '',
        newName:    savedMap[col] ?? c.Remark ?? c.remark ?? col,
      }
    })
  } catch (err: any) {
    colMapError.value = err?.message ?? 'โหลดข้อมูล column ไม่สำเร็จ'
  } finally {
    colMapLoading.value = false
  }
}, { flush: 'post' })

async function doSave() {
  if (!finishName.value.trim()) return
  finishSaving.value = true
  finishError.value  = ''
  try {
    const columnMapping = JSON.stringify(
      colMapRows.value.map(r => ({
        columnName:    r.columnName,
        dataType:      r.dataType,
        newColumnName: r.newName,
      }))
    )
    // Strip details arrays to reduce payload size (they can be re-fetched from API on load)
    const nodesSlim = nodes.value.map((n: any) => ({
      ...n,
      data: { ...n.data, details: undefined },
    }))

    const newId = await api.saveSQLBuilder({
      id:            savedId.value ?? undefined,
      name:          finishName.value.trim(),
      nodesJson:     JSON.stringify(nodesSlim),
      edgesJson:     JSON.stringify(edges.value),
      sqlText:       generatedSQL.value,
      columnMapping,
      isPublic:      finishIsPublic.value,
    })
    if (!newId) throw new Error('บันทึกไม่สำเร็จ')
    savedId.value        = newId
    savedName.value      = finishName.value.trim()
    savedIsPublic.value  = finishIsPublic.value
    finishSuccess.value = true
    setTimeout(() => {
      store.closeFinishModal()
      finishSuccess.value = false
    }, 1200)
  } catch (err: any) {
    finishError.value = err?.message ?? 'บันทึกไม่สำเร็จ'
  } finally {
    finishSaving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showFinishModal"
        class="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
        @click.self="close">
        <div class="bg-background border rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

          <!-- Header -->
          <div class="flex items-center gap-2 px-6 pt-6 pb-4 shrink-0">
            <CloudUpload class="size-5 text-emerald-500" />
            <h2 class="font-bold text-sm">บันทึก SQL Builder</h2>
            <button @click="close" class="ml-auto text-muted-foreground hover:text-foreground">
              <X class="size-4" />
            </button>
          </div>

          <!-- Success state -->
          <div v-if="finishSuccess" class="flex flex-col items-center gap-3 py-10 px-6">
            <CheckCircle2 class="size-10 text-emerald-500" />
            <p class="text-sm font-semibold text-emerald-600">บันทึกสำเร็จ</p>
          </div>

          <!-- Form -->
          <template v-else>
            <!-- Name -->
            <div class="px-6 pb-4 shrink-0">
              <label class="text-xs text-muted-foreground mb-1 block">ชื่อ</label>
              <input
                v-model="finishName"
                placeholder="ตั้งชื่อ SQL Builder…"
                class="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                autofocus
              />
            </div>

            <!-- Public toggle -->
            <div class="px-6 pb-4 shrink-0">
              <button
                type="button"
                @click="finishIsPublic = !finishIsPublic"
                :class="[
                  'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-colors',
                  finishIsPublic
                    ? 'bg-sky-500/10 border-sky-500/40 text-sky-600'
                    : 'bg-muted/30 border-border text-muted-foreground hover:bg-accent'
                ]"
              >
                <component :is="finishIsPublic ? Globe : Lock" class="size-4 shrink-0" />
                <div class="flex-1 text-left">
                  <p class="text-xs font-semibold">{{ finishIsPublic ? 'สาธารณะ' : 'ส่วนตัว' }}</p>
                  <p class="text-[10px] opacity-70">
                    {{ finishIsPublic ? 'ทุกคนในระบบมองเห็นและโหลดได้' : 'มองเห็นเฉพาะคุณเท่านั้น' }}
                  </p>
                </div>
                <!-- Toggle pill -->
                <div :class="['relative w-9 h-5 rounded-full transition-colors shrink-0', finishIsPublic ? 'bg-sky-500' : 'bg-muted-foreground/30']">
                  <div :class="['absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform', finishIsPublic ? 'translate-x-4' : 'translate-x-0.5']" />
                </div>
              </button>
            </div>

            <!-- Column Mapping -->
            <div class="px-6 pb-4 flex flex-col gap-2 min-h-0 flex-1">
              <div class="flex items-center justify-between shrink-0">
                <p class="text-xs font-semibold text-muted-foreground">ตรวจสอบ Column Names</p>
                <span v-if="colMapRows.length" class="text-[10px] text-emerald-600 font-mono">{{ colMapRows.length }} columns</span>
              </div>

              <div v-if="colMapLoading"
                class="flex items-center justify-center gap-2 py-6 text-muted-foreground text-xs border rounded-lg">
                <Loader2 class="size-4 animate-spin" /> กำลังโหลดข้อมูล column…
              </div>

              <div v-else-if="colMapError"
                class="flex items-center gap-2 py-3 px-3 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <AlertCircle class="size-3.5 shrink-0" /> {{ colMapError }}
              </div>

              <div v-else-if="!colMapRows.length"
                class="text-center py-6 text-[10px] text-muted-foreground/60 italic border border-dashed rounded-lg">
                ไม่มีข้อมูล column
              </div>

              <div v-else class="overflow-auto border rounded-lg flex-1">
                <table class="w-full text-[11px]">
                  <thead class="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr>
                      <th class="px-2.5 py-2 text-left font-semibold text-muted-foreground w-8">#</th>
                      <th class="px-2.5 py-2 text-left font-semibold text-muted-foreground">ColumnName</th>
                      <th class="px-2.5 py-2 text-left font-semibold text-muted-foreground w-24">DataType</th>
                      <th class="px-2.5 py-2 text-left font-semibold text-emerald-600">NewColumnName</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, i) in colMapRows" :key="row.columnName"
                      class="border-t hover:bg-accent/30 transition-colors"
                      :class="row.newName !== row.columnName ? 'bg-emerald-500/5' : ''">
                      <td class="px-2.5 py-1.5 text-muted-foreground/60 font-mono">{{ i + 1 }}</td>
                      <td class="px-2.5 py-1.5 font-mono text-foreground/80">{{ row.columnName }}</td>
                      <td class="px-2.5 py-1.5 text-muted-foreground/70">{{ row.dataType }}</td>
                      <td class="px-2.5 py-1.5">
                        <input
                          v-model="row.newName"
                          class="w-full text-[11px] font-mono border rounded px-2 py-0.5 bg-background
                                 focus:outline-none focus:ring-1 focus:ring-emerald-400
                                 placeholder:text-muted-foreground/40"
                          :class="row.newName !== row.columnName ? 'border-emerald-400/60 text-emerald-600' : ''"
                          :placeholder="row.columnName"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Footer -->
            <div class="px-6 pb-6 shrink-0">
              <p v-if="finishError" class="text-xs text-destructive mb-2">{{ finishError }}</p>
              <div class="flex gap-2 justify-end">
                <button @click="close"
                  class="text-xs px-3 py-1.5 border rounded-lg hover:bg-accent transition-colors">
                  ยกเลิก
                </button>
                <button @click="doSave"
                  :disabled="finishSaving || colMapLoading || !finishName.trim()"
                  class="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700
                         text-white rounded-lg font-semibold transition-colors disabled:opacity-50">
                  <Loader2 v-if="finishSaving" class="size-3.5 animate-spin" />
                  <CloudUpload v-else class="size-3.5" />
                  บันทึก
                </button>
              </div>
            </div>
          </template>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>
