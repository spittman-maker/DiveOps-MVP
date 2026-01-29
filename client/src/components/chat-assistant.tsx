import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface Conversation {
  id: number;
  title: string;
  messages: Message[];
}

function getSavedConversationId(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem("diveops_conversation_id");
    return saved ? parseInt(saved) : null;
  } catch {
    return null;
  }
}

export function ChatAssistant({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!initialized) {
      const saved = getSavedConversationId();
      if (saved) setConversationId(saved);
      setInitialized(true);
    }
  }, [initialized]);

  const { data: conversation, refetch } = useQuery<Conversation>({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const res = await fetch(`/api/conversations/${conversationId}`, { credentials: "include" });
      if (!res.ok) {
        localStorage.removeItem("diveops_conversation_id");
        setConversationId(null);
        return null;
      }
      return res.json();
    },
    enabled: !!conversationId,
    refetchInterval: isStreaming ? false : 5000,
  });

  const createConversation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: "DiveOps Assistant" }),
      });
      if (!res.ok) throw new Error("Failed to create conversation");
      return res.json();
    },
    onSuccess: (data) => {
      setConversationId(data.id);
      localStorage.setItem("diveops_conversation_id", data.id.toString());
    },
  });

  useEffect(() => {
    if (isOpen && initialized && !conversationId) {
      createConversation.mutate();
    }
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, initialized, conversationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation?.messages, streamingContent]);

  const sendMessage = async () => {
    if (!input.trim() || !conversationId || isStreaming) return;

    const userMessage = input.trim();
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    // Optimistically add user message to UI
    queryClient.setQueryData(["conversation", conversationId], (old: Conversation | undefined) => {
      if (!old) return old;
      return {
        ...old,
        messages: [...old.messages, { id: Date.now(), role: "user" as const, content: userMessage, createdAt: new Date().toISOString() }]
      };
    });

    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: userMessage, userRole: user?.role }),
      });

      if (!response.ok) throw new Error("Failed to send message");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  fullContent += data.content;
                  setStreamingContent(fullContent);
                }
              } catch {}
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      refetch();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewChat = () => {
    const oldId = conversationId;
    if (typeof window !== 'undefined') {
      localStorage.removeItem("diveops_conversation_id");
    }
    setConversationId(null);
    if (oldId) {
      queryClient.removeQueries({ queryKey: ["conversation", oldId] });
    }
    createConversation.mutate();
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const target = e.target;
    target.style.height = "auto";
    target.style.height = Math.min(target.scrollHeight, 200) + "px";
    setInput(target.value);
  };

  if (!isOpen) return null;

  const messages = conversation?.messages || [];
  const allMessages = streamingContent
    ? [...messages, { id: -1, role: "assistant" as const, content: streamingContent, createdAt: "" }]
    : messages;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl h-[80vh] bg-[#212121] rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <h2 className="text-white font-semibold">DiveOps Assistant</h2>
              <p className="text-xs text-gray-400">Powered by GPT-4</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={startNewChat}
              className="text-gray-400 hover:text-white hover:bg-white/10 text-xs"
            >
              New Chat
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-gray-400 hover:text-white hover:bg-white/10 rounded-full w-8 h-8"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 overflow-auto" ref={scrollRef}>
          <div className="px-6 py-6 space-y-6">
            {allMessages.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">How can I help you today?</h3>
                <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
                  Ask me about dive operations, terminology, safety procedures, or Navy diving protocols.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {["What does L/S mean?", "Explain bottom time", "Navy dive tables"].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="px-3 py-2 text-sm text-gray-300 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                {user?.role === "GOD" && (
                  <p className="text-xs mt-6 text-amber-500/80">GOD mode enabled: You can also request app changes</p>
                )}
              </div>
            )}

            {allMessages.map((msg, i) => (
              <div key={msg.id || i} className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-sm font-medium ${
                  msg.role === "user" 
                    ? "bg-blue-600 text-white" 
                    : "bg-gradient-to-br from-teal-500 to-blue-600 text-white"
                }`}>
                  {msg.role === "user" ? (user?.fullName?.[0] || user?.username?.[0] || "U") : "AI"}
                </div>
                <div className={`flex-1 ${msg.role === "user" ? "text-right" : ""}`}>
                  <div className={`inline-block max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white text-left"
                      : "bg-[#2f2f2f] text-gray-100"
                  }`}>
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              </div>
            ))}

            {isStreaming && !streamingContent && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-gradient-to-br from-teal-500 to-blue-600 text-white text-sm font-medium">
                  AI
                </div>
                <div className="bg-[#2f2f2f] text-gray-400 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-white/10">
          <div className="relative flex items-end bg-[#2f2f2f] rounded-2xl border border-white/10 focus-within:border-white/20 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={autoResize}
              onKeyDown={handleKeyDown}
              placeholder="Message DiveOps..."
              rows={1}
              className="flex-1 px-4 py-3 bg-transparent text-white placeholder:text-gray-500 resize-none focus:outline-none text-[15px] max-h-[200px]"
              disabled={isStreaming}
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              size="icon"
              className={`m-2 rounded-full w-8 h-8 transition-all ${
                input.trim() && !isStreaming
                  ? "bg-white text-black hover:bg-gray-200"
                  : "bg-gray-600 text-gray-400 cursor-not-allowed"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </Button>
          </div>
          <p className="text-xs text-gray-500 text-center mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
