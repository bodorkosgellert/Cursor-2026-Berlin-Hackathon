# Vapi voice setup (hackathon)

## Why Vapi
Doctor talks → Vapi assistant → tool `create_hospital_request` → our webhook → Cursor agents triage/route → staff notified → dashboard shows request.

## 1. Create assistant at [dashboard.vapi.ai](https://dashboard.vapi.ai)

**System prompt (paste):**
```
You are a hospital voice intake assistant. Staff (doctors/nurses) call you to request help.

When they describe a need (move a bed, supplies, broken equipment, medical help, specialist), call the tool create_hospital_request with:
- title: short title
- description: full details from what they said
- location: room/ward if mentioned, else "Hospital"
- floor: "1","2","3","4", or "B1" if known, else "1"
- createdByName: use their name if said, else "Dr. Voice"
- createdByRole: "doctor", "nurse", or "staff" (default doctor)

Confirm briefly after the tool succeeds. Keep replies short.
```

**Add tool** `create_hospital_request` with parameters:
- title (string, required)
- description (string, required)
- location (string)
- floor (string)
- createdByName (string)
- createdByRole (string) — doctor | nurse | staff

**Server URL:** `https://YOUR-NGROK-URL/api/voice/vapi`  
(For local demos: `ngrok http 3001`)

## 2. `.env`
```
VAPI_PUBLIC_KEY=xxxxxxxx
VAPI_ASSISTANT_ID=xxxxxxxx
```

Public key = Vapi **Public** key (for the web widget).  
Assistant ID = the assistant you created.

## 3. Demo
1. `npm run dev`
2. Expose with ngrok, set Server URL on the assistant
3. Open `http://localhost:3001/demo`
4. Tap mic → speak → request appears on dashboard (`GET /api/requests`)

## Test without Vapi UI
```
POST /api/voice/vapi/simulate
{
  "title": "Need bed moved",
  "description": "Room 204 to 310",
  "location": "Room 204",
  "floor": "2",
  "createdByName": "Dr. Sarah Chen",
  "createdByRole": "doctor"
}
```
