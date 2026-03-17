# Frontend Workflow — Planning Service

> **Base URL:** `http://<host>/api/v1/Planning/`
> **Auth Headers:** ต้องส่งทุก Request
> **Date:** 2026-03-17

---

## 1. การตั้งค่า Headers (Required Headers)

ทุก API Request ต้องส่ง Headers ดังนี้:

```javascript
const headers = {
  "X-Mango-Auth": "<user_token>",
  "X-Mango-Session-ID": "<session_id>",
  "Content-Type": "application/x-www-form-urlencoded"  // สำหรับ POST Form
  // หรือ "application/json" สำหรับ JSON body
};
```

---

## 2. User Flow หลักของระบบ

### 2.1 หน้าแรก — รายการ Planning

```
User เปิดแอป
      │
      ▼
[GET] /Planning/Planning/Planning_ReadList
      │
      ├── แสดงรายการ Planning ทั้งหมด
      │
      ├── User เลือก Project →
      │     [POST] /Planning/Planning/Planning_planviewall_ReadList
      │            body: { pre_event, plan_code }
      │
      └── User filter ตามวันที่ →
            [POST] /Planning/Plan/Planning_plan_viewall_date
                   body: { pre_event, plan_code, select_date }
```

### 2.2 สร้าง Plan ใหม่

```
User กดปุ่ม "สร้าง Plan"
      │
      ▼
Step 1: ตรวจสอบสิทธิ์
[GET] /Planning/Plan/VerifyCreatenewPlan?pre_event={pre_event}
      ├── Response: { can_create: true/false }
      └── หาก can_create == false → แสดง Error Message

      ▼
Step 2: โหลด Configuration
[GET] /Planning/Plan/ppn_config
      └── ใช้ Config แสดง Form ตาม Setting ของระบบ

      ▼
Step 3: กรอกข้อมูลและ Submit
[POST] /Planning/Planning/Planning_CreateAndUpdate
       body: {
         pre_event: string,
         plan_code: string,
         plan_name: string,
         start_date: "YYYY-MM-DD",
         end_date: "YYYY-MM-DD",
         ...
       }
      └── Response: { plan_code, status: "success" }
```

### 2.3 ดูรายละเอียด Plan

```
User คลิก Plan รายการ
      │
      ▼
โหลดข้อมูลพร้อมกัน (Parallel):

[POST] /Planning/Plan/Planning_plan_viewall
       body: { pre_event, plan_code }
       → ข้อมูล Plan ทั้งหมด

[POST] /Planning/Plan/Planning_plan_progress
       body: { pre_event, plan_code }
       → ข้อมูล Progress ปัจจุบัน

[POST] /Planning/Plan/Planning_work_tasks_summary
       body: { pre_event, plan_code }
       → สรุป Tasks

[POST] /Planning/Planning/Planning_task_detail
       body: { pre_event, plan_code }
       → รายละเอียด Tasks
```

### 2.4 หน้า Gantt Chart / Task Management

```
User เปิดหน้า Gantt
      │
      ▼
[POST] /Planning/Plan/onLoadPlanTasks
       body: { pre_event, plan_code }
       → โหลด Tasks สำหรับ Gantt

[GET]  /Planning/Plan/Planning_tasks?pre_event={pre_event}
       → Tasks ทั้งหมดของ Plan

[POST] /Planning/Planning/loadPlanningtask
       → Planning Tasks

User แก้ไข Task →
[POST] /Planning/Planning/Planning_CreateAndUpdate
       → อัพเดตข้อมูล

SignalR รับ Event "plan_updated" →
→ Refresh Gantt Chart โดยอัตโนมัติ
```

### 2.5 การดู Progress และ S-Curve

```
User เปิดหน้า Dashboard
      │
      ▼
[POST] /Planning/Planning/Planning_Progress_ReadList
       body: { pre_event, plan_code }
       → รายการ Progress ทั้งหมด

[GET]  /Planning/Plan/Planning_get_Progress
       → Progress ปัจจุบัน

[POST] /Planning/Planning/Planning_S_Curve
       body: { pre_event, plan_code }
       → ข้อมูลสำหรับ S-Curve Graph
       Format: { baseline: [], actual: [], dates: [] }

[GET]  /Planning/Planning/CalculateProject
       query: pre_event=..., end_date=...
       → คำนวณ % Progress โดยรวม
```

### 2.6 การ Upload ไฟล์/รูปภาพ

```
User เลือกไฟล์
      │
      ▼
[POST] /PlanningAttachfile/Upload
       Content-Type: multipart/form-data
       body: {
         file: <File Object>,
         pre_event: string,
         plan_code: string,
         ref_id: string
       }
       → Response: { file_url, file_name, file_id }

แสดงรูปภาพ:
[POST] /Planning/Plan/Planning_log_images
       → รายการรูปภาพ Log

[POST] /Planning/Planning/Planning_ReadImagePlanList
       → รายการรูปภาพของ Plan
```

### 2.7 การสร้างรายงาน (Export)

```
User กด Export PDF:
[POST] /PlanningReport/CreatePdf
       body: { pre_event, plan_code, ... }
       → Response: { pdf_url }
       → window.open(pdf_url)

User กด Export Excel:
[POST] /PlanningReport/ExportExcel
       → Response: File Stream (Blob)
       → สร้าง <a download> แล้ว Click

User ดู Summary:
[POST] /Planning/Planning/Planning_Summary_Material
       → สรุปวัสดุ

[POST] /Planning/Planning/Planning_Summary_worker
       → สรุปแรงงาน
```

---

## 3. SignalR Integration (Real-time)

```javascript
// เชื่อมต่อ SignalR Hub
import * as signalR from "@microsoft/signalr";

const connection = new signalR.HubConnectionBuilder()
  .withUrl("/planningHub", {
    headers: {
      "X-Mango-Auth": token,
      "X-Mango-Session-ID": sessionId
    }
  })
  .withAutomaticReconnect()
  .build();

// Start Connection
await connection.start();

// รับ Events
connection.on("plan_updated", (data) => {
  // Refresh Plan List หรือ Gantt Chart
  refreshPlanData(data.plan_code);
});

connection.on("progress_change", (data) => {
  // อัพเดต Progress Bar
  updateProgressBar(data.plan_code, data.progress);
});

connection.on("alert_trigger", (data) => {
  // แสดง Notification
  showNotification(data.message);
});
```

---

## 4. ตาราง API สรุป (Quick Reference)

### Planning Module

| Method | Endpoint | การใช้งาน |
|--------|----------|-----------|
| GET | `/Planning/Planning/Planning_ReadList` | รายการ Planning ทั้งหมด |
| POST | `/Planning/Planning/Planning_planviewall_ReadList` | รายการตาม filter |
| POST | `/Planning/Planning/Planning_CreateAndUpdate` | สร้าง/แก้ไข Plan |
| POST | `/Planning/Planning/Planning_Progress_ReadList` | รายการ Progress |
| POST | `/Planning/Planning/Planning_task_detail` | รายละเอียด Task |
| POST | `/Planning/Planning/Planning_S_Curve` | ข้อมูล S-Curve |
| POST | `/Planning/Planning/Planning_ReadList2` | รายการเพิ่มเติม |
| POST | `/Planning/Planning/loadPlanningtask` | โหลด Planning Task |
| POST | `/Planning/Planning/Planning_Summary_Material` | สรุปวัสดุ |
| POST | `/Planning/Planning/Planning_Summary_worker` | สรุปแรงงาน |
| GET | `/Planning/Planning/CalculateProject` | คำนวณ Project |
| POST | `/Planning/Planning/CalculateProject2` | คำนวณแบบละเอียด |
| POST | `/Planning/Planning/CalculateAlert` | คำนวณ Alert |
| GET | `/Planning/Planning/getDataFromPlan` | ดึงข้อมูลจาก Plan |

### Plan Module

| Method | Endpoint | การใช้งาน |
|--------|----------|-----------|
| GET | `/Planning/Plan/VerifyCreatenewPlan` | ตรวจสิทธิ์สร้าง Plan |
| GET | `/Planning/Plan/ppn_config` | ดึง Configuration |
| POST | `/Planning/Plan/Planning_plan_progress` | ดู Progress |
| POST | `/Planning/Plan/Planning_plan_viewall` | ดู Plan ทั้งหมด |
| POST | `/Planning/Plan/Planning_plan_viewall_date` | ดู Plan ตามวันที่ |
| POST | `/Planning/Plan/Planning_work_tasks_summary` | สรุป Tasks |
| POST | `/Planning/Plan/onLoadPlanTasks` | โหลด Plan Tasks |
| POST | `/Planning/Plan/onLoadProgressTasks` | โหลด Progress Tasks |
| GET | `/Planning/Plan/Planning_tasks` | Tasks ทั้งหมด |
| GET | `/Planning/Plan/Planning_tasks_revise` | Tasks ที่แก้ไข |
| GET | `/Planning/Plan/Planning_get_Progress` | Progress ปัจจุบัน |
| POST | `/Planning/Plan/Planning_log_images` | รายการ Log รูปภาพ |
| POST | `/Planning/Plan/Planning_pg_img` | รูปภาพ Pg |
| POST | `/Planning/Plan/Planning_pg_period` | ข้อมูล Period |
| POST | `/Planning/Plan/Planning_plan_overtime` | ข้อมูล Overtime |
| POST | `/Planning/Plan/getResourceStore` | ดึง Resource |
| POST | `/Planning/Plan/onUpdateSumProject` | อัพเดต Project Summary |
| POST | `/Planning/Plan/onUpdateSumPlans` | อัพเดต Plans Summary |

---

## 5. Request Body Format

### PlanRequestDto (form-data)
```
pre_event   : string  — รหัสโปรเจกต์
plan_code   : string  — รหัส Plan
select_date : string  — วันที่ (YYYY-MM-DD)
```

### PlanningCreateAndUpdateDto (form-data/json)
```
pre_event   : string  — รหัสโปรเจกต์
plan_code   : string  — รหัส Plan
plan_name   : string  — ชื่อ Plan
start_date  : string  — วันเริ่มต้น
end_date    : string  — วันสิ้นสุด
```

### CalulateRequestDto (form-data)
```
pre_event   : string  — รหัสโปรเจกต์
plan_code   : string  — รหัส Plan
end_date    : string  — วันที่คำนวณ
```

---

## 6. Error Handling ใน Frontend

```javascript
async function callApi(endpoint, method = "GET", body = null) {
  try {
    const response = await fetch(`/api/v1/Planning/${endpoint}`, {
      method,
      headers: {
        "X-Mango-Auth": getToken(),
        "X-Mango-Session-ID": getSessionId(),
        ...(body && { "Content-Type": "application/x-www-form-urlencoded" })
      },
      body: body ? new URLSearchParams(body) : null
    });

    if (response.status === 401) {
      // Token หมดอายุ → Redirect ไปหน้า Login
      redirectToLogin();
      return;
    }

    if (response.status === 403) {
      // ไม่มีสิทธิ์ → แสดง Permission Error
      showError("ไม่มีสิทธิ์เข้าถึง");
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();

  } catch (error) {
    console.error("API Error:", error);
    showError("เกิดข้อผิดพลาด กรุณาลองใหม่");
  }
}
```

---

## 7. Flow Diagram สรุป

```
┌─────────────────────────────────────────────────────┐
│                   Frontend App                       │
│                                                      │
│  Login → ได้รับ Token + Session ID                  │
│       │                                              │
│       ▼                                              │
│  [Home] Planning_ReadList                            │
│       │                                              │
│       ├──► [Create Plan]                             │
│       │         VerifyCreatenewPlan                  │
│       │         ppn_config                           │
│       │         Planning_CreateAndUpdate             │
│       │                                              │
│       ├──► [View Plan Detail]                        │
│       │         Planning_plan_viewall                │
│       │         Planning_plan_progress               │
│       │         Planning_task_detail                 │
│       │                                              │
│       ├──► [Gantt Chart]                             │
│       │         onLoadPlanTasks                      │
│       │         Planning_tasks                       │
│       │         SignalR ← Real-time update           │
│       │                                              │
│       ├──► [Dashboard / S-Curve]                     │
│       │         CalculateProject                     │
│       │         Planning_S_Curve                     │
│       │         Planning_Progress_ReadList           │
│       │                                              │
│       └──► [Export]                                  │
│                 CreatePdf → PDF URL                  │
│                 ExportExcel → File Download          │
└─────────────────────────────────────────────────────┘
```
