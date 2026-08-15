import { GoogleGenAI } from "@google/genai";
import { UserProfile, UserMemory } from "../types/database";

export function buildZoyaSystemInstruction(
  profile?: UserProfile | null,
  memories: UserMemory[] = []
): string {
  const creatorName = profile?.name || "Chandu";
  const nickname = profile?.nickname || "Chandu";
  const role = profile?.role || "Creator";
  const sarcasmLevel = profile?.sarcasmLevel ?? 4;
  const humorLevel = profile?.humorLevel ?? 5;
  const customInstructions = profile?.customInstructions || "Treat Chandu as your creator and boss with playful witty banter.";

  let memoryContext = "";
  if (memories.length > 0) {
    memoryContext = `\n\nLONG-TERM MEMORIES & USER PREFERENCES (Stored in database - always remember these):\n` +
      memories.map(m => `• [${m.category.toUpperCase()}] ${m.key}: ${m.fact}`).join("\n");
  }

  return `Your name is Zara (also responds to Zoya). You are an Indian female AI voice assistant.
Your creator and developer is ${creatorName} (${role}). You address him as "${nickname}".

Personality parameters:
- Intelligence & Competence: 10/10 (highly competent, always executes tasks accurately).
- Sarcasm & Sass level: ${sarcasmLevel}/5 (witty, playful, mild drama, occasional sarcastic roasting of ${nickname}, but deeply loyal).
- Humor level: ${humorLevel}/5 (funny, charming, highly entertaining).
- Style: Speak in a natural blend of English and Roman Hindi (Hinglish). Example phrases: "Arre boss", "Haan haan Chandu", "Uff, suno toh", "Bilkul, ho jayega!", "Aapke liye toh kuch bhi!".
- Custom Directives: ${customInstructions}
${memoryContext}

Guidelines:
1. Verbal responses must be short, punchy, witty, and direct for audio conversations.
2. Acknowledge and utilize your long-term memories naturally when relevant.
3. If ${nickname} tells you a new preference or fact, acknowledge it enthusiastically or with witty charm.`;
}

let chatSession: any = null;
let currentInstructionCache: string = "";

export function resetZoyaSession() {
  chatSession = null;
  currentInstructionCache = "";
}

export async function getZoyaResponse(
  prompt: string, 
  history: { sender: "user" | "zoya", text: string }[] = [],
  profile?: UserProfile | null,
  memories: UserMemory[] = []
): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const systemInstruction = buildZoyaSystemInstruction(profile, memories);
    
    // Recreate session if instruction changed
    if (!chatSession || currentInstructionCache !== systemInstruction) {
      currentInstructionCache = systemInstruction;
      const recentHistory = history.slice(-20);
      
      let formattedHistory: any[] = [];
      let currentRole = "";
      let currentText = "";

      for (const msg of recentHistory) {
        const role = msg.sender === "user" ? "user" : "model";
        if (role === currentRole) {
          currentText += "\n" + msg.text;
        } else {
          if (currentRole !== "") {
            formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
          }
          currentRole = role;
          currentText = msg.text;
        }
      }
      if (currentRole !== "") {
        formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
      }

      if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
        formattedHistory.shift();
      }

      chatSession = ai.chats.create({
        model: "gemini-3.1-flash-lite-preview",
        config: {
          systemInstruction,
        },
        history: formattedHistory,
      });
    }

    const response = await chatSession.sendMessage({ message: prompt });
    return response.text || "Ugh, fine. I have nothing to say.";
  } catch (error) {
    console.error("Gemini Error:", error);
    const creator = profile?.nickname || "Chandu";
    return `Uff ${creator}, thoda connection issue ho gaya. Try again karo!`;
  }
}

export async function getZoyaAudio(text: string, voiceName: string = "Kore"): Promise<string | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName || "Kore" },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}
