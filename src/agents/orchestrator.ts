import { Agent, CursorAgentError } from "@cursor/sdk";
import type { CreateRequestBody, CreatorRole, RouterResult, StaffRole, TriageResult, Urgency, RequestType, VoiceParseResult } from "../types.js";

const FALLBACK_TRIAGE: TriageResult = {
  requestType: "medical",
  urgency: "normal",
  summary: "Request needs hospital staff attention",
};

const TYPE_KEYWORDS: Record<RequestType, string[]> = {
  medical: ["patient", "pain", "medication", "doctor", "nurse", "vitals", "bleeding", "code"],
  physical: ["move", "bed", "carry", "transport", "wheelchair", "lift", "porter"],
  supply: ["supply", "stock", "linen", "gloves", "mask", "inventory", "order"],
  equipment: ["broken", "malfunction", "repair", "machine", "monitor", "ventilator", "equipment"],
  specialist: ["specialist", "consult", "cardiology", "neurology", "radiology", "surgeon"],
};

const ROLE_BY_TYPE: Record<RequestType, StaffRole> = {
  medical: "nurse",
  physical: "staff",
  supply: "staff",
  equipment: "staff",
  specialist: "doctor",
};

function getAgentOptions() {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) throw new Error("CURSOR_API_KEY not set");

  const repo = process.env.GITHUB_REPO;
  if (repo) {
    return {
      apiKey,
      model: { id: "composer-2.5" as const },
      cloud: { repos: [{ url: `https://github.com/${repo}` }] },
    };
  }

  return {
    apiKey,
    model: { id: "composer-2.5" as const },
    local: { cwd: process.cwd() },
  };
}

function extractJson<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

function ruleBasedTriage(body: CreateRequestBody): TriageResult {
  const text = `${body.title} ${body.description}`.toLowerCase();

  let bestType: RequestType = "medical";
  let bestScore = 0;
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS) as [RequestType, string[]][]) {
    const score = keywords.filter((k) => text.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  let urgency: Urgency = "normal";
  if (/critical|emergency|code blue|stat|urgent|immediately|asap/.test(text)) urgency = "critical";
  else if (/high priority|soon|rush/.test(text)) urgency = "high";
  else if (/whenever|no rush|routine/.test(text)) urgency = "low";

  return {
    requestType: bestType,
    urgency,
    summary: `${bestType} request at ${body.location} (floor ${body.floor ?? "1"})`,
  };
}

function ruleBasedRouter(triage: TriageResult): RouterResult {
  const role = ROLE_BY_TYPE[triage.requestType];
  return {
    suggestedRole: triage.urgency === "critical" && triage.requestType === "medical" ? "doctor" : role,
    reasoning: `Rule-based: ${triage.requestType} → ${role}`,
  };
}

async function runAgent(prompt: string, timeoutMs = 45000): Promise<string | null> {
  const agentPromise = Agent.prompt(prompt, getAgentOptions());
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), timeoutMs)
  );

  try {
    const result = await Promise.race([agentPromise, timeoutPromise]);
    if (!result) {
      console.error("[agent] timed out");
      return null;
    }

    if (result.status === "error") {
      console.error("[agent] run failed:", result.id);
      return null;
    }
    return result.result ?? null;
  } catch (err) {
    if (err instanceof CursorAgentError) {
      console.error("[agent] startup failed:", err.message);
    } else {
      console.error("[agent] error:", err);
    }
    return null;
  }
}

export async function triageRequest(body: CreateRequestBody): Promise<TriageResult> {
  const prompt = `You are a hospital triage agent. Classify this staff request.

Title: ${body.title}
Description: ${body.description}
Location: ${body.location}
Floor: ${body.floor ?? "1"}
Created by: ${body.createdByName} (${body.createdByRole})

Respond with ONLY valid JSON, no markdown:
{
  "requestType": "medical" | "physical" | "supply" | "equipment" | "specialist",
  "urgency": "critical" | "high" | "normal" | "low",
  "summary": "one sentence summary"
}`;

  const raw = await runAgent(prompt);
  if (!raw) return ruleBasedTriage(body);

  const parsed = extractJson<TriageResult>(raw);
  if (!parsed?.requestType || !parsed?.urgency) return ruleBasedTriage(body);

  const validTypes: RequestType[] = ["medical", "physical", "supply", "equipment", "specialist"];
  const validUrgency: Urgency[] = ["critical", "high", "normal", "low"];
  if (!validTypes.includes(parsed.requestType) || !validUrgency.includes(parsed.urgency)) {
    return ruleBasedTriage(body);
  }

  return parsed;
}

export async function routeRequest(body: CreateRequestBody, triage: TriageResult): Promise<RouterResult> {
  const prompt = `You are a hospital routing agent. Decide which staff role should handle this request.

Request:
- Type: ${triage.requestType}
- Urgency: ${triage.urgency}
- Summary: ${triage.summary}
- Title: ${body.title}
- Description: ${body.description}
- Location: ${body.location}, Floor ${body.floor ?? "1"}

Available roles: doctor, nurse, staff
- doctor: medical decisions, specialist consults
- nurse: patient care, vitals, medications
- staff: porters, supply, equipment maintenance, physical tasks

Respond with ONLY valid JSON, no markdown:
{
  "suggestedRole": "doctor" | "nurse" | "staff",
  "reasoning": "brief explanation"
}`;

  const raw = await runAgent(prompt);
  if (!raw) return ruleBasedRouter(triage);

  const parsed = extractJson<RouterResult>(raw);
  if (!parsed?.suggestedRole) return ruleBasedRouter(triage);

  const validRoles: StaffRole[] = ["doctor", "nurse", "staff"];
  if (!validRoles.includes(parsed.suggestedRole)) return ruleBasedRouter(triage);

  return parsed;
}

export async function orchestrateRequest(body: CreateRequestBody): Promise<{
  triage: TriageResult;
  routing: RouterResult;
  usedAgent: boolean;
}> {
  const hasKey = !!process.env.CURSOR_API_KEY;

  if (!hasKey) {
    const triage = ruleBasedTriage(body);
    const routing = ruleBasedRouter(triage);
    return { triage, routing, usedAgent: false };
  }

  const triage = await triageRequest(body);
  const routing = await routeRequest(body, triage);
  return { triage, routing, usedAgent: true };
}
