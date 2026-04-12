# MangoBI — Frontend

Nuxt 3 + Vue Flow dashboard builder สำหรับ Mango ERP

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Nuxt 3 (SSR/Nitro) |
| UI | Tailwind CSS + shadcn-vue |
| Canvas | Vue Flow |
| State | Pinia |
| Language | TypeScript |

---

## โครงสร้างโปรเจค

```
app/
├── pages/           # Nuxt pages (sql-builder, mango-grove, ...)
├── components/
│   └── sql-builder/ # SQL Builder components (nodes, modals, layout)
├── composables/
│   └── sql-builder/ # Business logic (useDragDrop, useHistory, ...)
├── stores/          # Pinia stores (sql-builder.ts)
├── types/           # TypeScript types (sql-builder.ts)
└── server/api/      # Nitro API routes (proxy to Mango)
```

---

## Environment Variables

สร้างไฟล์ `.env` ที่ root:

```env
# Mango Central API (server-to-server — Nitro เท่านั้น browser ไม่เห็น)
NUXT_MANGO_BASE=http://localhost/service/
NUXT_MANGO_SCHEMA_PASSCODE=MANGOCON

# Mango ของลูกค้า (browser เข้าถึงได้)
NUXT_PUBLIC_API_BASE=http://localhost/service/

# Planning Backend (browser → backend)
NUXT_PUBLIC_PLANNING_BASE=http://localhost:8310/api/v1/
```

---

## Development

```bash
npm install
npm run dev        # http://localhost:3000
```

---

## Production Build

```bash
npm run build
node .output/server/index.mjs
```

---

## Docker Deploy

### Frontend เดี่ยว

```bash
docker build -t mangobi-frontend .
docker run -p 3000:3000 \
  -e NUXT_MANGO_BASE=http://your-mango/service/ \
  -e NUXT_PUBLIC_API_BASE=http://your-mango/service/ \
  -e NUXT_PUBLIC_PLANNING_BASE=http://your-backend:8310/api/v1/ \
  mangobi-frontend
```

### Frontend + Backend (Unified)

```bash
# จาก root ของ frontend repo
docker compose up -d --build
```

`docker-compose.yml` รัน 2 services พร้อมกัน:

| Service | Container | Port |
|---------|-----------|------|
| Frontend (Nuxt) | `mangobi-frontend` | `3000` |
| Backend (ASP.NET Core) | `mangobi-backend` | `8310` |

ปรับ env vars ใน `docker-compose.yml` ก่อน deploy:

```yaml
environment:
  - NUXT_MANGO_BASE=http://<mango-url>/service/
  - NUXT_PUBLIC_API_BASE=http://<mango-url>/service/
  - NUXT_PUBLIC_PLANNING_BASE=http://localhost:8310/api/v1/
```

---

## Pages

| Path | คำอธิบาย |
|------|---------|
| `/sql-builder` | SQL Builder — drag & drop query builder |
| `/mango-grove` | Admin diagnostics (user: mango, itmango, chanchai) |
| `/view/:id` | Report viewer |

---

## SQL Builder Features

- **Table Browser** — ค้นหา ERP objects จาก left panel
- **Canvas** — drag & drop tables, auto JOIN detection
- **Tool Nodes** — GROUP BY, ORDER BY, Calculator, WHERE, UNION, CTE Frame
- **Layers Panel** — overview ของทุก node และ relation บน canvas
- **SQL Preview** — generate SQL แบบ real-time
- **Undo/Redo** — history สูงสุด 50 snapshots
- **Templates** — save/load canvas state
