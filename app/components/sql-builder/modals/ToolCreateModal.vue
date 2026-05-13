<script setup lang="ts">
/**
 * SQL Builder — Tool Create Modal
 * Shows before adding a tool node to canvas.
 * User must click "สร้าง Node" to actually place the node.
 */
import { X, Layers, Calculator, Database, SortAsc, GitMerge, Filter, Braces } from 'lucide-vue-next'
import { useSqlBuilderStore } from '~/stores/sql-builder'
import { useDragDrop } from '~/composables/sql-builder/useDragDrop'

const { t } = useI18n()
const store   = useSqlBuilderStore()
const dragDrop = useDragDrop()

const TOOL_DEFS = computed((): Record<string, {
  icon: any; color: string; bg: string; border: string; btnCls: string; label: string; desc: string; detail: string
}> => ({
  cte: {
    icon: Layers, color: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/40',
    btnCls: 'bg-violet-500 hover:bg-violet-600',
    label: t('sqlbuilder_tool_create_cte_label'), desc: t('sqlbuilder_tool_create_cte_desc'),
    detail: t('sqlbuilder_tool_create_cte_detail'),
  },
  calc: {
    icon: Calculator, color: 'text-teal-500', bg: 'bg-teal-500/10', border: 'border-teal-500/40',
    btnCls: 'bg-teal-500 hover:bg-teal-600',
    label: t('sqlbuilder_tool_create_calc_label'), desc: t('sqlbuilder_tool_create_calc_desc'),
    detail: t('sqlbuilder_tool_create_calc_detail'),
  },
  group: {
    icon: Database, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/40',
    btnCls: 'bg-orange-500 hover:bg-orange-600',
    label: t('sqlbuilder_tool_create_group_label'), desc: t('sqlbuilder_tool_create_group_desc'),
    detail: t('sqlbuilder_tool_create_group_detail'),
  },
  sort: {
    icon: SortAsc, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/40',
    btnCls: 'bg-green-500 hover:bg-green-600',
    label: t('sqlbuilder_tool_create_sort_label'), desc: t('sqlbuilder_tool_create_sort_desc'),
    detail: t('sqlbuilder_tool_create_sort_detail'),
  },
  union: {
    icon: GitMerge, color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/40',
    btnCls: 'bg-yellow-500 hover:bg-yellow-600',
    label: t('sqlbuilder_tool_create_union_label'), desc: t('sqlbuilder_tool_create_union_desc'),
    detail: t('sqlbuilder_tool_create_union_detail'),
  },
  where: {
    icon: Filter, color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/40',
    btnCls: 'bg-rose-500 hover:bg-rose-600',
    label: t('sqlbuilder_tool_create_where_label'), desc: t('sqlbuilder_tool_create_where_desc'),
    detail: t('sqlbuilder_tool_create_where_detail'),
  },
  subquery: {
    icon: Braces, color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/40',
    btnCls: 'bg-indigo-500 hover:bg-indigo-600',
    label: t('sqlbuilder_tool_create_subquery_label'), desc: t('sqlbuilder_tool_create_subquery_desc'),
    detail: t('sqlbuilder_tool_create_subquery_detail'),
  },
}))

const tool = computed(() =>
  store.pendingToolId ? (TOOL_DEFS.value[store.pendingToolId] ?? null) : null
)

function confirm() {
  if (!store.pendingToolId || !store.pendingVp) return
  const { x, y, zoom } = store.pendingVp
  dragDrop.addToolNode(store.pendingToolId, x, y, zoom)
  store.pendingToolId = null
  store.pendingVp     = null
}

function cancel() {
  store.pendingToolId = null
  store.pendingVp     = null
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="tool"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="cancel"
      >
        <div
          class="bg-background rounded-2xl border shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
          @click.stop
        >
          <!-- Header -->
          <div :class="['flex items-center gap-3 px-5 py-4 border-b', tool.bg]">
            <div :class="['flex size-10 items-center justify-center rounded-xl border-2', tool.bg, tool.border]">
              <component :is="tool.icon" :class="['size-5', tool.color]" />
            </div>
            <div class="flex-1">
              <p :class="['font-bold text-base', tool.color]">{{ tool.label }}</p>
              <p class="text-xs text-muted-foreground">{{ tool.desc }}</p>
            </div>
            <button @click="cancel"
              class="size-7 flex items-center justify-center rounded-lg hover:bg-black/10 text-muted-foreground transition-colors">
              <X class="size-4" />
            </button>
          </div>

          <!-- Body -->
          <div class="px-5 py-5">
            <p class="text-sm text-muted-foreground leading-relaxed">{{ tool.detail }}</p>

            <div class="mt-4 p-3 rounded-xl bg-muted/30 border border-border/40 text-xs text-muted-foreground leading-relaxed">
              <span class="font-semibold text-foreground">{{ t('sqlbuilder_tool_create_how_label') }}</span>
              {{ t('sqlbuilder_tool_create_how_desc') }}
            </div>
          </div>

          <!-- Footer -->
          <div class="px-5 py-4 border-t flex items-center justify-end gap-2">
            <button @click="cancel"
              class="text-sm px-4 py-2 border rounded-lg hover:bg-accent transition-colors">
              {{ t('sqlbuilder_common_cancel') }}
            </button>
            <button @click="confirm"
              :class="['text-sm px-5 py-2 rounded-lg font-semibold text-white transition-colors', tool.btnCls]">
              {{ t('sqlbuilder_tool_create_btn') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
