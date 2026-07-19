# 🥈 2nd Place Winner - Cursor Berlin Hackathon 2026

I co-developed this agentic voice-routing platform during the intense 2026 Cursor Hackathon in Berlin, securing 2nd place overall. 

### My Role & Contributions:
* **System Architecture & Data Modeling**: Structured the core operational data schema used by the SQLite pipeline to log live medical and physical equipment requests.
* **API Configuration & Account Infrastructure**: Managed backend environment syncs, provisioned Vapi endpoints, and coordinated system settings under intense time constraints.
* **Product Strategy & Prompt Design**: Designed the operational voice logic to cleanly differentiate between urgency triggers (e.g., triage vs. routine routing).


# Hospital System — Voice + Agent Ops Backend

Hackathon backend: **spoken hospital requests** → **Cursor SDK agent orchestration** → **staff notify + accept/decline** → **dashboard**.

API base: `http://localhost:3001`  
Voice demo page: `http://localhost:3001/demo`  
Frontend contract: [`API.md`](./API.md) · Vapi setup: [`VAPI-SETUP.md`](./VAPI-SETUP.md)

---

## Winning demo (≈3 minutes)

**Story:** A doctor is busy. They speak one request. Agents handle the rest. Staff act. Dashboard proves it.

### Setup (2 screens)
1. **Ops dashboard** — `http://localhost:3001/dashboard` (polls requests live)
2. **Doctor voice** — `http://localhost:3001/demo` (Vapi mic)
### Script
1. **Hook** — Hospitals drown in radios and sticky notes. We turn a spoken need into routed, trackable work.
2. **Voice** — Doctor: *“Urgent — need a bed moved from room 204 to 310.”* Request appears: `triaging` → `open`.
3. **Agents** — Show type `physical`, urgency, routed to `staff`. Three agents: voice intake → triage → routing.
4. **Act** — Staff notified → **accept** → `assigned` → `in_progress` → `done`.
5. **Second request** — *“Ventilator in ICU bay 3 is broken.”* → `equipment` → biomedical staff.
6. **Close** — Voice in. Agents orchestrate. Humans accept. Full hospital ops loop.

### Backup if Vapi/Cursor keys aren’t ready
```http
POST /api/voice/vapi/simulate
Content-Type: application/json

{
  "title": "Need bed moved",
  "description": "Room 204 to 310",
  "location": "Room 204",
  "floor": "2",
  "createdByName": "Dr. Sarah Chen",
  "createdByRole": "doctor"
}
```
Then: `GET /api/requests` → `POST /api/requests/:id/accept` with `{ "staffId": "staff-1" }`.

---

## System architecture

```
┌─────────────────┐     ┌──────────────────────────────────────────┐
│  Doctor (Vapi)  │────►│  Express API  :3001                       │
│  /demo mic      │     │  POST /api/voice/vapi  (webhook)          │
└─────────────────┘     │  POST /api/requests                       │
                        │  POST /api/requests/voice                 │
┌─────────────────┐     └───────────────┬──────────────────────────┘
│  Dashboard UI   │◄──── poll REST ─────┤
│  (separate)     │     GET /api/requests│
└─────────────────┘                     ▼
                        ┌──────────────────────────────────────────┐
                        │  Agent orchestration layer                 │
                        │  1. Voice parse (Vapi tool / transcript) │
                        │  2. Triage Agent  (Cursor SDK)           │
                        │  3. Router Agent  (Cursor SDK)           │
                        │  Fallback: rule-based if no API key      │
                        └───────────────┬──────────────────────────┘
                                        ▼
                        ┌──────────────────────────────────────────┐
                        │  SQLite  ·  Staff seed  ·  Notifications │
                        │  accept / decline / status updates         │
                        └──────────────────────────────────────────┘
```

### Request types
`medical` · `physical` · `supply` · `equipment` · `specialist`

### Lifecycle
`triaging` → `open` → `assigned` → `in_progress` → `done`

### Who can create requests
Doctors, nurses, staff — **not patients**.

### Stack
| Layer | Tech |
|-------|------|
| API | Node.js, Express, TypeScript |
| DB | SQLite (`better-sqlite3`), auto-seeded staff |
| Agents | `@cursor/sdk` (local or cloud) |
| Voice | Vapi (STT/TTS + tool call webhook) |
| Notify | Console log (+ optional Resend email) |

---

## What the frontend should have

Build a **separate dashboard** against this API (CORS is open). Poll every **2–3 seconds**.

### Must-have screens
1. **Request board** — list from `GET /api/requests`  
   Show: title, type, urgency, status, location, floor, assigned name, agent summary.
2. **Request detail** — `GET /api/requests/:id` + eligible staff.
3. **Staff actions**
   - Accept: `POST /api/requests/:id/accept` `{ "staffId": "staff-1" }`
   - Decline: `POST /api/requests/:id/decline` `{ "staffId": "..." }`
   - Status: `PATCH /api/requests/:id/status` `{ "status": "in_progress" | "done" | "cancelled" }`
4. **Staff picker** — `GET /api/staff` or `?role=nurse|doctor|staff`
5. **Optional create form** — `POST /api/requests` (typed) or link to voice page `/demo`

### Nice-to-have (if you have time)
- Color by urgency (`critical` / `high` / `normal` / `low`)
- Filter chips by status / type
- Live “just created” highlight when a new id appears after poll
- Show `agent_summary` + `agent_reasoning` (proves orchestration)

### Demo staff IDs
| Role | IDs |
|------|-----|
| Doctors | `doc-1`, `doc-2`, `doc-3` |
| Nurses | `nurse-1` … `nurse-4` |
| Staff | `staff-1` … `staff-5` |

Full endpoint reference: **[`API.md`](./API.md)**

---

## Quick start (backend)

```bash
npm install
cp .env.example .env   # add keys when you have them
npm run dev
```

### Env keys (add later)
| Variable | Purpose |
|----------|---------|
| `CURSOR_API_KEY` | Real Cursor SDK agents (else rule fallback) |
| `GITHUB_REPO` | `owner/repo` for cloud agents (optional) |
| `VAPI_PUBLIC_KEY` | Web widget |
| `VAPI_ASSISTANT_ID` | Assistant to start on `/demo` |
| `RESEND_API_KEY` | Real email (optional) |

Local Vapi webhooks need a public URL: `ngrok http 3001` → see **`VAPI-SETUP.md`**.

### Health check
`GET /health` → `{ agents, vapi, cloud, email }` flags show what’s configured.

---

## Repo layout

```
src/
  agents/orchestrator.ts   # Triage + Router (Cursor SDK)
  agents/voiceParser.ts    # Transcript → structured fields
  routes/requests.ts       # CRUD + accept/decline + voice
  routes/vapi.ts           # Vapi webhook + simulate
  routes/staff.ts
  services/requestPipeline.ts
  services/notification.ts
  db.ts                    # SQLite + seed
public/demo-voice.html     # Doctor Vapi UI
```

---

## Status

Backend is **demo-ready**: REST, orchestration, voice webhook, accept/decline, seeded staff.  
Without Cursor/Vapi keys it still runs (rules + simulate). With keys, the live voice + agent path unlocks for the stage demo.
