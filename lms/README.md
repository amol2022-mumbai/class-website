# VUMCA hITECH LMS

Learning Management System for the Computer Science class. Node.js + Express + SQLite.

## Requirements

- **Node.js 22.13 or newer** (Node 22.13+, 23.4+, or any Node 24+)
- No database server needed — SQLite is built into Node.js via the `node:sqlite` module.

## Why no native compilation?

The database layer uses `node:sqlite` (`DatabaseSync`), which ships **inside Node.js itself**.
There are **zero native npm dependencies** (deps are `express`, `express-session`, `bcryptjs` —
all pure JavaScript). This means `npm install` never runs `node-gyp` / compilation, so the app
runs on standard shared hosting such as **Hostinger** without any build tools.

> Note: `node:sqlite` is built-in starting Node 22.13. On Node 22.5–22.12 it requires the
> `--experimental-sqlite` flag, so pick Node 22.13+ (or Node 24) in your hosting panel.

## Run locally

```bash
npm install
npm start
```

The app listens on `http://localhost:3001` (override with the `PORT` env var).
The SQLite file is created automatically at `data/lms.db` and seeded on first run.

## Demo credentials

| Role    | Username | Password    |
|---------|----------|-------------|
| Admin   | admin    | admin123    |
| Student | STU001   | student123  |
| Faculty | FAC001   | faculty123  |
| Parent  | PAR001   | parent123   |

Additional demo accounts: students STU002–STU007 (password `student123` /
`pass007`), faculty FAC002–FAC003, parents PAR002–PAR006.

## Features

- **Login** — separate admin / student / faculty / parent portals with session auth
- **Admin console** — dashboard stats, manage students (mobile, fee amount & paid
  status), courses, enrollments, assignments (submission grading), quizzes (builder +
  auto-grading), daily attendance, batches & timetables, faculty members, staff
  management (roles, salaries, payroll report), parent accounts, exams & result entry
  (plus an online question-paper builder), payments & receipts with **GST tax
  invoices**, expense tracking, SMS/WhatsApp reminders, and a report builder (CSV
  export)
- **Enquiry & lead management** — capture walk-in/website/referral leads with the
  course of interest and source; a status funnel (New → Contacted → Follow-up →
  Enrolled → Lost) with follow-up dates and one-click status changes; leads feed a
  dedicated report and the dashboard shows open-enquiry counts
- **Staff attendance & payroll** — mark daily attendance per staff member
  (present / half-day / absent / leave), then auto-generate monthly payslips: monthly
  salaries are prorated per working day, daily-paid staff are paid per present day,
  and each slip prints on A4; a payroll report aggregates gross pay by month
- **Discounts & concessions** — per-student concession as a percentage or fixed
  amount. It lowers the net fee, shows as a badge in student records, is waived on
  GST invoices, and is broken out in the fee collection report
- **Installment plans & due dates** — set 1–12 installments per student; the app
  builds a due-date schedule, auto-marks installments paid as payments arrive
  (oldest due first), flags overdue installments, and shows the next due date in
  student/parent portals and reminders
- **Multi-branch support** — create multiple branches/centers with their own GSTIN
  and GST rate; a branch switcher in the admin top bar filters students, courses,
  batches, faculty, staff, exams, payments, expenses and reports to the active branch
- **GST tax invoices** — any recorded payment can be printed as an A4 tax invoice
  with the branch GSTIN, HSN, taxable value and CGST/SGST split at the branch's GST
  rate; concessions applied to the student are shown as waived on the invoice
- **Income & expense reports** — monthly income (fees collected) vs expenses with net
  income, plus dedicated staff, expense, payroll and enquiry reports, all scoped to
  the active branch
- **AI quiz generation** — generate multiple-choice quiz questions from a topic
  using an OpenAI-compatible LLM API
- **Online exams** — admins build a timed MCQ question paper per exam; students take
  it in-app with a countdown timer, it auto-grades, and the result appears in the
  student/parent portals and exam reports
- **Online fee payment (Razorpay)** — students and parents pay pending fees with
  UPI/cards via Razorpay; the app records the receipt and sends it by WhatsApp
- **Student portal** — view courses, weekly timetable, submit assignments, take
  quizzes with instant scores, exams & results, attendance log, grades, fees &
  payment history (with online payment), and certificates
- **Faculty portal** — assigned courses, weekly timetable, student roster, daily
  attendance marking, and assignment grading
- **Parent portal** — per-child overview, attendance, fees & payment history, and
  exam results, report cards and notices
- **Auto fee reminders** — a built-in daily scheduler (default 9 AM, configurable via
  `AUTO_REMINDER_HOUR`) collects every due/overdue installment and messages the
  student's mobile with the exact pending amount and next due date. Throttled to at
  most one message per installment per day; a Reminder Log records every send and
  the admin tab can run the sweep on demand ("RUN NOW")
- **Enquiry → student conversion** — one click turns a lead into a student: it
  creates a login, enrols them in the course of interest, and marks the enquiry
  Enrolled
- **Report cards** — generate a printable A4 report card per student (exam-wise
  scores, attendance, assignment submission, per-course grade and an overall grade)
  from the admin console or the student/parent portals; also available as a
  "Report Cards" builder report for the whole batch
- **Student ID cards** — printable A4 student identity cards with photo placeholder,
  branch address, enrolled course codes and validity date; generated individually
  in the admin console and viewable in the student portal
- **Notices & announcements** — admins publish dated notices (with optional expiry)
  per branch; current, unexpired notices appear in the student and parent portals
- **Online admission form** — a public page (`admission.html`, linked from the login
  screen) lets prospective students submit name/phone/course; submissions land in
  the Enquiries funnel with source "Website"
- **Backup & restore** — one-click download of the full SQLite database, and a
  restore-from-file that validates the upload, snapshots the current database first,
  and swaps it live without restarting
- **Dashboard charts** — the admin dashboard now renders lightweight inline charts:
  revenue by month, fee status (cleared/pending/overdue), the enquiry funnel and top
  courses by enrollment
- **Vendors & GST input credit** — maintain vendor master (with GSTIN) and record
  purchases; each bill's input CGST/SGST credit is computed and netted against
  output GST in a GST summary (admin tab + report) showing net payable per month
- **Asset tracking** — register institute assets (category, tag no, cost, purchase
  date, status) with total-value summary; also available as an Assets report

## AI quiz generation (optional)

In the quiz builder, use "⚡ Generate with AI" to auto-create questions. The app
calls an OpenAI-compatible chat API using **your own** credentials, provided via
environment variables (never bundled or read from the platform). Copy `.env.example`
to `.env` (or set variables in your hosting panel):

```env
USER_LLM_API_KEY=your-api-key-here
USER_LLM_BASE_URL=https://api.deepseek.com/v1   # any OpenAI-compatible endpoint
USER_LLM_MODEL=deepseek-chat
```

Works with DeepSeek, OpenAI, Groq, and other OpenAI-compatible providers. Without
a key, the button shows "NOT CONFIGURED" and returns a clear message.

## SMS / WhatsApp reminders (optional)

The Reminders tab lets you send fee and class reminders to students' mobile numbers
via SMS or WhatsApp. Set **your own** Twilio-compatible credentials in `.env`
(or in the hosting panel). Without them, reminders are logged as *simulated* so
you can still see and test the workflow:

```env
SMS_TWILIO_ACCOUNT_SID=your_account_sid
SMS_TWILIO_AUTH_TOKEN=your_auth_token
SMS_TWILIO_FROM=+15551234567
```

**WhatsApp delivery notes**

- Student mobiles may be stored like `+91 98765 43210`; the app automatically
  normalises them to strict E.164 (`+919876543210`) before sending, so a valid
  Indian mobile with or without spaces/country code works.
- WhatsApp messages go to `whatsapp:+91…`. The recipient must have WhatsApp on
  that number, and your `SMS_TWILIO_FROM` sender must be **WhatsApp-enabled** in
  the Twilio console (Messaging → Senders) or the API returns an error and the
  reminder shows as `failed` in the log.
- Ten-digit Indian numbers are assumed to be `+91` prefixed automatically.

## Auto fee reminders (scheduler)

The **Auto Fee Reminders** admin tab runs an automatic daily sweep. Every day at
`AUTO_REMINDER_HOUR` (default 9 AM) it:

1. finds all installments that are due or overdue and not yet fully paid,
2. builds a personalised WhatsApp message (installment name, amount due, total
   pending, next due date, days overdue),
3. sends it via the same Twilio gateway above, and records it in the reminder log.

It is throttled so each installment is messaged at most once per day, and uses the
live Twilio gateway when configured (otherwise simulated). Use the tab's **RUN NOW**
button to trigger a sweep immediately while testing.

```env
AUTO_REMINDER_HOUR=9   # optional, default 9
```

## Backup & restore

The **Backup & Restore** admin tab downloads the full SQLite database (a single
`.db` file — students, fees, payments, everything). Restore accepts one of those
files: the app validates it, snapshots your current database first, and swaps it in
live — the server keeps running and nothing needs a restart. If the upload is
invalid, the current data is untouched.

## Online admission form

Open `/admission.html` (or the "Apply Online" link on the login page). Prospects
submit name, phone, email and course of interest. The submission appears in the
admin **Enquiries** tab with source `Website` and status `New` — from where you can
follow up and, with one click, **convert** them into a student.

## Online fee payments (Razorpay, optional)

The Fees tab in the student and parent portals shows a **Pay Online** button when
Razorpay is configured and the student has pending dues. Add your own keys to `.env`
(or the hosting panel). Use test keys (`rzp_test_*`) while testing:

```env
USER_RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
USER_RAZORPAY_KEY_SECRET=your_key_secret
```

- Creates a Razorpay order for the exact pending amount (INR), opens the Razorpay
  checkout (UPI / cards / netbanking), verifies the payment signature on the server,
  records it in Payments with a receipt number, marks the fee paid when cleared, and
  sends a WhatsApp receipt to the student's mobile.
- Razorpay **webhooks are not required** — verification uses the checkout signature.
- To accept real money, set the **payment capture** and live keys, and add the
  domain under Razorpay → Settings → Website & App.

## Deploying on Hostinger (shared Node.js hosting)

1. Upload the project files (the `lms/` folder) to your hosting directory.
   Exclude `node_modules/` and `data/` — they regenerate on the server.
2. In the hosting control panel, create a **Node.js app** pointing at this folder.
3. Set the **Node.js version to 22.13+** (e.g. Node 24 LTS) — this is required for
   the built-in SQLite module.
4. Set the **application root** to the project folder and the **entry file** to
   `server/index.js`.
5. Run `npm install` (from the panel's terminal, or it runs on app start).
6. Add a `.env` if needed: `PORT=3001` (or use the panel's assigned port).
7. Start the app. No build step, no compilation, no external database required.

## Project structure

```
lms/
  package.json
  server/
    index.js   # Express app + REST API routes
    db.js      # node:sqlite database layer (schema + seed)
    ai.js      # optional AI quiz generation (env-configured)
    notify.js  # optional SMS/WhatsApp reminders (env-configured)
    reports.js # report builders for the admin Reports tab
    razorpay.js # optional Razorpay order/signature verification (env-configured)
  public/
    index.html        # landing page
    login.html        # login portal
    admin.html        # admin console
    student.html      # student portal
    faculty.html      # faculty portal
    parent.html       # parent portal
    css/style.css
    js/               # common.js, admin.js, student.js, faculty.js, parent.js
```
