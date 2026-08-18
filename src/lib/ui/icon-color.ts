import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Camera,
  ChartNoAxesCombined,
  CheckSquare2,
  CircleDollarSign,
  ClipboardList,
  Code2,
  Compass,
  FileText,
  Flag,
  FolderKanban,
  Gem,
  Globe2,
  GraduationCap,
  Heart,
  House,
  Lightbulb,
  Megaphone,
  MessageCircle,
  Monitor,
  Package,
  Palette,
  PencilRuler,
  Rocket,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Target,
  UsersRound,
  WandSparkles,
  Zap,
} from "@lucide/svelte";
import type { Component } from "svelte";

export type IconOption = { value: string; label: string; icon: Component };
export type ColorOption = { value: string; label: string; color: string };

export const iconOptions: IconOption[] = [
  { value: "briefcase-business", label: "Trabalho", icon: BriefcaseBusiness },
  { value: "building", label: "Empresa", icon: Building2 },
  { value: "calendar", label: "Calendário", icon: CalendarDays },
  { value: "camera", label: "Fotografia", icon: Camera },
  { value: "chart", label: "Resultados", icon: ChartNoAxesCombined },
  { value: "check-square", label: "Tarefas", icon: CheckSquare2 },
  { value: "dollar", label: "Financeiro", icon: CircleDollarSign },
  { value: "clipboard", label: "Planejamento", icon: ClipboardList },
  { value: "code", label: "Tecnologia", icon: Code2 },
  { value: "compass", label: "Direção", icon: Compass },
  { value: "file", label: "Documentos", icon: FileText },
  { value: "flag", label: "Marco", icon: Flag },
  { value: "folder-kanban", label: "Projetos", icon: FolderKanban },
  { value: "gem", label: "Premium", icon: Gem },
  { value: "globe", label: "Global", icon: Globe2 },
  { value: "graduation", label: "Educação", icon: GraduationCap },
  { value: "heart", label: "Favorito", icon: Heart },
  { value: "house", label: "Pessoal", icon: House },
  { value: "lightbulb", label: "Ideias", icon: Lightbulb },
  { value: "megaphone", label: "Marketing", icon: Megaphone },
  { value: "message", label: "Comunicação", icon: MessageCircle },
  { value: "monitor", label: "Digital", icon: Monitor },
  { value: "package", label: "Produto", icon: Package },
  { value: "palette", label: "Design", icon: Palette },
  { value: "pencil-ruler", label: "Criação", icon: PencilRuler },
  { value: "rocket", label: "Lançamento", icon: Rocket },
  { value: "search", label: "Pesquisa", icon: Search },
  { value: "settings", label: "Operações", icon: Settings2 },
  { value: "shield", label: "Segurança", icon: ShieldCheck },
  { value: "shopping-bag", label: "Comercial", icon: ShoppingBag },
  { value: "sparkles", label: "Destaque", icon: Sparkles },
  { value: "star", label: "Estrela", icon: Star },
  { value: "target", label: "Metas", icon: Target },
  { value: "users", label: "Equipe", icon: UsersRound },
  { value: "wand", label: "Criativo", icon: WandSparkles },
  { value: "zap", label: "Energia", icon: Zap },
];

export const colorOptions: ColorOption[] = [
  { value: "blue", label: "Azul", color: "#2e56ff" },
  { value: "indigo", label: "Índigo", color: "#4f46e5" },
  { value: "violet", label: "Violeta", color: "#7c3aed" },
  { value: "purple", label: "Roxo", color: "#9333ea" },
  { value: "pink", label: "Rosa", color: "#db2777" },
  { value: "red", label: "Vermelho", color: "#dc2626" },
  { value: "orange", label: "Laranja", color: "#ea580c" },
  { value: "amber", label: "Amarelo", color: "#eab308" },
  { value: "lime", label: "Lima", color: "#65a30d" },
  { value: "green", label: "Verde", color: "#16a34a" },
  { value: "emerald", label: "Esmeralda", color: "#059669" },
  { value: "teal", label: "Turquesa", color: "#0d9488" },
  { value: "cyan", label: "Ciano", color: "#0891b2" },
  { value: "sky", label: "Céu", color: "#0284c7" },
  { value: "slate", label: "Cinza azulado", color: "#64748b" },
  { value: "zinc", label: "Grafite", color: "#3f3f46" },
];

export function resolveIcon(value: string | undefined): Component {
  return (
    iconOptions.find((option) => option.value === value)?.icon ??
    BriefcaseBusiness
  );
}

export function resolveColor(value: string | undefined): string {
  return (
    colorOptions.find((option) => option.value === value)?.color ?? "#2e56ff"
  );
}
