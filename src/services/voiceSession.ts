import { UserProfile, UserMemory } from "../types/database";
import { getZoyaResponse, getZoyaAudio } from "./geminiService";
import { processCommand } from "./commandService";
import { playPCM } from "../utils/audioUtils";
import { VoiceSynthService } from "./voiceSynthService";

export type VoiceState = "idle" | "listening" | "processing" | "speaking";

export interface VoiceSessionCallbacks {
  onStateChange: (state: VoiceState) => void;
  onMessage: (sender: "user" | "zoya", text: string) => void;
  onCommand: (url: string) => void;
  onInterimTranscript?: (text: string) => void;
  onMemoryExtracted?: (userText: string, aiText: string) => void;
}

export class RobustVoiceSession {
  private recognition: any = null;
  private isRunning: boolean = false;
  private isSpeaking: boolean = false;
  public isMuted: boolean = false;
  public recognitionLang: string = "hi-IN"; // "hi-IN" accurately captures Hindi, English & Hinglish on modern browsers
  public ttsEngine: "fast_native" | "gemini_hd" = "fast_native"; // Default to instant ultra-fast response
  public profile: UserProfile | null = null;
  public memories: UserMemory[] = [];
  public messagesHistory: Array<{ id: string; sender: "user" | "zoya"; text: string }> = [];

  private callbacks: VoiceSessionCallbacks;
  private restartTimeout: any = null;
  private silenceTimer: any = null;
  private accumulatedTranscript: string = "";

  constructor(
    profile: UserProfile | null, 
    memories: UserMemory[], 
    callbacks: VoiceSessionCallbacks
  ) {
    this.profile = profile;
    this.memories = memories;
    this.callbacks = callbacks;
    VoiceSynthService.init();
  }

  public updateContext(profile: UserProfile | null, memories: UserMemory[]) {
    this.profile = profile;
    this.memories = memories;
  }

  public setLanguage(lang: string) {
    this.recognitionLang = lang;
    if (this.recognition && this.isRunning) {
      try {
        this.recognition.lang = lang;
      } catch {}
    }
  }

  public async start(): Promise<void> {
    this.isRunning = true;
    this.isSpeaking = false;
    this.initSpeechRecognition();
  }

  private initSpeechRecognition() {
    const SpeechRecognition = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("SpeechRecognition API not natively available on this browser.");
      throw new Error("SpeechRecognition not supported in this browser.");
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true; // Enables live streaming transcript
      this.recognition.lang = this.recognitionLang; 
      this.recognition.maxAlternatives = 1;

      this.recognition.onstart = () => {
        if (!this.isSpeaking && this.isRunning) {
          this.callbacks.onStateChange("listening");
        }
      };

      this.recognition.onresult = (event: any) => {
        if (this.isSpeaking) return;

        let interimText = "";
        let finalText = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalText += event.results[i][0].transcript;
          } else {
            interimText += event.results[i][0].transcript;
          }
        }

        const currentLive = (finalText || interimText).trim();
        if (currentLive) {
          this.accumulatedTranscript = currentLive;
          if (this.callbacks.onInterimTranscript) {
            this.callbacks.onInterimTranscript(currentLive);
          }

          // Smart Fast Silence Trigger (650ms debounce)
          // As soon as user finishes speaking, triggers response without 2-3 sec delay!
          if (this.silenceTimer) clearTimeout(this.silenceTimer);
          this.silenceTimer = setTimeout(() => {
            if (this.accumulatedTranscript.trim().length > 0 && !this.isSpeaking && this.isRunning) {
              const textToSend = this.accumulatedTranscript.trim();
              this.accumulatedTranscript = "";
              if (this.callbacks.onInterimTranscript) {
                this.callbacks.onInterimTranscript("");
              }
              this.handleUserUtterance(textToSend);
            }
          }, 700);
        }
      };

      this.recognition.onerror = (event: any) => {
        console.warn("Speech recognition event:", event.error);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          this.callbacks.onStateChange("idle");
          this.isRunning = false;
          return;
        }
        // For temporary network/no-speech errors, automatically keep session alive
        if (this.isRunning && !this.isSpeaking) {
          this.scheduleRestart(250);
        }
      };

      this.recognition.onend = () => {
        // Automatically restart speech recognition so the session NEVER auto-terminates!
        if (this.isRunning && !this.isSpeaking) {
          this.scheduleRestart(100);
        }
      };

      this.recognition.start();
      this.callbacks.onStateChange("listening");
    } catch (e) {
      console.error("Failed to start speech recognition", e);
      if (this.isRunning) {
        this.scheduleRestart(400);
      }
    }
  }

  private scheduleRestart(delayMs: number = 150) {
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    this.restartTimeout = setTimeout(() => {
      if (this.isRunning && !this.isSpeaking && this.recognition) {
        try {
          this.recognition.lang = this.recognitionLang;
          this.recognition.start();
          this.callbacks.onStateChange("listening");
        } catch {
          // If already started, ignore
        }
      }
    }, delayMs);
  }

  private async handleUserUtterance(transcript: string) {
    if (!transcript.trim()) return;

    // 1. Temporarily pause recognition while processing and speaking
    this.isSpeaking = true;
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    try {
      this.recognition?.stop();
    } catch {}

    this.callbacks.onStateChange("processing");
    this.callbacks.onMessage("user", transcript);
    this.messagesHistory.push({
      id: "u_" + Date.now(),
      sender: "user",
      text: transcript,
    });

    // 2. Check for local browser commands
    const commandResult = processCommand(transcript);
    let reply = "";

    if (commandResult.isBrowserAction) {
      reply = commandResult.action;
      this.callbacks.onMessage("zoya", reply);
      this.messagesHistory.push({
        id: "z_" + Date.now(),
        sender: "zoya",
        text: reply,
      });

      if (!this.isMuted) {
        this.callbacks.onStateChange("speaking");
        await this.speakResponse(reply);
      }

      if (commandResult.url) {
        setTimeout(() => {
          this.callbacks.onCommand(commandResult.url!);
        }, 600);
      }
    } else {
      // 3. Query Gemini with full profile & memories context (Ultra fast lite model)
      reply = await getZoyaResponse(
        transcript,
        this.messagesHistory,
        this.profile,
        this.memories
      );

      this.callbacks.onMessage("zoya", reply);
      this.messagesHistory.push({
        id: "z_" + Date.now(),
        sender: "zoya",
        text: reply,
      });

      // Trigger memory extraction in background without blocking voice
      if (this.callbacks.onMemoryExtracted) {
        this.callbacks.onMemoryExtracted(transcript, reply);
      }

      if (!this.isMuted) {
        this.callbacks.onStateChange("speaking");
        await this.speakResponse(reply);
      }
    }

    // 4. Resume listening instantly after audio finishes
    this.isSpeaking = false;
    this.accumulatedTranscript = "";
    if (this.isRunning) {
      this.scheduleRestart(80);
    } else {
      this.callbacks.onStateChange("idle");
    }
  }

  // Audio Playback with Instant Fast Native TTS or Gemini HD
  private async speakResponse(text: string): Promise<void> {
    if (this.ttsEngine === "fast_native") {
      // Instant Web Speech Synthesis (<0.1s latency)
      return new Promise<void>((resolve) => {
        VoiceSynthService.speakInstant(
          text,
          () => resolve(),
          1.08, // crisp natural pacing
          1.05  // energetic cheerful tone
        );
      });
    } else {
      // Gemini Studio HD PCM
      const audioBase64 = await getZoyaAudio(text, this.profile?.voiceName || "Kore");
      if (audioBase64) {
        await playPCM(audioBase64);
      } else {
        // Fallback to instant speech if HD audio fails
        return new Promise<void>((resolve) => {
          VoiceSynthService.speakInstant(text, () => resolve());
        });
      }
    }
  }

  public sendManualText(text: string) {
    if (!text.trim()) return;
    this.handleUserUtterance(text);
  }

  public stop() {
    this.isRunning = false;
    this.isSpeaking = false;
    this.accumulatedTranscript = "";
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.restartTimeout) clearTimeout(this.restartTimeout);
    VoiceSynthService.stop();
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.onerror = null;
        this.recognition.onresult = null;
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }
    this.callbacks.onStateChange("idle");
  }
}
