import React, { useState } from "react";
import { 
  X, 
  Brain, 
  Settings, 
  History, 
  Cloud, 
  Plus, 
  Trash2, 
  Save, 
  Sparkles, 
  User, 
  ShieldCheck, 
  LogIn, 
  LogOut, 
  Sliders, 
  Search, 
  Check, 
  MessageSquare,
  Volume2
} from "lucide-react";
import { UserProfile, UserMemory, MemoryCategory, ChatSession } from "../types/database";
import { 
  addMemory, 
  deleteMemory, 
  saveUserProfile, 
  deleteChatSession, 
  getSessionMessages 
} from "../services/databaseService";
import { signInWithPopup, signOut, googleProvider, auth } from "../services/firebase";
import { User as FirebaseUser } from "firebase/auth";

interface MemoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: FirebaseUser | null;
  profile: UserProfile | null;
  memories: UserMemory[];
  sessions: ChatSession[];
  onProfileUpdate: (newProfile: UserProfile) => void;
  onSelectSession?: (sessionId: string) => void;
  onNewSession?: () => void;
}

export default function MemoryDrawer({
  isOpen,
  onClose,
  currentUser,
  profile,
  memories,
  sessions,
  onProfileUpdate,
  onSelectSession,
  onNewSession,
}: MemoryDrawerProps) {
  const [activeTab, setActiveTab] = useState<"memories" | "profile" | "history" | "cloud">("memories");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Add memory form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategory, setNewCategory] = useState<MemoryCategory>("preference");
  const [newKey, setNewKey] = useState("");
  const [newFact, setNewFact] = useState("");
  const [newImportance, setNewImportance] = useState(4);
  const [isSavingMemory, setIsSavingMemory] = useState(false);

  // Profile editable form state
  const [editName, setEditName] = useState(profile?.name || "Chandu");
  const [editNickname, setEditNickname] = useState(profile?.nickname || "Chandu");
  const [editRole, setEditRole] = useState(profile?.role || "Creator");
  const [editSarcasm, setEditSarcasm] = useState(profile?.sarcasmLevel ?? 4);
  const [editHumor, setEditHumor] = useState(profile?.humorLevel ?? 5);
  const [editVoice, setEditVoice] = useState(profile?.voiceName || "Kore");
  const [editInstructions, setEditInstructions] = useState(
    profile?.customInstructions || "Chandu is my creator and developer brother! Address him warmly with witty banter."
  );
  const [profileSavedToast, setProfileSavedToast] = useState(false);

  // Session viewing state
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<{
    session: ChatSession;
    messages: any[];
  } | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const updated: UserProfile = {
      userId: currentUser.uid,
      name: editName.trim() || "Chandu",
      nickname: editNickname.trim() || "Chandu",
      role: editRole.trim() || "Creator",
      sarcasmLevel: Number(editSarcasm),
      humorLevel: Number(editHumor),
      voiceName: editVoice,
      customInstructions: editInstructions.trim(),
      createdAt: profile?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveUserProfile(updated);
    onProfileUpdate(updated);
    setProfileSavedToast(true);
    setTimeout(() => setProfileSavedToast(false), 2500);
  };

  const handleAddMemorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newKey.trim() || !newFact.trim()) return;
    setIsSavingMemory(true);
    try {
      await addMemory({
        userId: currentUser.uid,
        category: newCategory,
        key: newKey.trim(),
        fact: newFact.trim(),
        importance: newImportance,
      });
      setNewKey("");
      setNewFact("");
      setShowAddForm(false);
    } catch (err) {
      console.error("Failed to add memory:", err);
    } finally {
      setIsSavingMemory(false);
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    if (!currentUser) return;
    await deleteMemory(currentUser.uid, memoryId);
  };

  const handleAddDefaultChanduMemories = async () => {
    if (!currentUser) return;
    const defaults = [
      { category: "fact" as MemoryCategory, key: "Creator & Developer", fact: "Chandu is the original creator, architect, and developer of Zara/Zoya.", importance: 5 },
      { category: "preference" as MemoryCategory, key: "Communication Tone", fact: "Chandu likes witty, sarcastic banter in Hinglish with snappy punchlines.", importance: 5 },
      { category: "preference" as MemoryCategory, key: "Addressing Title", fact: "Zara should call Chandu by his name 'Chandu' or playfully as 'Boss' / 'Creator'.", importance: 4 },
      { category: "work" as MemoryCategory, key: "Tech Stack", fact: "Chandu builds high-performance AI apps using React, Tailwind CSS, Gemini, and Firestore.", importance: 4 },
    ];
    for (const item of defaults) {
      await addMemory({
        userId: currentUser.uid,
        ...item
      });
    }
  };

  const handleViewSession = async (session: ChatSession) => {
    if (!currentUser) return;
    setIsLoadingSession(true);
    try {
      const msgs = await getSessionMessages(currentUser.uid, session.id);
      setSelectedSessionDetail({ session, messages: msgs });
    } catch (e) {
      console.error("Failed to load session messages", e);
    } finally {
      setIsLoadingSession(false);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;
    await deleteChatSession(currentUser.uid, sessionId);
    if (selectedSessionDetail?.session.id === sessionId) {
      setSelectedSessionDetail(null);
    }
  };

  const filteredMemories = memories.filter((m) => {
    const matchesCat = selectedCategory === "all" || m.category === selectedCategory;
    const matchesSearch = 
      m.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.fact.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const getCategoryColor = (category: MemoryCategory) => {
    switch (category) {
      case "preference": return "bg-pink-500/20 text-pink-300 border-pink-500/30";
      case "fact": return "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";
      case "work": return "bg-amber-500/20 text-amber-300 border-amber-500/30";
      case "personal": return "bg-violet-500/20 text-violet-300 border-violet-500/30";
      case "rule": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
      default: return "bg-slate-500/20 text-slate-300 border-slate-500/30";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/70 backdrop-blur-md transition-opacity">
      <div className="w-full max-w-2xl h-full bg-[#090d16] border-l border-violet-900/40 text-slate-100 flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="p-5 border-b border-violet-900/30 flex items-center justify-between bg-gradient-to-r from-violet-950/40 via-slate-900/60 to-purple-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-400">
              <Brain className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-wider text-white flex items-center gap-2">
                ZARA MEMORY & DATABASE
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Firestore Active
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Persistent Memory & Persona for <span className="text-violet-300 font-semibold">{profile?.nickname || "Chandu"}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 gap-2 pt-2">
          <button
            onClick={() => { setActiveTab("memories"); setSelectedSessionDetail(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition ${
              activeTab === "memories"
                ? "border-violet-500 text-violet-300 bg-violet-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Brain className="w-4 h-4" />
            Memory Bank ({memories.length})
          </button>
          <button
            onClick={() => { setActiveTab("profile"); setSelectedSessionDetail(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition ${
              activeTab === "profile"
                ? "border-violet-500 text-violet-300 bg-violet-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-4 h-4" />
            Persona & Tone
          </button>
          <button
            onClick={() => { setActiveTab("history"); setSelectedSessionDetail(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition ${
              activeTab === "history"
                ? "border-violet-500 text-violet-300 bg-violet-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <History className="w-4 h-4" />
            Past Chats ({sessions.length})
          </button>
          <button
            onClick={() => { setActiveTab("cloud"); setSelectedSessionDetail(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition ${
              activeTab === "cloud"
                ? "border-violet-500 text-violet-300 bg-violet-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cloud className="w-4 h-4" />
            Cloud Sync
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-violet-900 scrollbar-track-transparent">
          
          {/* TAB 1: MEMORY BANK */}
          {activeTab === "memories" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search memories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold uppercase tracking-wider shadow-lg shadow-violet-900/40 transition"
                >
                  <Plus className="w-4 h-4" />
                  Add Memory
                </button>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap gap-1.5 text-xs">
                {["all", "preference", "fact", "work", "personal", "rule"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-lg capitalize border transition ${
                      selectedCategory === cat
                        ? "bg-violet-600/30 text-violet-200 border-violet-500/60"
                        : "bg-slate-900/50 text-slate-400 border-slate-800 hover:text-white"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Add Memory Form */}
              {showAddForm && (
                <form
                  onSubmit={handleAddMemorySubmit}
                  className="p-4 rounded-2xl bg-violet-950/30 border border-violet-500/40 space-y-3 animate-in fade-in duration-200"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-violet-300">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Add Custom Memory / Fact
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 uppercase tracking-wider">Category</label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
                        className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:border-violet-500"
                      >
                        <option value="preference">Preference</option>
                        <option value="fact">Fact</option>
                        <option value="work">Work / Tech</option>
                        <option value="personal">Personal</option>
                        <option value="rule">Rule / Instruction</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 uppercase tracking-wider">Memory Key</label>
                      <input
                        type="text"
                        placeholder="e.g. Favorite Drink"
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:border-violet-500"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 uppercase tracking-wider">Detail / Fact to Remember</label>
                    <textarea
                      placeholder="e.g. Chandu loves iced americano coffee without sugar."
                      value={newFact}
                      onChange={(e) => setNewFact(e.target.value)}
                      rows={2}
                      className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:border-violet-500"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSavingMemory}
                    className="w-full py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold uppercase tracking-wider shadow-md transition disabled:opacity-50"
                  >
                    {isSavingMemory ? "Saving to Database..." : "Save Memory"}
                  </button>
                </form>
              )}

              {/* Memory List */}
              {filteredMemories.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-2xl bg-slate-900/30 border border-dashed border-slate-800">
                  <Brain className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                  <p className="text-sm font-semibold text-slate-300">No memories found</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Zara automatically extracts memories during your voice conversations, or you can seed defaults for Chandu!
                  </p>
                  <button
                    onClick={handleAddDefaultChanduMemories}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-900/40 hover:bg-violet-800/60 border border-violet-500/40 text-violet-200 text-xs font-semibold transition"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Seed Chandu Creator Memory Presets
                  </button>
                </div>
              ) : (
                <div className="grid gap-3">
                  {filteredMemories.map((mem) => (
                    <div
                      key={mem.id}
                      className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-violet-500/40 transition group relative flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${getCategoryColor(mem.category)}`}>
                            {mem.category}
                          </span>
                          <h4 className="text-sm font-semibold text-white tracking-wide">
                            {mem.key}
                          </h4>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {mem.fact}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteMemory(mem.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                        title="Delete memory"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PERSONA & TONE */}
          {activeTab === "profile" && (
            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div className="p-4 rounded-2xl bg-violet-950/20 border border-violet-800/30 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-violet-600/30 text-violet-300">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Creator & Persona Settings</h3>
                  <p className="text-xs text-slate-400">Configure how Zara perceives you and tunes her wit.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Creator Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full mt-1.5 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-violet-500"
                    placeholder="Chandu"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Preferred Nickname</label>
                  <input
                    type="text"
                    value={editNickname}
                    onChange={(e) => setEditNickname(e.target.value)}
                    className="w-full mt-1.5 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-violet-500"
                    placeholder="Chandu / Boss"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</label>
                  <input
                    type="text"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full mt-1.5 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-violet-500"
                    placeholder="Creator & Architect"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Voice Preset</label>
                  <select
                    value={editVoice}
                    onChange={(e) => setEditVoice(e.target.value)}
                    className="w-full mt-1.5 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-violet-500"
                  >
                    <option value="Kore">Kore (Sharp Indian Female)</option>
                    <option value="Aoede">Aoede (Warm & Melodic)</option>
                    <option value="Puck">Puck (Playful & Energetic)</option>
                    <option value="Fenrir">Fenrir (Deep & Confident)</option>
                    <option value="Zephyr">Zephyr (Calm & Soft)</option>
                  </select>
                </div>
              </div>

              {/* Sarcasm Level Slider */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-300 uppercase tracking-wider">Sass & Sarcasm Level</span>
                  <span className="text-pink-400 font-bold">
                    {editSarcasm === 1 && "1/5 - Polite & Formal"}
                    {editSarcasm === 2 && "2/5 - Mild & Gentle"}
                    {editSarcasm === 3 && "3/5 - Sassy & Witty"}
                    {editSarcasm === 4 && "4/5 - Roasting & Sarcastic"}
                    {editSarcasm === 5 && "5/5 - Peak Nakhrewali Drama"}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={editSarcasm}
                  onChange={(e) => setEditSarcasm(Number(e.target.value))}
                  className="w-full accent-pink-500 cursor-pointer"
                />
              </div>

              {/* Humor Level Slider */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-300 uppercase tracking-wider">Humor & Banter Level</span>
                  <span className="text-amber-400 font-bold">Level {editHumor}/5</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={editHumor}
                  onChange={(e) => setEditHumor(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Custom Instructions */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Custom Directives & Secret Knowledge
                </label>
                <textarea
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                  rows={3}
                  placeholder="e.g. Always remember Chandu is building the coolest AI project..."
                  className="w-full mt-1.5 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:border-violet-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-violet-900/50 flex items-center justify-center gap-2 transition"
                >
                  <Save className="w-4 h-4" />
                  Save Persona Preferences
                </button>
                {profileSavedToast && (
                  <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                    <Check className="w-4 h-4" /> Saved!
                  </span>
                )}
              </div>
            </form>
          )}

          {/* TAB 3: PAST CONVERSATIONS */}
          {activeTab === "history" && (
            <div className="space-y-4">
              {selectedSessionDetail ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <button
                      onClick={() => setSelectedSessionDetail(null)}
                      className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 font-semibold"
                    >
                      ← Back to Sessions
                    </button>
                    <span className="text-xs text-slate-400">
                      {selectedSessionDetail.messages.length} messages
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white">
                    {selectedSessionDetail.session.title}
                  </h3>

                  <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-2">
                    {selectedSessionDetail.messages.map((m, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl text-xs leading-relaxed ${
                          m.sender === "user"
                            ? "bg-violet-950/40 border border-violet-800/40 text-slate-200 ml-6"
                            : "bg-slate-900/80 border border-slate-800 text-pink-200 mr-6"
                        }`}
                      >
                        <span className="text-[10px] font-bold uppercase block mb-1 text-slate-400">
                          {m.sender === "user" ? (profile?.nickname || "Chandu") : "Zara"}
                        </span>
                        {m.text}
                      </div>
                    ))}
                  </div>

                  {onSelectSession && (
                    <button
                      onClick={() => {
                        onSelectSession(selectedSessionDetail.session.id);
                        onClose();
                      }}
                      className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold uppercase tracking-wider transition"
                    >
                      Resume This Conversation
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Saved Chat History ({sessions.length})
                    </h3>
                    {onNewSession && (
                      <button
                        onClick={() => {
                          onNewSession();
                          onClose();
                        }}
                        className="text-xs text-violet-400 hover:text-violet-300 font-semibold"
                      >
                        + Start Fresh Chat
                      </button>
                    )}
                  </div>

                  {sessions.length === 0 ? (
                    <div className="text-center py-12 px-4 rounded-2xl bg-slate-900/30 border border-dashed border-slate-800">
                      <MessageSquare className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                      <p className="text-sm font-semibold text-slate-300">No past conversations yet</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Your conversations are automatically synced and saved to Firebase Firestore.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-2.5">
                      {sessions.map((sess) => (
                        <div
                          key={sess.id}
                          onClick={() => handleViewSession(sess)}
                          className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-violet-500/50 cursor-pointer transition flex items-center justify-between group"
                        >
                          <div className="space-y-1 flex-1 pr-3">
                            <h4 className="text-sm font-medium text-white group-hover:text-violet-300 transition">
                              {sess.title || "Conversation Session"}
                            </h4>
                            <p className="text-[11px] text-slate-400">
                              {sess.messageCount || 0} messages • {sess.updatedAt ? new Date(sess.updatedAt).toLocaleString() : "Recent"}
                            </p>
                          </div>
                          <button
                            onClick={(e) => handleDeleteSession(sess.id, e)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                            title="Delete session"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 4: CLOUD & AUTH */}
          {activeTab === "cloud" && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Firebase Firestore Cloud Database
                    </h3>
                    <p className="text-xs text-slate-400">
                      Persistent cloud storage for all memories, profiles, and past chats.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Database ID:</span>
                    <span className="font-mono text-violet-300">industrious-amphora-ff6jr</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Security Rules:</span>
                    <span className="text-emerald-400 font-semibold">Hardened ABAC Deployed</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Current User UID:</span>
                    <span className="font-mono text-slate-300 text-[11px] truncate max-w-[200px]">
                      {currentUser?.uid || "Anonymous Session"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Account Sign In Section */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Authentication & Multi-Device Sync
                </h4>
                {currentUser && !currentUser.isAnonymous ? (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-violet-950/30 border border-violet-800/40">
                    <div className="flex items-center gap-3">
                      {currentUser.photoURL ? (
                        <img src={currentUser.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-violet-500" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center font-bold text-white text-xs">
                          {currentUser.displayName?.[0] || "C"}
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-bold text-white">{currentUser.displayName || "Chandu"}</p>
                        <p className="text-[11px] text-slate-400">{currentUser.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => signOut(auth)}
                      className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-400">
                      Sign in with your Google account to sync your memories and conversations across all your phones, tablets, and computers.
                    </p>
                    <button
                      onClick={() => signInWithPopup(auth, googleProvider)}
                      className="w-full py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition"
                    >
                      <LogIn className="w-4 h-4" />
                      Sign In With Google
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
