import React from "react";
import { Sparkles, Brain, CheckCircle } from "lucide-react";
import { UserMemory } from "../types/database";

interface MemoryToastProps {
  memory: UserMemory | null;
  onClose: () => void;
}

export default function MemoryToast({ memory, onClose }: MemoryToastProps) {
  if (!memory) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-bounce duration-300">
      <div className="bg-gradient-to-r from-violet-900/90 to-fuchsia-900/90 border border-violet-500/50 backdrop-blur-xl px-4 py-3 rounded-2xl shadow-2xl shadow-violet-950/80 flex items-center gap-3 max-w-md text-white">
        <div className="p-2 bg-violet-500/20 rounded-xl border border-violet-400/30 text-violet-300">
          <Brain className="w-5 h-5 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-300 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            New Memory Saved
          </div>
          <p className="text-sm font-medium text-slate-100 truncate">
            <span className="text-violet-300 font-semibold">{memory.key}:</span> {memory.fact}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-white px-2 py-1 bg-white/10 rounded-lg transition"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
