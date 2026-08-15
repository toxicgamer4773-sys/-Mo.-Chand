import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Mic, 
  MicOff, 
  Loader2, 
  Volume2, 
  VolumeX, 
  Keyboard, 
  Send, 
  Trash2, 
  Brain, 
  PlusCircle, 
  User as UserIcon,
  Sparkles,
  MessageSquare,
  Zap,
  Globe,
  Radio
} from "lucide-react";
import { getZoyaResponse, getZoyaAudio, resetZoyaSession } from "./services/geminiService";
import { processCommand } from "./services/commandService";
import { RobustVoiceSession, VoiceState } from "./services/voiceSession";
import { VoiceSynthService } from "./services/voiceSynthService";
import Visualizer from "./components/Visualizer";
import PermissionModal from "./components/PermissionModal";
import MemoryDrawer from "./components/MemoryDrawer";
import MemoryToast from "./components/MemoryToast";
import { playPCM } from "./utils/audioUtils";
import { motion, AnimatePresence } from "motion/react";
import { auth, onAuthStateChanged, signInAnonymously, User } from "./services/firebase";
import { 
  getUserProfile, 
  subscribeToMemories, 
  getChatSessions, 
  createChatSession, 
  saveChatMessage, 
  getSessionMessages, 
  extractAndSaveMemories,
  seedDefaultMemories
} from "./services/databaseService";
import { UserProfile, UserMemory, ChatSession } from "./types/database";

interface ChatMessage {
  id: string;
  sender: "user" | "zoya";
  text: string;
}

export default function App() {
  const [appState, setAppState] = useState<VoiceState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef(messages);
  const [isMuted, setIsMuted] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [showChatLog, setShowChatLog] = useState(false);
  
  // Real-time live voice feedback
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [speechLanguage, setSpeechLanguage] = useState<string>("hi-IN"); // hi-IN recognizes Hindi, Hinglish & English
  const [ttsMode, setTtsMode] = useState<"fast_native" | "gemini_hd">("fast_native"); // Default to ultra-fast

  // Firebase Database State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showMemoryDrawer, setShowMemoryDrawer] = useState(false);
  const [newlyExtractedMemory, setNewlyExtractedMemory] = useState<UserMemory | null>(null);

  const voiceSessionRef = useRef<RobustVoiceSession | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    VoiceSynthService.init();
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
    if (voiceSessionRef.current) {
      voiceSessionRef.current.messagesHistory = messages;
    }
  }, [messages]);

  // Keep VoiceSession context updated with latest profile & memories
  useEffect(() => {
    if (voiceSessionRef.current) {
      voiceSessionRef.current.updateContext(profile, memories);
      voiceSessionRef.current.isMuted = isMuted;
      voiceSessionRef.current.ttsEngine = ttsMode;
      voiceSessionRef.current.setLanguage(speechLanguage);
    }
  }, [profile, memories, isMuted, ttsMode, speechLanguage]);

  // 1. Initialize Firebase Auth and load user data
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        try {
          const userProf = await getUserProfile(user.uid);
          setProfile(userProf);
          
          const sessList = await getChatSessions(user.uid);
          setSessions(sessList);
          
          if (sessList.length > 0 && !currentSessionId) {
            setCurrentSessionId(sessList[0].id);
            const pastMsgs = await getSessionMessages(user.uid, sessList[0].id);
            if (pastMsgs.length > 0) {
              setMessages(pastMsgs.map(m => ({ id: m.id, sender: m.sender, text: m.text })));
            }
          } else if (!currentSessionId) {
            const newSess = await createChatSession(user.uid, "Voice Session with " + (userProf.nickname || "Chandu"));
            setCurrentSessionId(newSess.id);
            setSessions([newSess]);
          }
        } catch (e) {
          console.error("Error loading user profile or sessions:", e);
        }
      } else {
        signInAnonymously(auth).catch((err) => console.warn("Anonymous auth notice:", err));
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Subscribe to Long-Term Memories in Firestore
  useEffect(() => {
    if (!currentUser) return;
    const unsubMemories = subscribeToMemories(currentUser.uid, (updatedList) => {
      setMemories(updatedList);
    });
    return () => unsubMemories();
  }, [currentUser]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, appState]);

  // Start fresh chat session
  const handleStartNewSession = async () => {
    if (!currentUser) return;
    try {
      const title = `Chat with ${profile?.nickname || "Chandu"} - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const newSess = await createChatSession(currentUser.uid, title);
      setCurrentSessionId(newSess.id);
      setSessions((prev) => [newSess, ...prev]);
      setMessages([]);
      resetZoyaSession();
    } catch (e) {
      console.error("Failed to create new session:", e);
    }
  };

  // Resume a past session from drawer
  const handleSelectPastSession = async (sessionId: string) => {
    if (!currentUser) return;
    try {
      setCurrentSessionId(sessionId);
      const pastMsgs = await getSessionMessages(currentUser.uid, sessionId);
      setMessages(pastMsgs.map(m => ({ id: m.id, sender: m.sender, text: m.text })));
      resetZoyaSession();
    } catch (e) {
      console.error("Failed to switch session:", e);
    }
  };

  // Handle Text/Voice commands and save to Firestore
  const handleTextCommand = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) {
      setAppState("idle");
      return;
    }

    const userMsgId = Date.now().toString();
    setMessages((prev) => [...prev, { id: userMsgId, sender: "user", text: finalTranscript }]);
    
    // Save User message to Firestore
    if (currentUser && currentSessionId) {
      saveChatMessage(currentUser.uid, currentSessionId, "user", finalTranscript).catch(console.error);
    }

    setAppState("processing");

    // 1. Check for browser commands
    const commandResult = processCommand(finalTranscript);
    let responseText = "";

    if (commandResult.isBrowserAction) {
      responseText = commandResult.action;
      setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "zoya", text: responseText }]);
      
      if (currentUser && currentSessionId) {
        saveChatMessage(currentUser.uid, currentSessionId, "zoya", responseText).catch(console.error);
      }

      if (!isMuted) {
        setAppState("speaking");
        if (ttsMode === "fast_native") {
          VoiceSynthService.speakInstant(responseText, () => setAppState("idle"));
        } else {
          const audioBase64 = await getZoyaAudio(responseText, profile?.voiceName || "Kore");
          if (audioBase64) {
            await playPCM(audioBase64);
          }
          setAppState("idle");
        }
      } else {
        setAppState("idle");
      }

      setTimeout(() => {
        if (commandResult.url) {
          window.open(commandResult.url, "_blank");
        }
      }, 1200);
    } else {
      // 2. Chit-Chat via Gemini with dynamic memory context (Ultra-fast flash lite)
      responseText = await getZoyaResponse(
        finalTranscript, 
        messagesRef.current,
        profile,
        memories
      );

      setMessages((prev) => [...prev, { id: Date.now().toString() + "-z", sender: "zoya", text: responseText }]);
      
      if (currentUser && currentSessionId) {
        saveChatMessage(currentUser.uid, currentSessionId, "zoya", responseText).catch(console.error);
      }

      // 3. Auto-extract new facts or preferences into Firestore
      if (currentUser) {
        extractAndSaveMemories(
          currentUser.uid,
          finalTranscript,
          responseText,
          memories,
          (newMem) => {
            setNewlyExtractedMemory(newMem);
          }
        ).catch(console.error);
      }

      if (!isMuted) {
        setAppState("speaking");
        if (ttsMode === "fast_native") {
          VoiceSynthService.speakInstant(responseText, () => setAppState("idle"));
        } else {
          const audioBase64 = await getZoyaAudio(responseText, profile?.voiceName || "Kore");
          if (audioBase64) {
            await playPCM(audioBase64);
          }
          setAppState("idle");
        }
      } else {
        setAppState("idle");
      }
    }
  }, [isMuted, ttsMode, currentUser, currentSessionId, profile, memories]);

  useEffect(() => {
    return () => {
      if (voiceSessionRef.current) {
        voiceSessionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = async () => {
    if (isSessionActive) {
      setIsSessionActive(false);
      setLiveTranscript("");
      if (voiceSessionRef.current) {
        voiceSessionRef.current.stop();
        voiceSessionRef.current = null;
      }
      setAppState("idle");
      resetZoyaSession();
    } else {
      try {
        setIsSessionActive(true);
        resetZoyaSession();
        
        const session = new RobustVoiceSession(profile, memories, {
          onStateChange: (st) => setAppState(st),
          onInterimTranscript: (text) => setLiveTranscript(text),
          onMessage: (sender, text) => {
            setMessages((prev) => [...prev, { id: Date.now().toString() + "-" + sender, sender, text }]);
            if (currentUser && currentSessionId) {
              saveChatMessage(currentUser.uid, currentSessionId, sender, text).catch(console.error);
            }
          },
          onCommand: (url) => {
            setTimeout(() => {
              window.open(url, "_blank");
            }, 800);
          },
          onMemoryExtracted: (userText, aiText) => {
            if (currentUser) {
              extractAndSaveMemories(
                currentUser.uid,
                userText,
                aiText,
                memories,
                (newMem) => setNewlyExtractedMemory(newMem)
              ).catch(console.error);
            }
          }
        });

        session.isMuted = isMuted;
        session.ttsEngine = ttsMode;
        session.recognitionLang = speechLanguage;
        session.messagesHistory = messages;
        voiceSessionRef.current = session;
        await session.start();
      } catch (e) {
        console.error("Failed to start voice session:", e);
        setShowPermissionModal(true);
        setIsSessionActive(false);
        setAppState("idle");
      }
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    
    if (isSessionActive && voiceSessionRef.current) {
      voiceSessionRef.current.sendManualText(textInput);
    } else {
      handleTextCommand(textInput);
    }
    setTextInput("");
    setShowTextInput(false);
  };

  return (
    <div className="h-[100dvh] w-screen bg-[#050505] text-white flex flex-col items-center justify-between font-sans relative overflow-hidden m-0 p-0 select-none">
      {showPermissionModal && (
        <PermissionModal 
          onClose={() => setShowPermissionModal(false)} 
        />
      )}

      {/* Memory Drawer Modal */}
      <MemoryDrawer
        isOpen={showMemoryDrawer}
        onClose={() => setShowMemoryDrawer(false)}
        currentUser={currentUser}
        profile={profile}
        memories={memories}
        sessions={sessions}
        onProfileUpdate={(newProf) => setProfile(newProf)}
        onSelectSession={handleSelectPastSession}
        onNewSession={handleStartNewSession}
      />

      {/* Real-time memory toast */}
      <MemoryToast 
        memory={newlyExtractedMemory} 
        onClose={() => setNewlyExtractedMemory(null)} 
      />

      {/* Cinematic Background Gradients */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-violet-900/25 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-pink-900/20 blur-[120px] rounded-full" />
        <div className="absolute top-[40%] right-[30%] w-[35%] h-[35%] bg-cyan-900/15 blur-[100px] rounded-full" />
      </div>

      {/* Header */}
      <header className="absolute top-0 left-0 w-full flex justify-between items-center z-20 shrink-0 px-3 md:px-10 py-2.5 md:py-4 border-b border-white/5 bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-gradient-to-tr from-violet-600 via-fuchsia-600 to-pink-500 flex items-center justify-center font-bold text-sm md:text-base shadow-lg shadow-violet-900/50">
              Z
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-black animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 md:gap-2">
              <h1 className="text-sm md:text-xl font-bold tracking-wide text-white">Zara</h1>
              <span className="text-[9px] md:text-[10px] uppercase font-bold tracking-wider px-1.5 md:px-2 py-0.5 rounded-full bg-violet-950/80 text-violet-300 border border-violet-700/50">
                AI Voice
              </span>
            </div>
            <p className="text-[10px] md:text-[11px] text-slate-400 flex items-center gap-1">
              Assistant for <span className="text-violet-300 font-semibold">{profile?.nickname || "Chandu"}</span>
              <span className="text-slate-600 hidden sm:inline">•</span>
              <span className="text-emerald-400 hidden sm:inline">Online</span>
            </p>
          </div>
        </div>

        {/* Quick Toggles & Controls */}
        <div className="flex items-center gap-1.5 md:gap-2.5">
          {/* Language Selector */}
          <button
            onClick={() => setSpeechLanguage(prev => prev === "hi-IN" ? "en-IN" : "hi-IN")}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-[11px] font-medium transition"
            title="Switch Speech Recognition Language"
          >
            <Globe className="w-3.5 h-3.5 text-violet-400" />
            <span>{speechLanguage === "hi-IN" ? "🇮🇳 Hinglish" : "🇬🇧 English"}</span>
          </button>

          {/* Speed Mode Toggle */}
          <button
            onClick={() => setTtsMode(prev => prev === "fast_native" ? "gemini_hd" : "fast_native")}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition ${
              ttsMode === "fast_native"
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                : "bg-purple-500/15 border-purple-500/40 text-purple-300"
            }`}
            title={ttsMode === "fast_native" ? "Ultra-Fast Mode (<0.5s response)" : "Gemini HD Audio Mode"}
          >
            <Zap className={`w-3.5 h-3.5 ${ttsMode === "fast_native" ? "text-amber-400 fill-amber-400" : "text-purple-400"}`} />
            <span className="hidden sm:inline">{ttsMode === "fast_native" ? "⚡ 0s Lag" : "Studio HD"}</span>
          </button>

          {/* Memory Bank Button */}
          <button
            onClick={() => setShowMemoryDrawer(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-violet-950/60 hover:bg-violet-900/80 border border-violet-500/40 text-violet-200 text-xs font-semibold shadow-lg shadow-violet-950/60 transition group"
            title="Open Memory Bank"
          >
            <Brain className="w-3.5 h-3.5 text-violet-400 group-hover:rotate-12 transition-transform" />
            <span className="px-1 py-0.2 rounded-full bg-violet-600 text-[9px] text-white font-bold">
              {memories.length}
            </span>
          </button>

          {/* New Chat Session Button */}
          <button
            onClick={handleStartNewSession}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition border border-white/10"
            title="Start New Conversation"
          >
            <PlusCircle size={16} />
          </button>

          {/* Toggle Transcript */}
          <button
            onClick={() => setShowChatLog(!showChatLog)}
            className={`p-1.5 rounded-lg border transition ${
              showChatLog 
                ? "bg-violet-600/30 text-violet-200 border-violet-500" 
                : "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10"
            }`}
            title="Chat History"
          >
            <MessageSquare size={16} />
          </button>

          {/* Mute Button */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/10 text-slate-300"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX size={16} className="text-red-400" />
            ) : (
              <Volume2 size={16} />
            )}
          </button>
        </div>
      </header>

      {/* Main Content - Visualizer & Live Hearing Feedback */}
      <main className="absolute inset-0 flex flex-col items-center justify-center w-full h-full z-10 overflow-hidden pt-16 pb-28 px-4 pointer-events-none">
        
        {/* Center Visualizer */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
          <Visualizer state={appState} />
        </div>

        {/* Live Speech Recognition Feedback Bubble */}
        <div className="z-20 flex flex-col items-center gap-3 max-w-lg w-full px-4 mt-44">
          <AnimatePresence mode="wait">
            {/* Live transcript while user is speaking */}
            {isSessionActive && liveTranscript && (
              <motion.div
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="bg-violet-950/90 border border-violet-500/60 backdrop-blur-xl px-4 py-2.5 rounded-2xl shadow-xl shadow-violet-950/80 text-center flex items-center gap-2"
              >
                <Radio className="w-4 h-4 text-violet-400 animate-pulse shrink-0" />
                <span className="text-xs md:text-sm text-violet-100 font-medium italic">
                  "{liveTranscript}"
                </span>
              </motion.div>
            )}

            {/* State indicators */}
            {!liveTranscript && appState === "listening" && isSessionActive && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-violet-300/90 text-xs md:text-sm font-medium bg-black/40 px-3 py-1.5 rounded-full border border-violet-500/20 backdrop-blur-md"
              >
                <div className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />
                <span>Boliyee {profile?.nickname || "Chandu"}, Zara sun rahi hai...</span>
              </motion.div>
            )}

            {appState === "processing" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 text-cyan-300 text-xs md:text-sm font-medium bg-cyan-950/50 px-3.5 py-1.5 rounded-full border border-cyan-500/30 backdrop-blur-md shadow-lg shadow-cyan-950/50"
              >
                <Loader2 size={14} className="animate-spin text-cyan-400" />
                <span>Zara soch rahi hai...</span>
              </motion.div>
            )}

            {appState === "speaking" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 text-pink-300 text-xs md:text-sm font-medium bg-pink-950/50 px-3.5 py-1.5 rounded-full border border-pink-500/30 backdrop-blur-md shadow-lg shadow-pink-950/50"
              >
                <div className="w-2 h-2 rounded-full bg-pink-400 animate-ping" />
                <span>Zara bol rahi hai...</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </main>

      {/* Floating Chat History Overlay */}
      <AnimatePresence>
        {showChatLog && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="absolute bottom-32 right-4 md:right-10 w-[92vw] max-w-md max-h-[50vh] z-30 bg-[#090d16]/95 border border-violet-900/50 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden"
          >
            <div className="p-3 border-b border-violet-900/30 flex items-center justify-between bg-violet-950/40">
              <span className="text-xs font-bold text-violet-300 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5" />
                Live Conversation Log
              </span>
              <button 
                onClick={() => setShowChatLog(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
              {messages.length === 0 ? (
                <p className="text-center text-slate-500 py-6">No messages in current session yet.</p>
              ) : (
                messages.map((msg) => (
                  <div 
                    key={msg.id}
                    className={`p-2.5 rounded-xl ${
                      msg.sender === "user"
                        ? "bg-violet-900/30 border border-violet-700/40 text-slate-200 ml-6"
                        : "bg-pink-950/30 border border-pink-700/40 text-pink-100 mr-6"
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                      {msg.sender === "user" ? (profile?.nickname || "Chandu") : "Zara"}
                    </div>
                    {msg.text}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <footer className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center pb-5 md:pb-8 z-20 shrink-0 gap-3">
        <AnimatePresence>
          {showTextInput && (
            <motion.form 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onSubmit={handleTextSubmit}
              className="w-[90vw] max-w-md flex items-center gap-2 bg-[#0c1220]/90 border border-violet-500/30 rounded-full p-1.5 pl-4 backdrop-blur-xl shadow-2xl"
            >
              <input 
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={`Talk to Zara, ${profile?.nickname || "Chandu"}...`}
                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-slate-400 text-sm"
                autoFocus
              />
              <button 
                type="submit"
                disabled={!textInput.trim()}
                className="p-2 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 transition-colors text-white"
              >
                <Send size={16} />
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleListening}
            className={`
              group relative flex items-center gap-3 px-7 md:px-8 py-3.5 md:py-4 rounded-full font-semibold tracking-wide transition-all duration-300 shadow-2xl
              ${
                isSessionActive
                  ? "bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30 shadow-red-950/50"
                  : "bg-gradient-to-r from-violet-600/90 to-fuchsia-600/90 text-white border border-violet-400/40 hover:from-violet-500 hover:to-fuchsia-500 hover:scale-105 shadow-violet-950/80"
              }
            `}
          >
            {isSessionActive ? (
              <>
                <MicOff size={20} />
                <span>End Voice Session</span>
              </>
            ) : (
              <>
                <Mic size={20} className="group-hover:animate-bounce text-violet-200" />
                <span>Start Voice Session</span>
              </>
            )}
          </button>
          
          <button
            onClick={() => setShowTextInput(!showTextInput)}
            className={`p-3.5 md:p-4 rounded-full border transition-colors shadow-2xl ${
              showTextInput
                ? "bg-violet-600 text-white border-violet-400"
                : "bg-white/5 border-white/10 hover:bg-white/10 text-slate-300"
            }`}
            title="Type text message"
          >
            <Keyboard size={20} className="opacity-80" />
          </button>
        </div>
      </footer>
    </div>
  );
}
