# MangoBI — Project Context for AI Agents

> เอกสารนี้ใช้ส่งต่อ context ให้ Agent ทำงานต่อได้ทันที ไม่ต้องสำรวจโปรเจกต์ใหม่

---

## 1. ภาพรวมระบบ (What is MangoBI)

**MangoBI** คือ Enterprise BI Dashboard Builder สำหรับ Mango ERP ประกอบด้วย 3 ส่วนหลัก:

| Module | หน้า | หน้าที่ |
|--------|------|---------|
| **SQL Builder** | `/sql-builder` | Drag-drop visual query builder สร้าง SQL แบบ CTE จากตาราง ERP |
| **Data Model** | `/datamodel` | จัดการ dataset + relations + transforms สำหรับ Report |
| **Report Builder** | `/report` | สร้าง Dashboard widgets (chart/table/kpi) จาก Data Model |
| **Report Viewer** | `/view/:id` | แสดง Report ให้ผู้ใช้ทั่วไป (shared link) |

**Flow หลัก:**
```
SQL Builder → บันทึก DataModel (NodesJson + SQL)
    ↓
Data Model Page → โหลด DataModel → execute SQL → แสดง/ปรับ data
    ↓
Report Builder → ใช้ dataset จาก DataModel → layout widgets
    ↓
Report Viewer → แสดงผล + AI Assist วิเคราะห์
```

---

## 2. Tech Stack

### Frontend (`d:\Resource Store\Frontend\MangoBI`)

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | **Nuxt 3** (CSR mode, ssr:false) | 4.2.2 |
| UI Framework | **Vue 3** + Composition API | 3.5.26 |
| Language | **TypeScript** | 5.9.3 |
| Styling | **Tailwind CSS v4** + shadcn-vue + Vuetify | — |
| Canvas/Flow | **Vue Flow** | 1.48.2 |
| Charts | **ECharts** | 6.0.0 |
| Data Grid | **AG Grid** (Enterprise) | 32.0.0 |
| State | **Pinia** | 3.0.4 |
| Auth | **Azure MSAL** | 4.27.0 |
| i18n | `@nuxtjs/i18n` — th, en, cn | 10.2.1 |
| Validation | vee-validate + zod | — |
| Utilities | @vueuse/core, decimal.js, moment | — |

**Key Directories:**
```
app/
├── components/     ai/, canvas/, datamodel/, dialogs/, report/, sql-builder/, ui/
├── composables/    datamodel/, report/, sql-builder/, view/, useAiChat.ts, useMangoBIApi.ts
├── pages/          datamodel.vue (196KB), report.vue (101KB), sql-builder.vue, view/[id].vue
├── stores/         ai-chat.ts, auth.ts, canvas.ts, datamodel.ts, report.ts, sql-builder.ts
└── utils/          columnMapping.ts, computedColumn.ts, formatValue.ts, transformData.ts
server/
├── api/
│   ├── ai/         chat, config, models
│   ├── auth/       login, logout, me, companies
│   ├── proxy/      bi/[...path].ts, main/[...path].ts, planning/[...path].ts
│   └── mango-schema/
└── utils/
```

**สิ่งสำคัญ:**
- ทุก API call ไปหลังบ้านผ่าน Nitro server-side proxy (`server/api/proxy/`)
- State กลางอยู่ที่ Pinia stores
- Business logic อยู่ใน composables (`use*.ts`)
- `$xt` (xtools) = plugin ที่ wrap `$fetch` + header auth ไว้ให้

### Backend (`D:\Resource Store\Backend\Backend-Planning-Service\MicroBackend`)

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | **ASP.NET Core 8** | .NET 8 |
| ORM | **Entity Framework Core** + Dapper | 8.0.13 |
| Database Primary | **SQL Server** (ผ่าน .mglc file) | — |
| Database Secondary | **MongoDB** (document storage) | 5+ |
| Auth | Mango Token (`X-Mango-Auth` header) | — |
| Storage | AWS S3 + Huawei OBS | — |
| Real-time | SignalR | — |
| Observability | OpenTelemetry + Jaeger | — |
| Export | EPPlus (Excel), iText7 (PDF) | — |

**API Base URL:** `http://localhost:8310/api/v1`

**Key Directories:**
```
Controllers/         21 controllers
Database/
├── DataContext/     DataContext.cs (210+ DbSet), DbContextExtensions.cs
└── DataModels/      70+ model files (External: AR, AP, HR, IC, WBS, ...)
Services/            Scheduler, NotificationSender, MetricsCollector
Modules/             Anywhere/, Print/, QCC/
Infrastructure/Sql/  SQL scripts by module (Plan/, Planning/, MangoBI/, Report/)
```

**MangoBI Tables:**
```sql
MangoBIReport     -- Id, Name, WidgetsJson, CreatedBy, maincode
MangoBIDataModel  -- Id, Name, NodesJson, RelationsJson, CreatedBy, maincode
MangoBISQLBuilder -- Id, Name, NodesJson, EdgesJson, SqlText, ColumnMapping, maincode
MangoBISchedule   -- Report scheduler (LINE/Email)
```

---

## 3. Current API Endpoints (MangoBI)

```
GET    /Planning/MangoBI/GetReports
GET    /Planning/MangoBI/GetReport?id=<id>
POST   /Planning/MangoBI/SaveReport
DELETE /Planning/MangoBI/DeleteReport

GET    /Planning/MangoBIDataModel/List
GET    /Planning/MangoBIDataModel/Get?id=<id>
POST   /Planning/MangoBIDataModel/Save
DELETE /Planning/MangoBIDataModel/Delete

GET    /Planning/MangoBI/GetSQLBuilders
GET    /Planning/MangoBI/GetSQLBuilder?id=<id>
POST   /Planning/MangoBI/SaveSQLBuilder
DELETE /Planning/MangoBI/DeleteSQLBuilder

GET    /Planning/Public/GetPublicReport?id=<id>  -- no auth
```

---

## 4. Auth Flow

```
User → Login (Anywhere) → token
    → ส่ง X-Mango-Auth: <token> ทุก request
    → AuthorizeMiddleware → verify → decrypt → controller
```

- Frontend เก็บ token ใน Pinia `authStore`
- Nitro proxy ต่อ token ให้ backend อัตโนมัติ
- `MANGO_CONNECTION` env var ชี้ไฟล์ `.mglc` ตัวเดียวกับ Anywhere ที่ออก token

---

## 5. งานที่กำลังทำอยู่ (Active Work — branch: AI-Assistant)

### ✅ เสร็จแล้ว
- **SQL Builder** — drag-drop, CTE generation, undo/redo, template save/load, ColumnMapping, AI-assisted SQL
- **Data Model** — canvas, relations, transforms, computed columns, AI context
- **Report Builder** — widgets (bar/line/pie/table/kpi/stacked), filters, send/share
- **Report Viewer** (`/view/:id`) — แสดงผล shared report + AI Analyst
- **AI Assist** — AiPanel, AiMessage, useAiChat, useAiModels, useAiActions (Claude/Gemini/backend)
- **Scheduler** — LINE/Email scheduled delivery (backend)
- **Diagnostics** — Admin page (`/mango-grove`)
- **Auth** — Azure MSAL + Mango Token + Company selection
- **Data Refresh** — re-execute SQL on load ใน DataModel + Report pages (ดู Section 6)

### ⚠️ ยังขาด / กำลังทำ
- **AI Raw Data Context** — `useAiContext.ts` ยังส่งแค่ aggregated totals → ต้องเพิ่ม raw rows summary
- Composable `view/useViewAiContext.ts` เพิ่งสร้าง (ยังไม่ได้ integrate กับ `/view/:id`)
- DataModel-exported datasets ใน Report ยังไม่ auto-refresh (ต้อง re-export จาก DataModel page)

---

## 6. Data Refresh + AI Raw Data

### หลักการสำคัญ: CONFIG กับ DATA แยกกัน

```
[DB เก็บ CONFIG เท่านั้น]              [ดึงจาก Mango ERP ทุกครั้งเปิดหน้า]
──────────────────────────────         ────────────────────────────────────
NodesJson / RelationsJson              SQL execute → rawRows (fresh)
TransformConfig (groupBy, agg)
ComputedColDefs (computed cols)
NumericFormats (decimal format)
WidgetsJson (field assignment)
FilterConfig (per widget)
```

**Transforms ทั้งหมดเป็น pure client-side functions อยู่แล้ว** (`transformData.ts`, `computedColumn.ts`)
→ ไม่ต้องแก้ logic transform เลย เพียงแค่เปลี่ยน source ของ rows

---

### Transform Pipeline (logic ไม่เปลี่ยน)

```
rawRows  ← SQL execute fresh ทุกครั้ง
  ↓
applyComputedColumns(rawRows, computedColDefs)
  → enrichedRows   ◄─── AI เข้าถึงชั้นนี้ (ข้อมูลดิบ + computed cols)
  ↓
applyTransform(enrichedRows, transformConfig)   ← groupBy, aggregations, date filters
  → transformedRows
  ↓
  ├── [DataModel page]  แสดงใน table preview ตรงๆ
  └── [Report page]     แต่ละ widget apply FilterConfig + fieldMapping → displayRows
```

---

### ✅ Implementation เสร็จแล้ว (2025-04-27)

**Backend:** ไม่ต้องสร้าง endpoint ใหม่ — ใช้ `POST /Planning/MangoBI/ExecuteCustomSql` ที่มีอยู่แล้ว
- รับ `{ sql: string }` → validate (SELECT/WITH only) → execute → return rows

**Frontend — files ที่เปลี่ยน:**

| File | การเปลี่ยนแปลง |
|------|----------------|
| `app/stores/datamodel.ts` | เพิ่ม `sqlText?` + `columnMapping?` ใน `ModelTable` |
| `app/stores/report.ts` | เพิ่ม `sqlText?` + `columnMapping?` ใน `ReportDataset`; เพิ่ม `updateDatasetRows()` |
| `app/composables/useMangoBIApi.ts` | เพิ่ม `executeQuery()` + `applyColumnMapping<T>()` helper |
| `app/pages/datamodel.vue` | `placeTableNode()` รับ sqlText; `doLoadDm()` + `appendDmTemplate()` re-execute SQL หลัง restore config |
| `app/pages/report.vue` | `doSaveRp()` บันทึก sqlText; `doLoadRp()` re-execute SQL หลัง restore |

**ขอบเขต Refresh:**

| แหล่งข้อมูล | Auto Refresh? |
|-------------|--------------|
| SQLBuilder template (saved) | ✅ |
| Raw SQL input | ✅ |
| SQL Template (passcode-based) | ❌ SQL อยู่ server-side |
| Mock data | ❌ ข้อมูลทดสอบ |
| DataModel export → Report | ✅ ผ่านการ re-load DataModel แล้ว re-export |

---

### ⏳ งานที่ยังเหลือ (AI Raw Data)

อัปเดต AI context composables ให้ส่ง raw data เพิ่มเติม:
- `app/composables/datamodel/useAiContext.ts` — เพิ่ม sample rows + column stats
- `app/composables/report/useAiContext.ts` — เพิ่ม raw dataset summary
- ปัจจุบัน `useViewAiContext.ts` ส่งเฉพาะ aggregated totals — ต้องเพิ่ม raw access สำหรับ AI ใน viewer ด้วย

---

## 7. Environment Variables

### Frontend (`.env`)
```env
NUXT_MANGO_BASE=http://<mango-server>/service/     # ERP backend (server-side only)
NUXT_PUBLIC_API_BASE=http://localhost:8310/api/v1  # Planning backend
NUXT_PUBLIC_PLANNING_BASE=http://localhost:8310/api/v1

# AI (optional)
NUXT_AI_ENABLED=true
NUXT_AI_PROVIDER=claude               # claude | gemini | backend
NUXT_CLAUDE_API_KEY=sk-ant-...
NUXT_AI_BACKEND_URL=https://backend-ai.mangoanywhere.com/api/chat
```

### Backend (`.env`)
```env
MANGO_CONNECTION=./KeyFile/your_db.mglc
Anywhere__BaseUrl=http://localhost/service/
```

---

## 8. Key Files Reference

| ไฟล์ | บทบาท |
|------|-------|
| `app/pages/datamodel.vue` | Data Model builder (196KB) — ใหญ่มาก |
| `app/pages/report.vue` | Report builder (101KB) |
| `app/pages/view/[id].vue` | Report viewer |
| `app/stores/datamodel.ts` | Pinia store: tables, relations, transforms |
| `app/stores/report.ts` | Pinia store: widgets, datasets |
| `app/stores/canvas.ts` | MOCK_DATA (ต้องแทนที่ด้วย real data) |
| `app/composables/useMangoBIApi.ts` | API calls: load/save DataModel, Report, SQLBuilder |
| `app/composables/datamodel/useAiContext.ts` | AI system prompt สำหรับ DataModel page |
| `app/composables/report/useAiContext.ts` | AI system prompt สำหรับ Report page |
| `app/composables/view/useViewAiContext.ts` | AI system prompt สำหรับ Viewer page |
| `app/components/ai/AiPanel.vue` | Chat UI component |
| `app/stores/ai-chat.ts` | Chat history + state |
| `server/api/proxy/planning/[...path].ts` | Proxy → Planning backend |
| `Database/DataContext/DataContext.cs` | EF Core DbContext (210+ tables) |

---

## 9. Coding Conventions

- **TypeScript ทุกที่** — ห้าม `any` ยกเว้น third-party
- **Composition API** + `<script setup>` เสมอ
- **Composables** สำหรับ business logic (`use*.ts`)
- **Pinia stores** สำหรับ shared state ข้ามหน้า
- **ไม่ใช้ comments อธิบาย WHAT** — ใช้ชื่อตัวแปรที่ชัดแทน
- **Tailwind + shadcn-vue** สำหรับ UI component ใหม่
- ภาษาใน UI: ดู i18n locales (`app/locales/th.json`, `en.json`, `cn.json`)
- **ไม่ใช้ MOCK_DATA ใน production flow**

---

## 10. Git & Branch

- Main branch: `main`
- Active branch: `AI-Assistant`
- Recent commits: Add AI Assist → update → sharing Data → SQL CTE fixes → Optimize
- User: memydog (mindtech.mchn@gmail.com)

---

## 11. Docker Deployment

รัน compose จาก frontend repo:
```bash
# d:\Resource Store\Frontend\MangoBI
docker compose up -d --build
```

| Service | Port |
|---------|------|
| Frontend (Nuxt) | 3000 |
| Backend (ASP.NET) | 8310 |

Backend Dockerfile: multi-stage (SDK → aspnet runtime), copies Infrastructure/ + UpdateDll/

---

## 12. สิ่งที่ Agent ต้องรู้ก่อนเริ่มงาน

1. **อ่าน Section 6** ก่อนทำงาน DataModel/Report pages
2. **Backend path:** `D:\Resource Store\Backend\Backend-Planning-Service\MicroBackend\`
3. **API proxy:** ทุก call จาก frontend ผ่าน `server/api/proxy/planning/[...path].ts` — ไม่ call backend โดยตรง
4. **Auth:** `$xt.getServer()` / `$xt.postServerJson()` จะแนบ header auth ให้อัตโนมัติ
5. **MOCK_DATA** ใน `stores/canvas.ts` เป็นแค่ placeholder — งาน real data จะมาแทน
6. **AI context** ใน composables เป็น string ที่ inject เป็น system prompt ให้ Claude/Gemini
