import { Router } from "express";
import { getAllStaff } from "../db.js";
import type { StaffRole } from "../types.js";

export const staffRouter = Router();

staffRouter.get("/", (req, res) => {
  const role = req.query.role as StaffRole | undefined;
  const staff = getAllStaff(role);
  res.json({ staff });
});

staffRouter.get("/health", (_req, res) => {
  res.json({ ok: true, staffCount: getAllStaff().length });
});
