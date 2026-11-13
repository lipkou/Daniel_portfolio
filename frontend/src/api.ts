import type { FlowModel } from "./flow/types";

export interface Student {
  name: string;
  name_latin: string;
  group: string;
  variant: number;
  university: string;
  faculty: string;
  department: string;
  teacher: string;
  city: string;
}

export interface ReportSummary {
  slug: string;
  kind: string;
  kind_display: string;
  number: number;
  discipline: string;
  topic: string;
  year: number;
  updated_at: string;
  url: string;
  text_url: string;
}

export interface Task {
  order: number;
  title: string;
  statement: string;
  model: FlowModel | Record<string, never>;
  code: string;
  language: string;
  output: string;
}

export interface Report extends ReportSummary {
  student: Student;
  goal: string;
  theory: string;
  tasks: Task[];
  conclusion: string;
  demo_url: string;
}

export interface Project {
  id: number;
  title: string;
  description: string;
  tech: string[];
  url: string;
  repo_url: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(res.status === 404 ? "Не знайдено" : `Помилка сервера (${res.status})`);
  return res.json() as Promise<T>;
}

export const api = {
  reports: () => get<ReportSummary[]>("/api/reports/"),
  report: (slug: string) => get<Report>(`/api/reports/${encodeURIComponent(slug)}/`),
  projects: () => get<Project[]>("/api/projects/"),
};

export const hasModel = (t: Task): t is Task & { model: FlowModel } =>
  Array.isArray((t.model as FlowModel).nodes) && (t.model as FlowModel).nodes.length > 0;
