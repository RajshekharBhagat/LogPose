export interface QualityScore {
  total_score: number;
  breakdown: {
    functionality: number;
    quality: number;
    scalability: number;
  };
  critical_feedback: string;
}

export interface TeamProfile {
  userId: string;
  name: string;
  avatar_url: string;
  team_id: string;
}

export interface TeamLog {
  id: string;
  userId: string;
  date: string;
  markdown: string;
  persona: string;
  generatedAt: string;
  commitCount: number;
  prCount: number;
  quality_score?: QualityScore;
  author: { name: string; avatar_url: string };
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  avatar_url: string;
  avg_score: number;
  total_logs: number;
  streak: number;
}
