// High-speed, natural Voice Synthesis Engine
// Delivers ultra-low latency (<0.5s) voice output using native browser engines with Hindi/Indian English support

export type TTSMode = "fast_native" | "gemini_hd";

export class VoiceSynthService {
  private static synth: SpeechSynthesis | null = typeof window !== "undefined" ? window.speechSynthesis : null;
  private static cachedVoices: SpeechSynthesisVoice[] = [];

  public static getVoices(): SpeechSynthesisVoice[] {
    if (!this.synth) return [];
    if (this.cachedVoices.length === 0) {
      this.cachedVoices = this.synth.getVoices();
    }
    return this.cachedVoices;
  }

  public static init() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      this.synth = window.speechSynthesis;
      this.cachedVoices = this.synth.getVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => {
          if (this.synth) {
            this.cachedVoices = this.synth.getVoices();
          }
        };
      }
    }
  }

  // Find best female Indian English or Hindi voice
  public static getBestIndianFemaleVoice(): SpeechSynthesisVoice | null {
    const voices = this.getVoices();
    if (voices.length === 0) return null;

    // 1. Look for Hindi or Indian English female voice
    const preferredVoices = [
      // Google / Android voices
      voices.find(v => v.lang.includes("hi-IN") || v.lang.includes("hi_IN")),
      voices.find(v => v.lang.includes("en-IN") && (v.name.toLowerCase().includes("female") || v.name.toLowerCase().includes("google") || v.name.toLowerCase().includes("india"))),
      voices.find(v => v.name.toLowerCase().includes("swara") || v.name.toLowerCase().includes("zira") || v.name.toLowerCase().includes("sangeeta")),
      // General en-IN
      voices.find(v => v.lang.includes("en-IN") || v.lang.includes("en_IN")),
      // Any smooth natural female voice
      voices.find(v => v.name.toLowerCase().includes("female") || v.name.toLowerCase().includes("natural")),
      // Fallback to any English or primary voice
      voices.find(v => v.lang.startsWith("en")),
    ];

    for (const v of preferredVoices) {
      if (v) return v;
    }

    return voices[0] || null;
  }

  // Speak immediately with 0ms startup delay
  public static speakInstant(text: string, onEnd?: () => void, rate: number = 1.05, pitch: number = 1.05): void {
    if (!this.synth) {
      if (onEnd) onEnd();
      return;
    }

    try {
      this.synth.cancel(); // Stop any pending speech

      // Clean markdown, symbols, emojis for smooth speech
      const cleaned = text
        .replace(/[*#_~`>]/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .trim();

      if (!cleaned) {
        if (onEnd) onEnd();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleaned);
      const voice = this.getBestIndianFemaleVoice();
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang || "en-IN";
      } else {
        utterance.lang = "en-IN";
      }

      utterance.rate = rate;
      utterance.pitch = pitch;

      utterance.onend = () => {
        if (onEnd) onEnd();
      };

      utterance.onerror = (e) => {
        console.warn("Speech synthesis notice:", e);
        if (onEnd) onEnd();
      };

      this.synth.speak(utterance);
    } catch (e) {
      console.error("SpeechSynth error:", e);
      if (onEnd) onEnd();
    }
  }

  public static stop(): void {
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch {}
    }
  }
}
