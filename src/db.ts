import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type {
  CreateRequestBody,
  RequestRecord,
  RequestStatus,
  Staff,
  StaffRole,
  Urgency,
  RequestType,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "data", "hospital.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('doctor', 'nurse', 'staff')),
    department TEXT NOT NULL,
    floor TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    available INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT NOT NULL,
    floor TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    created_by_role TEXT NOT NULL,
    request_type TEXT,
    urgency TEXT,
    status TEXT NOT NULL DEFAULT 'triaging',
    assigned_to TEXT,
    suggested_role TEXT,
    agent_summary TEXT,
    agent_reasoning TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (assigned_to) REFERENCES staff(id)
  );

  CREATE TABLE IF NOT EXISTS request_declines (
    request_id TEXT NOT NULL,
    staff_id TEXT NOT NULL,
    declined_at TEXT NOT NULL,
    PRIMARY KEY (request_id, staff_id),
    FOREIGN KEY (request_id) REFERENCES requests(id),
    FOREIGN KEY (staff_id) REFERENCES staff(id)
  );
`);

const staffCount = db.prepare("SELECT COUNT(*) as c FROM staff").get() as { c: number };
if (staffCount.c === 0) {
  seedStaff();
}

function seedStaff() {
  const insert = db.prepare(`
    INSERT INTO staff (id, name, role, department, floor, email, phone, available)
    VALUES (@id, @name, @role, @department, @floor, @email, @phone, @available)
  `);

  const staff: Omit<Staff, "available"> & { available?: number }[] = [
    { id: "doc-1", name: "Dr. Sarah Chen", role: "doctor", department: "Emergency", floor: "1", email: "s.chen@hospital.demo", phone: "+15550001001" },
    { id: "doc-2", name: "Dr. James Wilson", role: "doctor", department: "Cardiology", floor: "3", email: "j.wilson@hospital.demo", phone: "+15550001002" },
    { id: "doc-3", name: "Dr. Aisha Patel", role: "doctor", department: "Surgery", floor: "2", email: "a.patel@hospital.demo", phone: "+15550001003" },
    { id: "nurse-1", name: "Maria Lopez", role: "nurse", department: "ICU", floor: "4", email: "m.lopez@hospital.demo", phone: "+15550002001" },
    { id: "nurse-2", name: "John Kim", role: "nurse", department: "Emergency", floor: "1", email: "j.kim@hospital.demo", phone: "+15550002002" },
    { id: "nurse-3", name: "Emma Brown", role: "nurse", department: "Pediatrics", floor: "2", email: "e.brown@hospital.demo", phone: "+15550002003" },
    { id: "nurse-4", name: "David Nguyen", role: "nurse", department: "General Ward", floor: "3", email: "d.nguyen@hospital.demo", phone: "+15550002004" },
    { id: "staff-1", name: "Tom Porter", role: "staff", department: "Facilities", floor: "1", email: "t.porter@hospital.demo", phone: "+15550003001" },
    { id: "staff-2", name: "Lisa Supply", role: "staff", department: "Supply Chain", floor: "B1", email: "l.supply@hospital.demo", phone: "+15550003002" },
    { id: "staff-3", name: "Mike Maintenance", role: "staff", department: "Biomedical", floor: "B1", email: "m.maintenance@hospital.demo", phone: "+15550003003" },
    { id: "staff-4", name: "Anna Porter", role: "staff", department: "Facilities", floor: "2", email: "a.porter@hospital.demo", phone: "+15550003004" },
    { id: "staff-5", name: "Chris Helper", role: "staff", department: "General", floor: "3", email: "c.helper@hospital.demo", phone: "+15550003005" },
  ];

  const tx = db.transaction(() => {
    for (const s of staff) {
      insert.run({ ...s, available: 1 });
    }
  });
  tx();
}

export function getAllStaff(role?: StaffRole): Staff[] {
  if (role) {
    return db.prepare("SELECT * FROM staff WHERE role = ? ORDER BY name").all(role) as Staff[];
  }
  return db.prepare("SELECT * FROM staff ORDER BY role, name").all() as Staff[];
}

export function getStaffById(id: string): Staff | undefined {
  return db.prepare("SELECT * FROM staff WHERE id = ?").get(id) as Staff | undefined;
}

export function getStaffForRole(role: StaffRole, floor?: string): Staff[] {
  if (floor) {
    return db
      .prepare("SELECT * FROM staff WHERE role = ? AND available = 1 AND (floor = ? OR floor = 'B1') ORDER BY name")
      .all(role, floor) as Staff[];
  }
  return db.prepare("SELECT * FROM staff WHERE role = ? AND available = 1 ORDER BY name").all(role) as Staff[];
}

export function createRequest(body: CreateRequestBody, id: string, now: string): RequestRecord {
  const floor = body.floor ?? "1";
  db.prepare(`
    INSERT INTO requests (id, title, description, location, floor, created_by_name, created_by_role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'triaging', ?, ?)
  `).run(id, body.title, body.description, body.location, floor, body.createdByName, body.createdByRole, now, now);

  return getRequestById(id)!;
}

export function updateRequestAfterTriage(
  id: string,
  requestType: RequestType,
  urgency: Urgency,
  summary: string,
  suggestedRole: StaffRole,
  reasoning: string,
  now: string
): RequestRecord {
  db.prepare(`
    UPDATE requests SET
      request_type = ?, urgency = ?, status = 'open', suggested_role = ?,
      agent_summary = ?, agent_reasoning = ?, updated_at = ?
    WHERE id = ?
  `).run(requestType, urgency, suggestedRole, summary, reasoning, now, id);

  return getRequestById(id)!;
}

export function markTriageFailed(id: string, now: string): RequestRecord {
  db.prepare(`
    UPDATE requests SET status = 'open', request_type = 'medical', urgency = 'normal',
      suggested_role = 'nurse', agent_summary = 'Auto-routed (agent unavailable)', updated_at = ?
    WHERE id = ?
  `).run(now, id);
  return getRequestById(id)!;
}

export function getRequestById(id: string): RequestRecord | undefined {
  const row = db.prepare(`
    SELECT r.*, s.name as assigned_name
    FROM requests r
    LEFT JOIN staff s ON r.assigned_to = s.id
    WHERE r.id = ?
  `).get(id) as Record<string, unknown> | undefined;

  if (!row) return undefined;
  return mapRequest(row);
}

export function getAllRequests(status?: RequestStatus): RequestRecord[] {
  let rows: Record<string, unknown>[];
  if (status) {
    rows = db.prepare(`
      SELECT r.*, s.name as assigned_name FROM requests r
      LEFT JOIN staff s ON r.assigned_to = s.id
      WHERE r.status = ? ORDER BY r.created_at DESC
    `).all(status) as Record<string, unknown>[];
  } else {
    rows = db.prepare(`
      SELECT r.*, s.name as assigned_name FROM requests r
      LEFT JOIN staff s ON r.assigned_to = s.id
      ORDER BY r.created_at DESC
    `).all() as Record<string, unknown>[];
  }
  return rows.map(mapRequest);
}

function mapRequest(row: Record<string, unknown>): RequestRecord {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    location: row.location as string,
    floor: row.floor as string,
    created_by_name: row.created_by_name as string,
    created_by_role: row.created_by_role as RequestRecord["created_by_role"],
    request_type: row.request_type as RequestRecord["request_type"],
    urgency: row.urgency as RequestRecord["urgency"],
    status: row.status as RequestStatus,
    assigned_to: row.assigned_to as string | null,
    assigned_name: (row.assigned_name as string) ?? null,
    suggested_role: row.suggested_role as StaffRole | null,
    agent_summary: row.agent_summary as string | null,
    agent_reasoning: row.agent_reasoning as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function hasDeclined(requestId: string, staffId: string): boolean {
  const row = db.prepare("SELECT 1 FROM request_declines WHERE request_id = ? AND staff_id = ?").get(requestId, staffId);
  return !!row;
}

export function recordDecline(requestId: string, staffId: string, now: string): void {
  db.prepare("INSERT OR IGNORE INTO request_declines (request_id, staff_id, declined_at) VALUES (?, ?, ?)").run(
    requestId,
    staffId,
    now
  );
}

export function assignRequest(requestId: string, staffId: string, now: string): RequestRecord {
  db.prepare("UPDATE requests SET assigned_to = ?, status = 'assigned', updated_at = ? WHERE id = ?").run(
    staffId,
    now,
    requestId
  );
  return getRequestById(requestId)!;
}

export function updateRequestStatus(requestId: string, status: RequestStatus, now: string): RequestRecord {
  db.prepare("UPDATE requests SET status = ?, updated_at = ? WHERE id = ?").run(status, now, requestId);
  return getRequestById(requestId)!;
}

export function getEligibleStaff(requestId: string): Staff[] {
  const req = getRequestById(requestId);
  if (!req || !req.suggested_role) return [];
  const all = getStaffForRole(req.suggested_role, req.floor);
  const declined = db
    .prepare("SELECT staff_id FROM request_declines WHERE request_id = ?")
    .all(requestId) as { staff_id: string }[];
  const declinedIds = new Set(declined.map((d) => d.staff_id));
  return all.filter((s) => !declinedIds.has(s.id));
}
