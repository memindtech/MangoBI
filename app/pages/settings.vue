<script setup lang="ts">
import { Bot, Save, Eye, EyeOff, RefreshCw, Plus, Trash2, AlertCircle } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

const { $xt } = useNuxtApp() as any
const { refresh: refreshAiFeature } = useAiFeature()

const loading    = ref(true)
const saving     = ref(false)
const showKey    = ref(false)
const dbInitErr  = ref(false)

const enabled      = ref(false)
const provider     = ref('claude')
const model        = ref('')
const apiKey       = ref('')
const backendUrl   = ref('')
const backendModel = ref('')
const customModels = ref<string[]>([])
const newModelInput = ref('')
const hasExistingKey = ref(false)

const keyPlaceholder = computed(() =>
  hasExistingKey.value && !apiKey.value ? '●●●●●●●● (ตั้งค่าแล้ว — เว้นว่างเพื่อคงเดิม)' : ''
)

const providerOptions = [
  { value: 'claude',  label: 'Claude (Anthropic)' },
  { value: 'gemini',  label: 'Gemini (Google)' },
  { value: 'openai',  label: 'OpenAI Compatible (Typhoon, Groq, …)' },
  { value: 'backend', label: 'MangoBI AI Backend (Ollama)' },
]

const defaultModels: Record<string, string[]> = {
  claude:  ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-7'],
  gemini:  ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-2.5-pro'],
  openai:  [
    'typhoon-v2.1-12b-instruct',
    'typhoon-v2-70b-instruct',
    'typhoon-v2-r1-70b',
    'gpt-4o',
    'gpt-4o-mini',
  ],
  backend: [],
}

const providerUrls: Record<string, string> = {
  openai: 'https://api.opentyphoon.ai/v1',
}

const openAiPresets = [
  { label: 'ThaiLLM',     url: 'http://thaillm.or.th/api/v1',           models: ['typhoon-s-thaillm-8b-instruct'] },
  { label: 'Typhoon',     url: 'https://api.opentyphoon.ai/v1',          models: ['typhoon-v2.1-12b-instruct', 'typhoon-v2-70b-instruct', 'typhoon-v2-r1-70b'] },
  { label: 'Groq',        url: 'https://api.groq.com/openai/v1',         models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'] },
  { label: 'Together.ai', url: 'https://api.together.xyz/v1',            models: [] },
  { label: 'OpenAI',      url: 'https://api.openai.com/v1',              models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'] },
]

function applyPreset(preset: typeof openAiPresets[0]) {
  backendUrl.value = preset.url
  if (preset.models[0]) model.value = preset.models[0]
  preset.models.forEach(m => { if (!customModels.value.includes(m)) customModels.value.push(m) })
}

function onProviderChange(val: string) {
  provider.value = val
  apiKey.value   = ''
  model.value    = ''
  showKey.value  = false
  if (providerUrls[val] && !backendUrl.value)
    backendUrl.value = providerUrls[val]
}

function addModel() {
  const name = newModelInput.value.trim()
  if (!name || customModels.value.includes(name)) return
  customModels.value.push(name)
  newModelInput.value = ''
}

function addPreset(name: string) {
  if (!customModels.value.includes(name)) customModels.value.push(name)
  if (!model.value) model.value = name
}

function setDefaultModel(name: string) {
  model.value = name
}

function removeModel(name: string) {
  customModels.value = customModels.value.filter(m => m !== name)
}

async function tryInitDb(): Promise<boolean> {
  const res = await $xt.postServerJson('MangoBI/UpdateStructure', {}).catch(() => ({ error: 'exception' }))
  if (res?.error) return false
  dbInitErr.value = false
  return true
}

function applyData(d: Record<string, any>) {
  enabled.value        = Boolean(d.enabled)
  provider.value       = String(d.provider     ?? 'claude')
  model.value          = String(d.model        ?? '')
  backendUrl.value     = String(d.backendUrl   ?? '')
  backendModel.value   = String(d.backendModel ?? '')
  hasExistingKey.value = Boolean(d.hasApiKey)
  try { customModels.value = d.modelsJson ? JSON.parse(d.modelsJson) : [] } catch { customModels.value = [] }
  apiKey.value = ''
}

async function fetchConfig(): Promise<Record<string, any> | null> {
  const res = await $xt.getServer('MangoBI/GetAiConfig').catch(() => ({ error: 'exception' }))
  if (res?.error || !res?.data) return null
  return res.data
}

async function loadConfig() {
  loading.value   = true
  dbInitErr.value = false

  let d = await fetchConfig()

  if (d === null) {
    const ok = await tryInitDb()
    if (ok) d = await fetchConfig()
    if (d === null) { dbInitErr.value = true; loading.value = false; return }
  }

  applyData(d)
  loading.value = false
}

async function save() {
  saving.value = true
  try {
    const res = await $xt.postServerJson('MangoBI/SaveAiConfig', {
      enabled:      enabled.value,
      provider:     provider.value,
      model:        model.value        || null,
      apiKey:       apiKey.value       || null,
      backendUrl:   backendUrl.value   || null,
      backendModel: backendModel.value || null,
      modelsJson:   JSON.stringify(customModels.value),
    })
    if (res?.error) { toast.error(res.error); return }
    await $fetch('/api/ai/clear-config-cache', { method: 'POST' }).catch(() => {})
    refreshAiFeature()
    if (apiKey.value) hasExistingKey.value = true
    apiKey.value = ''
    toast.success('บันทึกการตั้งค่าเรียบร้อย')
  } catch (err: any) {
    toast.error(err?.message ?? 'บันทึกไม่สำเร็จ')
  } finally {
    saving.value = false
  }
}

onMounted(loadConfig)
</script>

<template>
  <div class="flex justify-center">
    <div class="w-full max-w-xl space-y-5 py-2">

      <!-- Header -->
      <div class="flex items-center gap-3">
        <Bot class="size-6 text-primary shrink-0" />
        <div>
          <h1 class="text-xl font-semibold">ตั้งค่า AI Assistant</h1>
          <p class="text-sm text-muted-foreground">กำหนด provider, model และ API key สำหรับ AI Assist ทั้งระบบ</p>
        </div>
      </div>

      <Separator />

      <!-- Skeleton -->
      <template v-if="loading">

        <!-- Card 1: toggle -->
        <Card>
          <CardContent class="pt-5 pb-5">
            <div class="flex items-center justify-between gap-4">
              <div class="space-y-2">
                <Skeleton class="h-4 w-44" />
                <Skeleton class="h-3 w-56" />
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <Skeleton class="h-5 w-10 rounded-full" />
                <Skeleton class="h-6 w-11 rounded-full" />
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Card 2: provider -->
        <Card>
          <CardHeader class="pb-3 pt-5">
            <Skeleton class="h-4 w-24" />
            <Skeleton class="h-3 w-40 mt-1" />
          </CardHeader>
          <CardContent class="pb-5">
            <Skeleton class="h-9 w-full rounded-md" />
          </CardContent>
        </Card>

        <!-- Card 3: settings fields -->
        <Card>
          <CardHeader class="pb-3 pt-5">
            <Skeleton class="h-4 w-32" />
          </CardHeader>
          <CardContent class="space-y-5 pb-5">
            <div class="space-y-1.5">
              <Skeleton class="h-3 w-24" />
              <Skeleton class="h-9 w-full rounded-md" />
            </div>
            <div class="space-y-1.5">
              <Skeleton class="h-3 w-16" />
              <Skeleton class="h-9 w-full rounded-md" />
              <Skeleton class="h-3 w-64" />
            </div>
            <div class="space-y-2">
              <Skeleton class="h-3 w-40" />
              <div class="flex gap-1.5">
                <Skeleton v-for="i in 3" :key="i" class="h-6 w-36 rounded" />
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Save button -->
        <div class="flex justify-end pb-4">
          <Skeleton class="h-9 w-24 rounded-md" />
        </div>

      </template>

      <template v-else>

        <!-- DB init error -->
        <div v-if="dbInitErr" class="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle class="size-4 mt-0.5 shrink-0" />
          <div>
            <p class="font-medium">ไม่สามารถเชื่อมต่อ database ได้</p>
            <p class="text-xs mt-1 opacity-80">กรุณาตรวจสอบการเชื่อมต่อ backend และลองโหลดหน้าใหม่</p>
          </div>
        </div>

        <!-- 1. Enable toggle -->
        <Card>
          <CardContent class="pt-5 pb-5">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="font-medium">เปิดใช้งาน AI Assistant</p>
                <p class="text-sm text-muted-foreground mt-0.5">เปิด/ปิด ฟีเจอร์ AI ทั้งระบบ</p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <Badge :variant="enabled ? 'default' : 'secondary'" class="text-xs">
                  {{ enabled ? 'เปิด' : 'ปิด' }}
                </Badge>
                <Switch v-model="enabled" />
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 2. Provider -->
        <Card>
          <CardHeader class="pb-3 pt-5">
            <CardTitle class="text-base">AI Provider</CardTitle>
            <CardDescription>เลือก provider ที่ต้องการใช้</CardDescription>
          </CardHeader>
          <CardContent class="pb-5">
            <Select :model-value="provider" @update:model-value="onProviderChange">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in providerOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <!-- 3a. Claude / Gemini settings -->
        <Card v-if="provider === 'claude' || provider === 'gemini'">
          <CardHeader class="pb-3 pt-5">
            <CardTitle class="text-base">{{ provider === 'claude' ? 'Claude' : 'Gemini' }} Settings</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4 pb-5">

            <!-- Default model -->
            <div class="space-y-1.5">
              <Label>Default Model</Label>
              <Input v-model="model" :placeholder="defaultModels[provider]?.[0] ?? ''" class="font-mono text-sm" />
            </div>

            <!-- API Key -->
            <div class="space-y-1.5">
              <Label>API Key</Label>
              <div class="relative">
                <Input
                  v-model="apiKey"
                  :type="showKey ? 'text' : 'password'"
                  :placeholder="keyPlaceholder || (provider === 'claude' ? 'sk-ant-...' : 'AIza...')"
                  class="font-mono text-sm pr-10"
                  autocomplete="off"
                />
                <button type="button" class="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground" @click="showKey = !showKey">
                  <Eye v-if="!showKey" class="size-4" />
                  <EyeOff v-else class="size-4" />
                </button>
              </div>
              <p class="text-xs text-muted-foreground">เว้นว่างเพื่อคง key เดิมไว้ — key จะไม่แสดงหลังบันทึก</p>
            </div>

            <!-- Models list -->
            <div class="space-y-2">
              <Label>Models ที่ใช้งานได้ใน Chat</Label>
              <p class="text-xs text-muted-foreground">เพิ่ม model ที่ต้องการให้ผู้ใช้เลือกได้ในหน้าแชท</p>

              <!-- Presets -->
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="m in defaultModels[provider]"
                  :key="m"
                  type="button"
                  :class="[
                    'text-xs px-2 py-0.5 rounded border transition-colors',
                    customModels.includes(m)
                      ? 'bg-primary/10 border-primary/40 text-primary cursor-default'
                      : 'border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary/60 hover:text-primary'
                  ]"
                  :disabled="customModels.includes(m)"
                  @click="addPreset(m)"
                >
                  {{ m }}
                </button>
              </div>

              <!-- Add custom -->
              <div class="flex gap-2">
                <Input v-model="newModelInput" placeholder="พิมพ์ชื่อ model แล้วกด +" class="font-mono text-sm h-8" @keydown.enter="addModel" />
                <Button size="sm" variant="outline" class="h-8 px-3 shrink-0" @click="addModel">
                  <Plus class="size-3.5" />
                </Button>
              </div>

              <!-- List -->
              <div v-if="customModels.length" class="space-y-1">
                <div
                  v-for="m in customModels"
                  :key="m"
                  class="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm font-mono cursor-pointer transition-colors select-none"
                  :class="model === m ? 'border-primary bg-primary/8 text-foreground' : 'bg-muted/30 hover:bg-muted/60'"
                  @click="setDefaultModel(m)"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <div class="size-3 rounded-full border-2 shrink-0 flex items-center justify-center" :class="model === m ? 'border-primary' : 'border-muted-foreground/40'">
                      <div v-if="model === m" class="size-1.5 rounded-full bg-primary" />
                    </div>
                    <span class="truncate">{{ m }}</span>
                  </div>
                  <button type="button" class="text-muted-foreground hover:text-destructive ml-2 shrink-0" @click.stop="removeModel(m)">
                    <Trash2 class="size-3.5" />
                  </button>
                </div>
              </div>
              <p v-else class="text-xs text-muted-foreground italic">ยังไม่มี model — กดปุ่มด้านบนเพื่อเพิ่ม</p>
            </div>
          </CardContent>
        </Card>

        <!-- 3b. OpenAI-compatible settings (Typhoon, Groq, etc.) -->
        <Card v-else-if="provider === 'openai'">
          <CardHeader class="pb-3 pt-5">
            <CardTitle class="text-base">OpenAI Compatible Settings</CardTitle>
            <CardDescription>รองรับ Typhoon, Groq, Together.ai, OpenAI โดยตรง และ API อื่นๆ ที่ใช้ OpenAI format</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4 pb-5">

            <!-- Base URL -->
            <div class="space-y-1.5">
              <Label>Base URL</Label>
              <!-- Quick presets -->
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="p in openAiPresets" :key="p.label" type="button"
                  :class="[
                    'text-xs px-2.5 py-1 rounded-md border font-medium transition-colors',
                    backendUrl === p.url
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-primary/60 hover:text-foreground'
                  ]"
                  @click="applyPreset(p)"
                >{{ p.label }}</button>
              </div>
              <Input v-model="backendUrl" placeholder="https://..." class="font-mono text-sm" />
              <p class="text-xs text-muted-foreground">กดปุ่มด้านบนเพื่อ auto-fill หรือพิมพ์ URL เอง</p>
            </div>

            <!-- API Key -->
            <div class="space-y-1.5">
              <Label>API Key</Label>
              <div class="relative">
                <Input
                  v-model="apiKey"
                  :type="showKey ? 'text' : 'password'"
                  :placeholder="keyPlaceholder || 'sk-...'"
                  class="font-mono text-sm pr-10"
                  autocomplete="off"
                />
                <button type="button" class="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground" @click="showKey = !showKey">
                  <Eye v-if="!showKey" class="size-4" />
                  <EyeOff v-else class="size-4" />
                </button>
              </div>
              <p class="text-xs text-muted-foreground">เว้นว่างเพื่อคง key เดิมไว้</p>
            </div>

            <!-- Default model -->
            <div class="space-y-2">
              <Label>Default Model</Label>
              <Input v-model="model" :placeholder="customModels[0] ?? 'typhoon-v2.1-12b-instruct'" class="font-mono text-sm" />

              <!-- Models from selected preset -->
              <div v-if="openAiPresets.find(p => p.url === backendUrl)?.models?.length" class="space-y-1.5">
                <p class="text-xs text-muted-foreground">Models จาก {{ openAiPresets.find(p => p.url === backendUrl)?.label }}</p>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="m in openAiPresets.find(p => p.url === backendUrl)?.models" :key="m" type="button"
                    :class="['text-xs px-2 py-0.5 rounded border transition-colors', customModels.includes(m) ? 'bg-primary/10 border-primary/40 text-primary cursor-default' : 'border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary/60 hover:text-primary']"
                    :disabled="customModels.includes(m)" @click="addPreset(m)"
                  >{{ m }}</button>
                </div>
              </div>

              <!-- Add custom -->
              <div class="flex gap-2 pt-1">
                <Input v-model="newModelInput" placeholder="พิมพ์ชื่อ model แล้วกด +" class="font-mono text-sm h-8" @keydown.enter="addModel" />
                <Button size="sm" variant="outline" class="h-8 px-3 shrink-0" @click="addModel">
                  <Plus class="size-3.5" />
                </Button>
              </div>
              <div v-if="customModels.length" class="space-y-1">
                <div
                  v-for="m in customModels" :key="m"
                  class="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm font-mono cursor-pointer transition-colors select-none"
                  :class="model === m ? 'border-primary bg-primary/8 text-foreground' : 'bg-muted/30 hover:bg-muted/60'"
                  @click="setDefaultModel(m)"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <div class="size-3 rounded-full border-2 shrink-0 flex items-center justify-center" :class="model === m ? 'border-primary' : 'border-muted-foreground/40'">
                      <div v-if="model === m" class="size-1.5 rounded-full bg-primary" />
                    </div>
                    <span class="truncate">{{ m }}</span>
                  </div>
                  <button type="button" class="text-muted-foreground hover:text-destructive ml-2 shrink-0" @click.stop="removeModel(m)">
                    <Trash2 class="size-3.5" />
                  </button>
                </div>
              </div>
            </div>

          </CardContent>
        </Card>

        <!-- 4. Backend settings (Ollama) -->
        <Card v-else>
          <CardHeader class="pb-3 pt-5">
            <CardTitle class="text-base">MangoBI AI Backend Settings</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4 pb-5">
            <div class="space-y-1.5">
              <Label>Backend URL</Label>
              <Input v-model="backendUrl" placeholder="https://backend-ai.mangoanywhere.com/api/chat" class="font-mono text-sm" />
            </div>
            <div class="space-y-1.5">
              <Label>Default Model</Label>
              <Input v-model="backendModel" placeholder="qwen3.5:9b" class="font-mono text-sm" />
            </div>

            <!-- Models list -->
            <div class="space-y-2">
              <Label>Custom Models</Label>
              <p class="text-xs text-muted-foreground">model ที่เพิ่มไว้จะรวมกับ model ที่ดึงจาก Ollama โดยอัตโนมัติ</p>
              <div class="flex gap-2">
                <Input v-model="newModelInput" placeholder="พิมพ์ชื่อ model เช่น qwen3.5:9b" class="font-mono text-sm h-8" @keydown.enter="addModel" />
                <Button size="sm" variant="outline" class="h-8 px-3 shrink-0" @click="addModel">
                  <Plus class="size-3.5" />
                </Button>
              </div>
              <div v-if="customModels.length" class="space-y-1">
                <div
                  v-for="m in customModels"
                  :key="m"
                  class="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm font-mono bg-muted/30"
                >
                  <span>{{ m }}</span>
                  <button type="button" class="text-muted-foreground hover:text-destructive ml-2 shrink-0" @click="removeModel(m)">
                    <Trash2 class="size-3.5" />
                  </button>
                </div>
              </div>
              <p v-else class="text-xs text-muted-foreground italic">ยังไม่มี custom model</p>
            </div>
          </CardContent>
        </Card>

        <!-- Save -->
        <div class="flex justify-end pb-4">
          <Button :disabled="saving || dbInitErr" @click="save">
            <RefreshCw v-if="saving" class="size-4 mr-2 animate-spin" />
            <Save v-else class="size-4 mr-2" />
            {{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}
          </Button>
        </div>

      </template>
    </div>
  </div>
</template>
