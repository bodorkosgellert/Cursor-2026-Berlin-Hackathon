import "dotenv/config";
import cors from "cors";
import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { requestsRouter } from "./routes/requests.js";
import { staffRouter } from "./routes/staff.js";
import { vapiRouter } from "./routes/vapi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(join(__dirname, "..", "public")));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "hospital-system-api",
    agents: !!process.env.CURSOR_API_KEY,
    cloud: !!process.env.GITHUB_REPO,
    email: !!process.env.RESEND_API_KEY,
    vapi: !!(process.env.VAPI_PUBLIC_KEY && process.env.VAPI_ASSISTANT_ID),
  });
});

app.get("/demo", (_req, res) => {
  res.sendFile(join(__dirname, "..", "public", "demo-voice.html"));
});

app.use("/api/staff", staffRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/voice/vapi", vapiRouter);

app.listen(PORT, () => {
  const vapiReady = !!(process.env.VAPI_PUBLIC_KEY && process.env.VAPI_ASSISTANT_ID);
  console.log(`\n🏥 Hospital API running on http://localhost:${PORT}`);
  console.log(`   Health:  GET  /health`);
  console.log(`   Voice:   GET  /demo  ← Vapi doctor mic`);
  console.log(`   Vapi WH: POST /api/voice/vapi`);
  console.log(`   Staff:   GET  /api/staff`);
  console.log(`   Requests GET/POST /api/requests`);
  console.log(`   Vapi:    ${vapiReady ? "configured" : "set VAPI_PUBLIC_KEY + VAPI_ASSISTANT_ID"}`);
  console.log(`   Agents:  ${process.env.CURSOR_API_KEY ? "enabled" : "rules-only (set CURSOR_API_KEY)"}`);
  console.log(`   Cloud:   ${process.env.GITHUB_REPO ?? "local fallback"}\n`);
});
