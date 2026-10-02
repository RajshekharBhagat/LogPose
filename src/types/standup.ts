import type { QualityScore } from "@/types/team";

export type Persona = "manager" | "peer" | "mis";
export type MessageCount = 1 | 2 | 3;

export function clampMessageCount(value: number): MessageCount {
  if (value >= 3) return 3;
  if (value === 2) return 2;
  return 1;
}

export function personaLabel(persona: string): string {
  if (persona === "manager") return "Manager";
  if (persona === "mis" || persona === "client") return "MIS";
  return "Peer";
}

export interface StandupResult {
  markdown: string;
  whatsappMessage: string;
  messages?: string[];
  persona: Persona;
  generatedAt: string;
  repos: string[];
  activitySnapshot: {
    commitCount: number;
    prCount: number;
  };
  tokenCount: number;
  qualityScore?: QualityScore;
}

export type StandupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: StandupResult }
  | { status: "error"; message: string };
