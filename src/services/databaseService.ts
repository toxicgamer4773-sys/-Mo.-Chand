import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  deleteDoc,
  onSnapshot,
  Unsubscribe
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { UserProfile, UserMemory, ChatSession, ChatMessageItem, MemoryCategory } from "../types/database";
import { GoogleGenAI, Type } from "@google/genai";

export const DEFAULT_CHANDU_PROFILE: Omit<UserProfile, "userId" | "createdAt" | "updatedAt"> = {
  name: "Chandu",
  role: "Creator & Lead Architect",
  nickname: "Chandu",
  sarcasmLevel: 4,
  humorLevel: 5,
  voiceName: "Kore",
  customInstructions: "Chandu is my creator and developer brother! Address him warmly as Chandu or Boss with playful witty banter, loyalty, and sharp intelligence.",
};

export const DEFAULT_INITIAL_MEMORIES = [
  { 
    category: "fact" as MemoryCategory, 
    key: "Creator & Architect", 
    fact: "Chandu is the original creator, architect, and developer of Zara AI Voice Assistant.", 
    importance: 5 
  },
  { 
    category: "preference" as MemoryCategory, 
    key: "Tone & Language", 
    fact: "Chandu prefers witty, humorous, and sassy responses in a natural blend of English and Hindi (Hinglish).", 
    importance: 5 
  },
  { 
    category: "preference" as MemoryCategory, 
    key: "Addressing Name", 
    fact: "Zara should affectionately call Chandu by his name 'Chandu' or 'Boss'.", 
    importance: 4 
  },
  { 
    category: "work" as MemoryCategory, 
    key: "AI Development", 
    fact: "Chandu builds cutting-edge AI voice assistants with real-time audio, memory databases, and smart automation.", 
    importance: 4 
  },
];

// ----------------- USER PROFILE -----------------

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const path = `users/${userId}`;
  const now = new Date().toISOString();
  const fallbackProfile: UserProfile = {
    userId,
    ...DEFAULT_CHANDU_PROFILE,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const docRef = doc(db, "users", userId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    } else {
      await setDoc(docRef, fallbackProfile).catch(console.warn);
      return fallbackProfile;
    }
  } catch (error) {
    console.warn("Using offline fallback profile:", error);
    return fallbackProfile;
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const path = `users/${profile.userId}`;
  try {
    const docRef = doc(db, "users", profile.userId);
    const updated = {
      ...profile,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(docRef, updated, { merge: true });
  } catch (error) {
    console.warn("Offline save user profile:", error);
    // Don't throw fatal error to UI if offline
  }
}

// ----------------- LONG TERM MEMORIES -----------------

export function subscribeToMemories(
  userId: string, 
  callback: (memories: UserMemory[]) => void
): Unsubscribe {
  const path = `users/${userId}/memories`;
  try {
    const colRef = collection(db, "users", userId, "memories");
    const q = query(colRef, orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snapshot) => {
        const list: UserMemory[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as UserMemory);
        });
        
        // Auto-seed default memories if list is empty for new user
        if (list.length === 0 && snapshot.empty && !snapshot.metadata.fromCache) {
          seedDefaultMemories(userId).catch(console.warn);
        } else if (list.length > 0) {
          callback(list);
        } else {
          // Provide default initial memories locally if empty
          callback(DEFAULT_INITIAL_MEMORIES.map((m, i) => ({
            id: `mem_init_${i}`,
            userId,
            ...m,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })));
        }
      },
      (error) => {
        console.warn("Memories listener notice:", error);
        // Fallback initial list
        callback(DEFAULT_INITIAL_MEMORIES.map((m, i) => ({
          id: `mem_init_${i}`,
          userId,
          ...m,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })));
      }
    );
  } catch (error) {
    console.warn("Subscribe to memories error:", error);
    return () => {};
  }
}

export async function seedDefaultMemories(userId: string): Promise<void> {
  for (const item of DEFAULT_INITIAL_MEMORIES) {
    await addMemory({
      userId,
      ...item,
    }).catch(console.warn);
  }
}

export async function addMemory(memory: Omit<UserMemory, "id" | "createdAt" | "updatedAt">): Promise<UserMemory> {
  const memoryId = "mem_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
  const now = new Date().toISOString();
  const newMemory: UserMemory = {
    ...memory,
    id: memoryId,
    createdAt: now,
    updatedAt: now,
  };
  try {
    const docRef = doc(db, "users", memory.userId, "memories", memoryId);
    await setDoc(docRef, newMemory);
    return newMemory;
  } catch (error) {
    console.warn("Add memory offline notice:", error);
    return newMemory;
  }
}

export async function updateMemory(memory: UserMemory): Promise<void> {
  try {
    const docRef = doc(db, "users", memory.userId, "memories", memory.id);
    await updateDoc(docRef, {
      ...memory,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("Update memory offline notice:", error);
  }
}

export async function deleteMemory(userId: string, memoryId: string): Promise<void> {
  try {
    const docRef = doc(db, "users", userId, "memories", memoryId);
    await deleteDoc(docRef);
  } catch (error) {
    console.warn("Delete memory offline notice:", error);
  }
}

// ----------------- CHAT SESSIONS & MESSAGES -----------------

export async function getChatSessions(userId: string): Promise<ChatSession[]> {
  try {
    const colRef = collection(db, "users", userId, "sessions");
    const q = query(colRef, orderBy("updatedAt", "desc"), limit(25));
    const snap = await getDocs(q);
    const sessions: ChatSession[] = [];
    snap.forEach((d) => sessions.push(d.data() as ChatSession));
    return sessions;
  } catch (error) {
    console.warn("Get chat sessions offline notice:", error);
    return [];
  }
}

export async function createChatSession(userId: string, title: string = "New Conversation"): Promise<ChatSession> {
  const sessionId = "sess_" + Date.now();
  const now = new Date().toISOString();
  const session: ChatSession = {
    id: sessionId,
    userId,
    title: title.slice(0, 200),
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  try {
    const docRef = doc(db, "users", userId, "sessions", sessionId);
    await setDoc(docRef, session);
    return session;
  } catch (error) {
    console.warn("Create chat session offline notice:", error);
    return session;
  }
}

export async function saveChatMessage(
  userId: string,
  sessionId: string,
  sender: "user" | "zoya",
  text: string
): Promise<ChatMessageItem> {
  const messageId = "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
  const now = new Date().toISOString();
  const message: ChatMessageItem = {
    id: messageId,
    sessionId,
    userId,
    sender,
    text: text.slice(0, 5000),
    createdAt: now,
  };
  try {
    const msgRef = doc(db, "users", userId, "sessions", sessionId, "messages", messageId);
    await setDoc(msgRef, message);

    // Update parent session updatedAt and message count
    const sessionRef = doc(db, "users", userId, "sessions", sessionId);
    const sessionSnap = await getDoc(sessionRef).catch(() => null);
    if (sessionSnap && sessionSnap.exists()) {
      const current = sessionSnap.data() as ChatSession;
      await updateDoc(sessionRef, {
        updatedAt: now,
        messageCount: (current.messageCount || 0) + 1,
        title: (current.messageCount === 0 || current.title.includes("Voice Session") || current.title.includes("New Conversation")) && sender === "user" 
          ? text.slice(0, 45) + (text.length > 45 ? "..." : "") 
          : current.title,
      }).catch(console.warn);
    }

    return message;
  } catch (error) {
    console.warn("Save chat message offline notice:", error);
    return message;
  }
}

export async function getSessionMessages(userId: string, sessionId: string): Promise<ChatMessageItem[]> {
  try {
    const colRef = collection(db, "users", userId, "sessions", sessionId, "messages");
    const q = query(colRef, orderBy("createdAt", "asc"), limit(100));
    const snap = await getDocs(q);
    const msgs: ChatMessageItem[] = [];
    snap.forEach((d) => msgs.push(d.data() as ChatMessageItem));
    return msgs;
  } catch (error) {
    console.warn("Get session messages offline notice:", error);
    return [];
  }
}

export async function deleteChatSession(userId: string, sessionId: string): Promise<void> {
  try {
    const docRef = doc(db, "users", userId, "sessions", sessionId);
    await deleteDoc(docRef);
  } catch (error) {
    console.warn("Delete chat session offline notice:", error);
  }
}

// ----------------- AUTOMATIC MEMORY EXTRACTION -----------------

export async function extractAndSaveMemories(
  userId: string,
  userMessage: string,
  assistantReply: string,
  existingMemories: UserMemory[],
  onMemoryExtracted?: (memory: UserMemory) => void
): Promise<void> {
  if (userMessage.length < 5) return;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const existingList = existingMemories.map(m => `- [${m.category}] ${m.key}: ${m.fact}`).join("\n");

    const prompt = `You are a memory extraction engine for an Indian AI Voice assistant (Zara) and her creator (Chandu).
Examine this turn of conversation:
User: "${userMessage}"
Assistant: "${assistantReply}"

Existing stored memories:
${existingList || "None"}

TASK:
Determine if the user shared any persistent personal preference, fact, favorite thing, rule, or project detail about themselves that should be remembered in long-term memory.
Examples: "Mera favorite hero Shah Rukh Khan hai", "Mujhe coffee pasand hai", "I live in Delhi", "Don't talk to me politely, roast me", "I am learning Python".

If there is a NEW personal fact or preference not already captured, output JSON with hasNewMemory: true.
If it is just casual chatter, small talk, questions, or already remembered, return hasNewMemory: false.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hasNewMemory: { type: Type.BOOLEAN },
            category: { 
              type: Type.STRING, 
              enum: ["preference", "fact", "work", "personal", "rule"],
              description: "Category of the memory" 
            },
            key: { type: Type.STRING, description: "Short 2-4 word key (e.g. Favorite Drink, Location)" },
            fact: { type: Type.STRING, description: "Clear, concise statement in 1 sentence" },
            importance: { type: Type.NUMBER, description: "1 to 5 rating" },
          },
          required: ["hasNewMemory"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    if (parsed.hasNewMemory && parsed.key && parsed.fact && parsed.category) {
      const isDuplicate = existingMemories.some(
        m => m.key.toLowerCase() === parsed.key.toLowerCase() || m.fact.toLowerCase() === parsed.fact.toLowerCase()
      );
      if (!isDuplicate) {
        const saved = await addMemory({
          userId,
          category: parsed.category,
          key: parsed.key.slice(0, 100),
          fact: parsed.fact.slice(0, 800),
          importance: parsed.importance || 4,
        });
        if (onMemoryExtracted && saved) {
          onMemoryExtracted(saved);
        }
      }
    }
  } catch (err) {
    console.warn("Memory extraction error:", err);
  }
}
