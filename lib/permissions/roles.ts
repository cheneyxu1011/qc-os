export const qcRoles = [
  "reporter",
  "assignee",
  "source_reviewer",
  "qc",
  "manager",
  "business",
  "admin"
] as const;

export type QcRole = (typeof qcRoles)[number];

