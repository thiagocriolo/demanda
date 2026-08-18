import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  TimerReset,
} from "@lucide/svelte";
import type { Activity, Metric, ScheduleItem, WorkloadItem } from "./types";

// Conteúdo demonstrativo: será substituído pelos dados reais em uma etapa futura.
export const metrics: Metric[] = [
  {
    label: "Demandas ativas",
    value: "18",
    detail: "+3 nesta semana",
    tone: "blue",
    icon: ClipboardList,
  },
  {
    label: "Concluídas",
    value: "42",
    detail: "87% dentro do prazo",
    tone: "green",
    icon: CheckCircle2,
  },
  {
    label: "Prazos próximos",
    value: "5",
    detail: "2 pedem atenção",
    tone: "amber",
    icon: CalendarClock,
  },
  {
    label: "Horas planejadas",
    value: "76h",
    detail: "12h disponíveis",
    tone: "violet",
    icon: TimerReset,
  },
];

export const todaySchedule: ScheduleItem[] = [
  {
    time: "09:30",
    title: "Alinhamento de produto",
    context: "Equipe interna",
    tone: "blue",
  },
  {
    time: "11:00",
    title: "Revisão de entregáveis",
    context: "Projeto Aurora",
    tone: "green",
  },
  {
    time: "15:30",
    title: "Planejamento semanal",
    context: "Operação",
    tone: "violet",
  },
];

export const recentActivity: Activity[] = [
  {
    initials: "CM",
    person: "Carla Mendes",
    action: "concluiu",
    target: "Revisar proposta comercial",
    time: "há 12 min",
  },
  {
    initials: "RA",
    person: "Rafael Alves",
    action: "comentou em",
    target: "Identidade da campanha",
    time: "há 34 min",
  },
  {
    initials: "LS",
    person: "Lívia Souza",
    action: "criou",
    target: "Cronograma de lançamento",
    time: "há 1 h",
  },
];

export const workload: WorkloadItem[] = [
  { label: "Planejado", value: "76h", color: "blue" },
  { label: "Realizado", value: "54h", color: "green" },
  { label: "Disponível", value: "12h", color: "gray" },
];
