import React, { useState, useEffect, useRef } from "react";
import { 
  X, 
  Trash2, 
  Copy, 
  Check, 
  Search, 
  MessageSquare, 
  Volume2, 
  Mic,
  ArrowDown, 
  Bot, 
  User as UserIcon,
  Clock,
  AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getZoyaAudio } from "../services/geminiService";
import { playPCM } from "../utils/audioUtils";

export interface ChatMessage {
  id: string;
  sender: "user" | "zoya";
  text: string;
  timestamp?: number;
  isVoice?: boolean;
}

interface ConversationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onClearHistory: () => void;
  onDeleteMessage?: (id: string) => void;
  onSendMessage?: (text: string) => void;
  isMuted?: boolean;
}

export default function ConversationDrawer({
  isOpen,
  onClose,
  messages,
  onClearHistory,
  onDeleteMessage,
  onSendMessage,
  isMuted = false,
}: ConversationDrawerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [allCopied, setAllCopied] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [quickInput, setQuickInput] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when opened or when messages update
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [isOpen, messages.length]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (showClearConfirm) {
          setShowClearConfirm(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, showClearConfirm]);

  const filteredMessages = messages.filter((m) =>
    m.text.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAll = () => {
    if (messages.length === 0) return;
    const formatted = messages
      .map((m) => {
        const timeStr = m.timestamp ? ` [${new Date(m.timestamp).toLocaleTimeString()}]` : "";
        const tag = m.sender === "user" ? "Kavya (User)" : "Zoya";
        return `[${tag}${timeStr}]: ${m.text}`;
      })
      .join("\n\n");
    navigator.clipboard.writeText(formatted);
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2000);
  };

  const handlePlayAudio = async (id: string, text: string) => {
    if (playingId) return;
    try {
      setPlayingId(id);
      const audioBase64 = await getZoyaAudio(text);
      if (audioBase64) {
        await playPCM(audioBase64);
      }
    } catch (err) {
      console.error("Failed to playback audio:", err);
    } finally {
      setPlayingId(null);
    }
  };

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim() || !onSendMessage) return;
    onSendMessage(quickInput.trim());
    setQuickInput("");
  };

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const formatMessageTime = (ts?: number) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div id="conversation-history-modal" className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop */}
          <motion.div
            id="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm cursor-pointer"
          />

          {/* Slide-out Drawer Panel */}
          <motion.aside
            id="conversation-drawer-panel"
            initial={{ x: "100%", opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.5 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="relative w-full max-w-lg h-full bg-[#09090f]/95 border-l border-white/10 shadow-2xl backdrop-blur-2xl flex flex-col z-10 text-white"
          >
            {/* Drawer Header */}
            <header className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-pink-600 p-0.5 shadow-lg shadow-violet-500/20 flex items-center justify-center">
                  <div className="w-full h-full bg-[#09090f] rounded-[10px] flex items-center justify-center">
                    <MessageSquare size={18} className="text-violet-400" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-base sm:text-lg text-white tracking-wide">
                      Conversation History
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-mono border border-violet-500/30">
                      {messages.length}
                    </span>
                  </div>
                  <p className="text-xs text-white/50">Voice & text dialogue log with Zoya</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {messages.length > 0 && (
                  <>
                    <button
                      id="drawer-copy-all-btn"
                      onClick={handleCopyAll}
                      title="Copy full transcript"
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors border border-white/10 text-xs flex items-center gap-1"
                    >
                      {allCopied ? (
                        <>
                          <Check size={14} className="text-emerald-400" />
                          <span className="text-emerald-400 hidden sm:inline text-xs font-mono">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span className="hidden sm:inline text-xs">Copy All</span>
                        </>
                      )}
                    </button>

                    <button
                      id="drawer-clear-history-btn"
                      onClick={() => setShowClearConfirm(true)}
                      title="Clear all conversation history"
                      className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/70 hover:text-red-400 transition-colors border border-white/10"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}

                <button
                  id="drawer-close-btn"
                  onClick={onClose}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors border border-white/10 ml-1"
                  aria-label="Close conversation drawer"
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            {/* Clear All Confirmation Banner */}
            <AnimatePresence>
              {showClearConfirm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-red-950/40 border-b border-red-500/30 px-4 py-3 shrink-0"
                >
                  <div className="flex items-center gap-2.5 mb-2 text-red-300 text-xs font-medium">
                    <AlertTriangle size={15} className="text-red-400 shrink-0" />
                    <span>Clear all conversation history permanently?</span>
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      id="drawer-cancel-clear-btn"
                      onClick={() => setShowClearConfirm(false)}
                      className="px-3 py-1 bg-white/10 hover:bg-white/15 text-white/80 rounded-lg text-xs font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      id="drawer-confirm-clear-btn"
                      onClick={() => {
                        onClearHistory();
                        setShowClearConfirm(false);
                      }}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium transition-colors shadow-sm shadow-red-500/30 flex items-center gap-1"
                    >
                      <Trash2 size={12} />
                      Yes, Clear All
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Search and Filters Bar */}
            {messages.length > 0 && (
              <div className="p-3 border-b border-white/5 bg-white/[0.01] shrink-0">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    id="history-search-input"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search voice & text logs..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-8 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.07] transition-all"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-0.5"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Scrollable Conversation Stream */}
            <div
              id="drawer-messages-container"
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
            >
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/40">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-violet-400/60">
                    <MessageSquare size={32} />
                  </div>
                  <h3 className="font-semibold text-white/80 text-base mb-1">No conversation yet</h3>
                  <p className="text-xs text-white/40 max-w-xs leading-relaxed">
                    Speak via microphone or type a message below. All voice audio and text dialogue with Zoya are saved here in real-time.
                  </p>
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/40">
                  <Search size={28} className="mb-2 opacity-50" />
                  <p className="text-sm font-medium text-white/70">No matching messages</p>
                  <p className="text-xs text-white/40 mt-1">
                    Try searching for different keywords or clear your query.
                  </p>
                  <button
                    onClick={() => setSearchTerm("")}
                    className="mt-3 px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-violet-300 hover:bg-white/10 transition-colors"
                  >
                    Reset filter
                  </button>
                </div>
              ) : (
                filteredMessages.map((msg, index) => {
                  const isUser = msg.sender === "user";
                  const timeStr = formatMessageTime(msg.timestamp);
                  const isVoiceMsg = msg.isVoice || msg.id.includes("voice");

                  return (
                    <motion.div
                      key={msg.id || index}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className={`flex flex-col ${isUser ? "items-end" : "items-start"} group relative`}
                    >
                      {/* Sender Tag & Metadata */}
                      <div className="flex items-center gap-2 mb-1 px-1">
                        {!isUser && (
                          <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-violet-500 to-pink-500 flex items-center justify-center text-[9px] font-bold text-white shadow-sm">
                            Z
                          </div>
                        )}
                        <span className="text-[11px] font-medium tracking-wide text-white/60">
                          {isUser ? "Kavya" : "Zoya"}
                        </span>
                        {isVoiceMsg && (
                          <span className="flex items-center gap-0.5 text-[9px] text-violet-300/80 bg-violet-500/10 px-1.5 py-0.2 rounded font-mono border border-violet-500/20">
                            <Mic size={9} /> Voice
                          </span>
                        )}
                        {timeStr && (
                          <span className="text-[10px] text-white/30 font-mono flex items-center gap-0.5">
                            <Clock size={9} /> {timeStr}
                          </span>
                        )}
                        {isUser && (
                          <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px] text-white/70">
                            <UserIcon size={10} />
                          </div>
                        )}
                      </div>

                      {/* Message Bubble Container */}
                      <div
                        className={`relative max-w-[88%] sm:max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed transition-all shadow-md ${
                          isUser
                            ? "bg-gradient-to-br from-violet-600/90 to-purple-700/90 text-white rounded-tr-sm border border-violet-400/20"
                            : "bg-white/[0.06] text-white/95 rounded-tl-sm border border-white/10 backdrop-blur-md hover:border-violet-500/30"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>

                        {/* Quick Message Actions */}
                        <div
                          className={`mt-1.5 pt-1.5 flex items-center justify-between gap-2 text-[11px] border-t ${
                            isUser ? "border-white/15 text-white/70" : "border-white/5 text-white/40"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleCopyMessage(msg.id || String(index), msg.text)}
                              title="Copy message"
                              className="flex items-center gap-1 hover:text-white transition-colors"
                            >
                              {copiedId === (msg.id || String(index)) ? (
                                <>
                                  <Check size={11} className="text-emerald-300" />
                                  <span className="text-[10px] text-emerald-300">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={11} />
                                  <span className="text-[10px]">Copy</span>
                                </>
                              )}
                            </button>

                            {!isUser && (
                              <button
                                onClick={() => handlePlayAudio(msg.id || String(index), msg.text)}
                                title="Listen to this response"
                                disabled={playingId === (msg.id || String(index))}
                                className="flex items-center gap-1 hover:text-cyan-300 transition-colors disabled:opacity-50"
                              >
                                <Volume2
                                  size={11}
                                  className={playingId === (msg.id || String(index)) ? "animate-pulse text-cyan-300" : ""}
                                />
                                <span className="text-[10px]">
                                  {playingId === (msg.id || String(index)) ? "Playing..." : "Speak"}
                                </span>
                              </button>
                            )}
                          </div>

                          {/* Delete individual message button */}
                          {onDeleteMessage && (
                            <button
                              id={`delete-msg-${msg.id || index}`}
                              onClick={() => onDeleteMessage(msg.id || String(index))}
                              title="Delete this message"
                              className="p-1 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-80 group-hover:opacity-100"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>

            {/* Scroll-to-bottom Floating Button */}
            {messages.length > 5 && (
              <div className="absolute right-6 bottom-20 z-20">
                <button
                  onClick={scrollToBottom}
                  title="Scroll to latest"
                  className="p-2 rounded-full bg-violet-600/80 hover:bg-violet-600 text-white shadow-lg backdrop-blur-sm border border-violet-400/30 transition-all hover:scale-105"
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            )}

            {/* Quick Reply Bar in Drawer */}
            {onSendMessage && (
              <footer className="p-3 sm:p-4 border-t border-white/10 bg-white/[0.02] shrink-0">
                <form onSubmit={handleQuickSubmit} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={quickInput}
                    onChange={(e) => setQuickInput(e.target.value)}
                    placeholder="Send a message to Zoya..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.08] transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!quickInput.trim()}
                    className="px-3.5 py-2 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-40 disabled:pointer-events-none rounded-xl text-xs sm:text-sm font-medium text-white transition-all shadow-md shadow-violet-500/20"
                  >
                    Send
                  </button>
                </form>
              </footer>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
