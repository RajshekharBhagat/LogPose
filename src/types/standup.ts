export type Persona = "manager" | "peer" | "client";

export interface StandupResult {
  markdown: string;
  whatsappMessage: string;
  persona: Persona;
  generatedAt: string;
  repos: string[];
  activitySnapshot: {
    commitCount: number;
    prCount: number;
  };
}

export type StandupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: StandupResult }
  | { status: "error"; message: string };
