import { v4 as uuid } from "uuid";
import { orchestrateRequest } from "../agents/orchestrator.js";
import {
  createRequest,
  getEligibleStaff,
  getRequestById,
  markTriageFailed,
  updateRequestAfterTriage,
} from "../db.js";
import { notifyEligibleStaff } from "./notification.js";
import type { CreateRequestBody, RequestRecord } from "../types.js";

export async function runRequestPipeline(body: CreateRequestBody): Promise<{
  id: string;
  initial: RequestRecord;
}> {
  const id = uuid();
  const now = new Date().toISOString();
  const initial = createRequest(body, id, now);

  try {
    const { triage, routing, usedAgent } = await orchestrateRequest(body);
    const request = updateRequestAfterTriage(
      id,
      triage.requestType,
      triage.urgency,
      triage.summary,
      routing.suggestedRole,
      routing.reasoning,
      new Date().toISOString()
    );

    const eligible = getEligibleStaff(id);
    await notifyEligibleStaff(eligible, request);

    console.log(
      `[orchestrator] ${id} triaged (${usedAgent ? "agent" : "rules"}) → ${triage.requestType}/${routing.suggestedRole}, notified ${eligible.length} staff`
    );
  } catch (err) {
    console.error("[orchestrator] failed:", err);
    const request = markTriageFailed(id, new Date().toISOString());
    const eligible = getEligibleStaff(id);
    await notifyEligibleStaff(eligible, request);
  }

  return { id, initial };
}

export function getRequestOrThrow(id: string): RequestRecord {
  const request = getRequestById(id);
  if (!request) throw new Error("Request not found");
  return request;
}
