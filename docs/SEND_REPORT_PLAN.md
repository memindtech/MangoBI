# Send Report — Implementation Plan

> สถานะปัจจุบัน: **Mockup** (UI เสร็จแล้ว, ยังไม่มี Backend integration)

---

## Concept

User สามารถเลือก Report ที่บันทึกไว้ กำหนดช่วงเวลา เขียนข้อความพร้อมแทรก `{Report}` (URL อัตโนมัติ) และส่งให้ผู้รับที่เลือกผ่าน LINE Notify หรือ Email

---

## Steps ที่ต้องทำต่อ

### Step 1 — Backend: Send API

**File:** `MicroBackend/Controllers/MangoBIController.cs`

เพิ่ม Endpoint:

```csharp
[HttpPost]
public async Task<ActionResult> SendReport([FromBody] SendReportRequest req)
{
    // 1. ดึง Report URL
    // 2. แทน {Report} ใน message
    // 3. ส่งผ่าน LINE / Email service
    // 4. บันทึก log
}

public class SendReportRequest
{
    public Guid         ReportId     { get; set; }
    public string       Channel      { get; set; } = "line"; // "line" | "email"
    public string       Message      { get; set; } = "";
    public List<string> RecipientIds { get; set; } = new();
    public DateTime?    DateFrom     { get; set; }
    public DateTime?    DateTo       { get; set; }
}
```

---

### Step 2 — Backend: Recipients API

**ต้องการ Endpoint สำหรับดึงรายชื่อผู้รับ** (พนักงาน/กลุ่ม):

```
GET /Planning/MangoBI/GetRecipients?channel=line
```

Response:
```json
{
  "data": [
    { "id": "U001", "name": "สมชาย ใจดี", "dept": "บัญชี", "lineId": "Uxxxxx", "email": "..." }
  ]
}
```

ดึงจาก ERP HR หรือ User Master table

---

### Step 3 — LINE Notify Integration

1. ลงทะเบียน LINE Notify Token สำหรับแต่ละ Group/User
2. สร้าง `LineNotifyService.cs`:
   ```csharp
   public async Task Send(string token, string message);
   ```
3. เก็บ Token ใน Database table `MangoBILineToken`

---

### Step 4 — Email Integration

1. Configure SMTP ใน `appsettings.json`
2. สร้าง `EmailService.cs` ด้วย `MimeKit` หรือ `MailKit`
3. HTML Email Template พร้อม Report URL

---

### Step 5 — Schedule / Recurring Send

เพิ่ม Schedule feature ให้ส่งอัตโนมัติตามช่วงเวลา:

**Database Table:** `MangoBISchedule`
```sql
CREATE TABLE MangoBISchedule (
    Id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ReportId    UNIQUEIDENTIFIER NOT NULL,
    Channel     NVARCHAR(20),
    Message     NVARCHAR(MAX),
    Recipients  NVARCHAR(MAX),  -- JSON array
    CronExpr    NVARCHAR(100),  -- e.g. "0 8 * * 1" = every Monday 8am
    NextRunAt   DATETIME,
    LastRunAt   DATETIME,
    IsActive    BIT DEFAULT 1,
    CreatedBy   NVARCHAR(100),
    CreatedAt   DATETIME DEFAULT GETDATE()
)
```

ใช้ **Hangfire** หรือ **Quartz.NET** สำหรับ Background Job

---

### Step 6 — Frontend: Recipients จาก API จริง

แทนที่ `mockRecipients` ใน `send-report.vue` ด้วย API call:

```ts
// ใน composables/useMangoBIApi.ts
async function getRecipients(channel: 'line' | 'email') {
  const res: any = await $xt.getServer(`${BASE}/GetRecipients?channel=${channel}`)
  return res?.data ?? []
}
```

---

### Step 7 — Frontend: Schedule UI

เพิ่ม Tab "ตั้งเวลาส่ง" ใน `send-report.vue`:
- Cron Expression builder (simple: Daily / Weekly / Monthly)
- Next run preview
- Active/Pause toggle
- History log ของการส่งที่ผ่านมา

---

## Priority

| Priority | Step | ขึ้นกับ |
|----------|------|--------|
| P0 | Step 1 — Send API | — |
| P0 | Step 2 — Recipients API | ERP HR data |
| P1 | Step 3 — LINE | LINE token |
| P1 | Step 4 — Email | SMTP config |
| P2 | Step 5 — Schedule | Hangfire setup |
| P2 | Step 6 — Frontend Recipients | Step 2 |
| P3 | Step 7 — Schedule UI | Step 5 |

---

## Files ที่ต้องแก้/สร้าง

| File | Action |
|------|--------|
| `MangoBIController.cs` | เพิ่ม `SendReport`, `GetRecipients` |
| `MangoBIDataModels/` | เพิ่ม `MangoBISchedule.cs`, `MangoBILineToken.cs` |
| `DataContext.cs` | เพิ่ม DbSet สำหรับ 2 tables ใหม่ |
| `Services/LineNotifyService.cs` | สร้างใหม่ |
| `Services/EmailService.cs` | สร้างใหม่ |
| `app/composables/useMangoBIApi.ts` | เพิ่ม `sendReport`, `getRecipients` |
| `app/pages/send-report.vue` | แทน mock ด้วย API จริง + เพิ่ม Schedule tab |
