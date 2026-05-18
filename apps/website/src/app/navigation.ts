import {
  Activity,
  Bot,
  CalendarClock,
  KeyRound,
  LayoutDashboard,
  MessageCircle,
  Settings,
} from "lucide-react";

export type ViewId = "overview" | "agent" | "providers" | "telegram" | "calendar" | "settings";

export const navigationItems = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
  },
  {
    id: "agent",
    label: "Agent Monitor",
    icon: Activity,
  },
  {
    id: "providers",
    label: "LLM Providers",
    icon: Bot,
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: MessageCircle,
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: CalendarClock,
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
  },
] satisfies Array<{
  id: ViewId;
  label: string;
  icon: typeof KeyRound;
}>;
