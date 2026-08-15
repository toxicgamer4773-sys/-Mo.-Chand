export interface UserProfile {
  userId: string;
  name: string;
  role?: string;
  nickname?: string;
  sarcasmLevel?: number; // 1 to 5
  humorLevel?: number;   // 1 to 5
  voiceName?: string;
  customInstructions?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type MemoryCategory = "preference" | "fact" | "work" | "personal" | "rule";

export interface UserMemory {
  id: string;
  userId: string;
  category: MemoryCategory;
  key: string;
  fact: string;
  importance?: number; // 1 to 5
  createdAt?: string;
  updatedAt?: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  messageCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChatMessageItem {
  id: string;
  sessionId: string;
  userId: string;
  sender: "user" | "zoya";
  text: string;
  createdAt?: string;
}
