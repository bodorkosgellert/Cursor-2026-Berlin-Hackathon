export type RequestType =
  | "medical"
  | "physical"
  | "supply"
  | "equipment"
  | "specialist";

export type Urgency = "critical" | "high" | "normal" | "low";

export type RequestStatus =
  | "triaging"
  | "open"
  | "assigned"
  | "in_progress"
  | "done"
  | "cancelled";

export type StaffRole = "doctor" | "nurse" | "staff";

export type CreatorRole = "doctor" | "nurse" | "staff";

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  department: string;
  floor: string;
  email: string;
  phone: string;
  available: number;
}

export interface RequestRecord {
  id: string;
  title: string;
  description: string;
  location: string;
  floor: string;
  created_by_name: string;
  created_by_role: CreatorRole;
  request_type: RequestType | null;
  urgency: Urgency | null;
  status: RequestStatus;
  assigned_to: string | null;
  assigned_name: string | null;
  suggested_role: StaffRole | null;
  agent_summary: string | null;
  agent_reasoning: string | null;
  created_at: string;
  updated_at: string;
}

export interface TriageResult {
  requestType: RequestType;
  urgency: Urgency;
  summary: string;
}

export interface RouterResult {
  suggestedRole: StaffRole;
  reasoning: string;
}

export interface CreateRequestBody {
  title: string;
  description: string;
  location: string;
  floor?: string;
  createdByName: string;
  createdByRole: CreatorRole;
}

export interface AcceptDeclineBody {
  staffId: string;
}

export interface UpdateStatusBody {
  status: "in_progress" | "done" | "cancelled";
}

export interface VoiceRequestBody {
  transcript: string;
  createdByName: string;
  createdByRole: CreatorRole;
  floor?: string;
}

export interface VoiceParseResult {
  title: string;
  description: string;
  location: string;
  floor: string;
}
