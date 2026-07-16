import { Agent, CursorAgentError } from "@cursor/sdk";
import type { CreatorRole, VoiceParseResult } from "../types.js";

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

export function ruleBasedVoiceParse(
  transcript: string,
  createdByName: string,
  createdByRole: CreatorRole,
  defaultFloor?: string
): VoiceParseResult {
  const text = transcript.trim();
  const roomMatch = text.match(/\broom\s*(\d+[a-z]?)\b/i);
  const wardMatch = text.match(/\bward\s*(\d+[a-z]?)\b/i);
  const floorMatch = text.match(/\bfloor\s*(\d+|basement|b1)\b/i);

  let location = "Hospital floor";
  if (roomMatch) location = `Room ${roomMatch[1]}`;
  else if (wardMatch) location = `Ward ${wardMatch[1]}`;

  let floor = defaultFloor ?? "1";
  if (floorMatch) {
    const f = floorMatch[1].toLowerCase();
    floor = f === "basement" ? "B1" : f;
  } else if (roomMatch) {
    const roomNum = parseInt(roomMatch[1], 10);
    if (roomNum >= 200 && roomNum < 300) floor = "2";
    else if (roomNum >= 300 && roomNum < 400) floor = "3";
    else if (roomNum >= 400) floor = "4";
  }

  const short = text.length > 72 ? `${text.slice(0, 72)}…` : text;

  return {
    title: short,
    description: text,
    location,
    floor,
  };
}

async function runVoiceAgent(prompt: string): Promise<string | null> {
  const timeoutMs = 30000;
  const agentPromise = Agent.prompt(prompt, getAgentOptions());
  const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));

  try {
    const result = await Promise.race([agentPromise, timeoutPromise]);
    if (!result || result.status === "error") return null;
    return result.result ?? null;
  } catch (err) {
    if (err instanceof CursorAgentError) {
      console.error("[voice-agent] startup failed:", err.message);
    }
    return null;
  }
}

export async function parseVoiceTranscript(
  transcript: string,
  createdByName: string,
  createdByRole: CreatorRole,
  defaultFloor?: string
): Promise<{ parsed: VoiceParseResult; usedAgent: boolean }> {
  const fallback = ruleBasedVoiceParse(transcript, createdByName, createdByRole, defaultFloor);

  if (!process.env.CURSOR_API_KEY) {
    return { parsed: fallback, usedAgent: false };
  }

  const prompt = `You are a hospital voice intake agent. A ${createdByRole} named ${createdByName} spoke this request aloud. Extract structured fields.

Spoken transcript:
"${transcript}"

Respond with ONLY valid JSON, no markdown:
{
  "title": "short title max 80 chars",
  "description": "full details from what they said",
  "location": "e.g. Room 204 or ICU Bay 3",
  "floor": "1" or "2" or "3" or "4" or "B1"
}`;

  const raw = await runVoiceAgent(prompt);
  if (!raw) return { parsed: fallback, usedAgent: false };

  const parsed = extractJson<VoiceParseResult>(raw);
  if (!parsed?.title || !parsed?.description || !parsed?.location) {
    return { parsed: fallback, usedAgent: false };
  }

  return {
    parsed: {
      title: parsed.title.slice(0, 120),
      description: parsed.description,
      location: parsed.location,
      floor: parsed.floor ?? fallback.floor,
    },
    usedAgent: true,
  };
}
