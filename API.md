# Hospital API — Dashboard Integration

Base URL: `http://localhost:3001`

## Endpoints

### Health
`GET /health` — service status

### Staff
`GET /api/staff` — all staff  
`GET /api/staff?role=nurse` — filter by role (`doctor` | `nurse` | `staff`)

### Requests
`GET /api/requests` — all requests (newest first)  
`GET /api/requests?status=open` — filter by status  
`GET /api/requests/:id` — single request + eligible staff  

`POST /api/requests` — create request (returns immediately, agents triage in background)
```json
{
  "title": "Need bed moved",
  "description": "Patient in room 204 needs transfer to room 310",
  "location": "Room 204",
  "floor": "2",
  "createdByName": "Maria Lopez",
  "createdByRole": "nurse"
}
```

`POST /api/requests/:id/accept` — staff accepts
```json
{ "staffId": "staff-1" }
```

`POST /api/requests/:id/decline` — staff declines
```json
{ "staffId": "staff-1" }
```

`PATCH /api/requests/:id/status` — update progress
```json
{ "status": "in_progress" }
```
Status values: `in_progress` | `done` | `cancelled`

## Request lifecycle
`triaging` → `open` → `assigned` → `in_progress` → `done`

### Voice (Vapi — primary for demo)
See **`VAPI-SETUP.md`** for assistant + ngrok setup.

`GET /api/voice/vapi/config` — public key + assistant id for the widget  
`POST /api/voice/vapi` — **Vapi Server URL webhook** (tool calls)  
`POST /api/voice/vapi/simulate` — fake a tool call without Vapi UI

`POST /api/requests/voice` — fallback transcript intake (no Vapi)
```json
{
  "transcript": "We need a bed moved from room 204 to room 310 on floor 2",
  "createdByName": "Dr. Sarah Chen",
  "createdByRole": "doctor"
}
```

### Voice demo page
Open **`http://localhost:3001/demo`** — Vapi web call. Doctor speaks → tool creates request → dashboard polls `GET /api/requests`.

## Agent pipeline (voice)
```
Vapi (STT + TTS)
    → tool: create_hospital_request
    → our webhook /api/voice/vapi
    → Triage Agent → Router Agent
    → Notify staff + show on dashboard
```

## Demo staff IDs
- Doctors: `doc-1`, `doc-2`, `doc-3`
- Nurses: `nurse-1` … `nurse-4`
- Staff: `staff-1` … `staff-5`
