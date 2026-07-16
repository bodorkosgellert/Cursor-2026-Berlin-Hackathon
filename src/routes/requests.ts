import { Router } from "express";
import { parseVoiceTranscript } from "../agents/voiceParser.js";
import {
  assignRequest,
  getAllRequests,
  getEligibleStaff,
  getRequestById,
  getStaffById,
  hasDeclined,
  recordDecline,
  updateRequestStatus,
} from "../db.js";
import { notifyStaffAssigned } from "../services/notification.js";
import { runRequestPipeline } from "../services/requestPipeline.js";
import type { AcceptDeclineBody, CreateRequestBody, UpdateStatusBody, VoiceRequestBody } from "../types.js";

export const requestsRouter = Router();

requestsRouter.get("/", (req, res) => {
  const status = req.query.status as string | undefined;
  const requests = getAllRequests(status as Parameters<typeof getAllRequests>[0]);
  res.json({ requests });
});

// Must be before /:id — voice intake from spoken transcript
requestsRouter.post("/voice", async (req, res) => {
  const body = req.body as VoiceRequestBody;

  if (!body.transcript?.trim() || !body.createdByName || !body.createdByRole) {
    return res.status(400).json({
      error: "Required: transcript, createdByName, createdByRole",
    });
  }

  const { parsed, usedAgent } = await parseVoiceTranscript(
    body.transcript.trim(),
    body.createdByName,
    body.createdByRole,
    body.floor
  );

  const createBody: CreateRequestBody = {
    title: parsed.title,
    description: parsed.description,
    location: parsed.location,
    floor: parsed.floor,
    createdByName: body.createdByName,
    createdByRole: body.createdByRole,
  };

  const { id, initial } = await runRequestPipeline(createBody);

  res.status(202).json({
    message: "Voice request received, processing",
    transcript: body.transcript.trim(),
    parsed,
    voiceAgent: usedAgent,
    request: initial,
    requestId: id,
  });
});

requestsRouter.get("/:id", (req, res) => {
  const request = getRequestById(req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found" });
  res.json({ request, eligibleStaff: getEligibleStaff(req.params.id) });
});

requestsRouter.post("/", async (req, res) => {
  const body = req.body as CreateRequestBody;

  if (!body.title || !body.description || !body.location || !body.createdByName || !body.createdByRole) {
    return res.status(400).json({
      error: "Required: title, description, location, createdByName, createdByRole",
    });
  }

  const { id, initial } = await runRequestPipeline(body);

  res.status(202).json({ request: initial, requestId: id, message: "Request created, triaging in background" });
});

requestsRouter.post("/:id/accept", async (req, res) => {
  const body = req.body as AcceptDeclineBody;
  const request = getRequestById(req.params.id);

  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.status !== "open") {
    return res.status(409).json({ error: `Cannot accept request in status: ${request.status}` });
  }

  const staff = getStaffById(body.staffId);
  if (!staff) return res.status(404).json({ error: "Staff not found" });
  if (hasDeclined(req.params.id, body.staffId)) {
    return res.status(409).json({ error: "Staff already declined this request" });
  }

  const updated = assignRequest(req.params.id, body.staffId, new Date().toISOString());
  await notifyStaffAssigned(staff, updated);

  res.json({ request: updated });
});

requestsRouter.post("/:id/decline", (req, res) => {
  const body = req.body as AcceptDeclineBody;
  const request = getRequestById(req.params.id);

  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.status !== "open") {
    return res.status(409).json({ error: `Cannot decline request in status: ${request.status}` });
  }

  const staff = getStaffById(body.staffId);
  if (!staff) return res.status(404).json({ error: "Staff not found" });

  recordDecline(req.params.id, body.staffId, new Date().toISOString());
  const remaining = getEligibleStaff(req.params.id);

  res.json({
    message: "Declined",
    remainingEligible: remaining.length,
    eligibleStaff: remaining,
  });
});

requestsRouter.patch("/:id/status", (req, res) => {
  const body = req.body as UpdateStatusBody;
  const request = getRequestById(req.params.id);

  if (!request) return res.status(404).json({ error: "Request not found" });
  if (!["in_progress", "done", "cancelled"].includes(body.status)) {
    return res.status(400).json({ error: "Status must be in_progress, done, or cancelled" });
  }

  const updated = updateRequestStatus(req.params.id, body.status, new Date().toISOString());
  res.json({ request: updated });
});
