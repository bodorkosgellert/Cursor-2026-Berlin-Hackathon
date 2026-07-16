import { Router } from "express";
import { runRequestPipeline } from "../services/requestPipeline.js";
import { getRequestById } from "../db.js";
import type { CreateRequestBody, CreatorRole } from "../types.js";

export const vapiRouter = Router();

interface VapiToolCall {
  id?: string;
  name?: string;
  function?: { name?: string; arguments?: string | Record<string, unknown> };
  parameters?: Record<string, unknown>;
}

function parseArgs(toolCall: VapiToolCall): Record<string, unknown> {
  const fromParams = toolCall.parameters;
  if (fromParams && typeof fromParams === "object") return fromParams;

  const args = toolCall.function?.arguments;
  if (!args) return {};
  if (typeof args === "object") return args;
  try {
    return JSON.parse(args) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toolName(toolCall: VapiToolCall): string {
  return toolCall.name || toolCall.function?.name || "";
}

function toolId(toolCall: VapiToolCall): string {
  return toolCall.id || "unknown";
}

function toCreateBody(args: Record<string, unknown>): CreateRequestBody | null {
  const title = String(args.title || args.request || "").trim();
  const description = String(args.description || args.details || title).trim();
  const location = String(args.location || args.room || "Hospital").trim();
  const floor = String(args.floor || "1").trim();
  const createdByName = String(args.createdByName || args.speakerName || "Dr. Voice").trim();
  const roleRaw = String(args.createdByRole || args.role || "doctor").toLowerCase();
  const createdByRole = (["doctor", "nurse", "staff"].includes(roleRaw) ? roleRaw : "doctor") as CreatorRole;

  if (!title && !description) return null;

  return {
    title: title || description.slice(0, 80),
    description,
    location,
    floor,
    createdByName,
    createdByRole,
  };
}

async function handleCreateHospitalRequest(args: Record<string, unknown>) {
  const body = toCreateBody(args);
  if (!body) {
    return { ok: false, message: "Missing title/description for hospital request" };
  }

  const { id } = await runRequestPipeline(body);

  // Give triage a moment — still return immediately for Vapi latency
  await new Promise((r) => setTimeout(r, 400));
  const request = getRequestById(id);

  console.log(`[vapi] created request ${id}: ${body.title}`);

  return {
    ok: true,
    message: `Request created. ID ${id}. Type: ${request?.request_type ?? "triaging"}. Staff are being notified.`,
    requestId: id,
    status: request?.status ?? "triaging",
    requestType: request?.request_type,
    suggestedRole: request?.suggested_role,
  };
}

function collectToolCalls(message: Record<string, unknown>): VapiToolCall[] {
  const list =
    (message.toolCallList as VapiToolCall[] | undefined) ||
    (message.toolWithToolCallList as Array<{ toolCall?: VapiToolCall }> | undefined)?.map((t) => t.toolCall!).filter(Boolean) ||
    (message.toolCalls as VapiToolCall[] | undefined) ||
    [];

  if (list.length) return list;

  // Legacy single function-call
  if (message.type === "function-call" && message.functionCall) {
    const fc = message.functionCall as VapiToolCall;
    return [fc];
  }

  return [];
}

vapiRouter.get("/config", (_req, res) => {
  res.json({
    publicKey: process.env.VAPI_PUBLIC_KEY || null,
    assistantId: process.env.VAPI_ASSISTANT_ID || null,
    configured: !!(process.env.VAPI_PUBLIC_KEY && process.env.VAPI_ASSISTANT_ID),
  });
});

/**
 * Vapi Server URL webhook.
 * Point your assistant's Server URL to:
 *   https://YOUR-NGROK/api/voice/vapi
 *
 * Tool name to create in Vapi dashboard: create_hospital_request
 */
vapiRouter.post("/", async (req, res) => {
  const message = (req.body?.message ?? req.body) as Record<string, unknown>;
  const type = String(message?.type || "");

  console.log(`[vapi] webhook type=${type}`);

  if (type === "tool-calls" || type === "function-call") {
    const toolCalls = collectToolCalls(message);
    const results = [];

    for (const call of toolCalls) {
      const name = toolName(call);
      const id = toolId(call);
      const args = parseArgs(call);

      if (name === "create_hospital_request" || name === "createHospitalRequest") {
        const result = await handleCreateHospitalRequest(args);
        results.push({ toolCallId: id, result: JSON.stringify(result) });
      } else {
        results.push({
          toolCallId: id,
          result: JSON.stringify({ ok: false, message: `Unknown tool: ${name}` }),
        });
      }
    }

    return res.json({ results });
  }

  // Backup: if call ends with transcript and no tool was used, still create a request
  if (type === "end-of-call-report") {
    const artifact = message.artifact as Record<string, unknown> | undefined;
    const transcript = String(artifact?.transcript || message.transcript || "").trim();
    const analysis = message.analysis as Record<string, unknown> | undefined;
    const summary = String(analysis?.summary || "").trim();

    const text = summary || transcript;
    if (text.length > 10) {
      const result = await handleCreateHospitalRequest({
        title: text.slice(0, 80),
        description: text,
        location: "Voice call",
        floor: "1",
        createdByName: "Dr. Voice",
        createdByRole: "doctor",
      });
      console.log(`[vapi] end-of-call created:`, result.requestId);
    }

    return res.json({ ok: true });
  }

  // Acknowledge other event types (status-update, speech-update, etc.)
  res.json({ ok: true });
});

/** Local/test helper — simulate a Vapi tool call without the widget */
vapiRouter.post("/simulate", async (req, res) => {
  const result = await handleCreateHospitalRequest(req.body || {});
  res.status(result.ok ? 201 : 400).json(result);
});
