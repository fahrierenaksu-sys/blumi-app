export const REPORT_REASONS = [
  "spam",
  "harassment",
  "fake_profile",
  "fake_or_bot",
  "inappropriate",
  "underage",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
