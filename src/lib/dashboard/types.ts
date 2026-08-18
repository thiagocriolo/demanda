import type { LayoutDashboard } from "@lucide/svelte";

export type MetricTone = "blue" | "green" | "amber" | "violet";

export type Metric = {
  label: string;
  value: string;
  detail: string;
  tone: MetricTone;
  icon: typeof LayoutDashboard;
};

export type ScheduleItem = {
  time: string;
  title: string;
  context: string;
  tone: MetricTone;
};

export type Activity = {
  initials: string;
  person: string;
  action: string;
  target: string;
  time: string;
};

export type WorkloadItem = {
  label: string;
  value: string;
  color: "blue" | "green" | "gray";
};
