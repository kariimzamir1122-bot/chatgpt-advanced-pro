
import React, { useState, useEffect, useRef } from 'react';
import { ASSISTANTS, EXPLORE_TOOLS, TRENDING_PROMPTS } from './constants';
import { Assistant, AssistantId, Chat, Message, Tone, Format, UserProfile } from './types';
import { gemini } from './services/geminiService';
import { 
  Home, 
  MessageSquare, 
  Compass, 
  User, 
  Plus, 
  Send, 
  Image as ImageIcon, 
  Paperclip, 
  Mic, 
  ChevronRight, 
  Search,
  Settings,
  ShieldCheck,
  Star,
  Trash2,
  Copy,
  RotateCcw,
  Menu,
  X,
  Sparkles,
  Zap,
  TrendingUp,
  AlertCircle,
  MoreVertical,
  Volume2,
  FileText,
  FileCode,
  ArrowRight
} from 'lucide-react';

// Dynamic import for PDF support
const loadPdfJs = async () => {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjs.version}/build/pdf.worker.mjs`;
  return pdfjs;
};

// Minimal Card Component
const MinimalCard: React.FC<{ children: React.ReactNode, className?: string, onClick?: () => void }> = ({ children, className, onClick }) => (
  <div 
    onClick={onClick} 
    className={`bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-5 transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-900/60 cursor-pointer group ${className}`}
  >
    {children}
  </div>
);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'home' | 'chats' | 'explore' | 'profile'>('home');
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [user, setUser] = useState<UserProfile>({
    name: 'Alex Johnson',
    photo: 'https://i.pravatar.cc/150?u=premium_user',
    language: 'English',
    isPro: false,
    messageCount: 5
  });
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedTone, setSelectedTone] = useState<Tone | undefined>();
  const [selectedFormat, setSelectedFormat] = useState<Format | undefined>();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ name: string, content: string, type: string } | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedChats = localStorage.getItem('chat_history_pro');
    if (savedChats) setChats(JSON.parse(savedChats));
    const savedUser = localStorage.getItem('user_profile_pro');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  useEffect(() => {
    localStorage.setItem('chat_history_pro', JSON.stringify(chats));
    localStorage.setItem('user_profile_pro', JSON.stringify(user));
  }, [chats, user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' });
    }
  }, [chats, currentChatId, isTyping]);

  const activeChat = chats.find(c => c.id === currentChatId);
  const activeAssistant = activeChat ? ASSISTANTS.find(a => a.id === activeChat.assistantId) : null;

  const resetFileState = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetImageState = () => {
    setSelectedImage(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const startNewChat = (assistantId: AssistantId, initialText?: string) => {
    const newChat: Chat = {
      id: Date.now().toString(),
      assistantId,
      title: initialText ? initialText.slice(0, 30) : 'New Conversation',
      messages: [],
      updatedAt: Date.now()
    };
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    setActiveTab('chats');
    if (initialText) {
      setTimeout(() => handleSendMessage(initialText, newChat.id), 100);
    }
  };

  const handleSendMessage = async (forcedText?: string, forcedChatId?: string) => {
    const targetChatId = forcedChatId || currentChatId;
    const textToSend = (forcedText || inputText).trim();
    const imageToSend = selectedImage;
    const fileToSend = selectedFile;

    if ((!textToSend && !imageToSend && !fileToSend) || !targetChatId) return;
    
    if (!user.isPro && user.messageCount >= 20) {
      setShowPaywall(true);
      return;
    }

    let finalPrompt = textToSend;
    if (fileToSend) {
      finalPrompt = `[Attached File: ${fileToSend.name}]\n---\n${fileToSend.content}\n---\nUser Query: ${textToSend || "Please analyze this document."}`;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend || (fileToSend ? `Analyzing ${fileToSend.name}...` : "Analyzing image..."),
      timestamp: Date.now(),
      attachment: imageToSend ? { type: 'image', url: imageToSend } : (fileToSend ? { type: 'file', url: '#', name: fileToSend.name } : undefined)
    };

    setChats(prev => prev.map(c => {
      if (c.id === targetChatId) {
        return { 
          ...c, 
          messages: [...c.messages, userMsg],
          updatedAt: Date.now(),
          title: c.messages.length === 0 ? (textToSend || fileToSend?.name || 'New Chat').slice(0, 30) : c.title
        };
      }
      return c;
    }));

    setInputText('');
    resetImageState();
    resetFileState();
    setIsTyping(true);
    setUser(prev => ({ ...prev, messageCount: prev.messageCount + 1 }));

    try {
      const chat = chats.find(c => c.id === targetChatId) || { messages: [userMsg], assistantId: ASSISTANTS[0].id };
      const assistant = ASSISTANTS.find(a => a.id === chat.assistantId)!;
      const historyForApi = [...chat.messages, { ...userMsg, content: finalPrompt }];

      const aiResponse = await gemini.generateResponse(
        historyForApi, 
        assistant.systemPrompt, 
        { tone: selectedTone, format: selectedFormat, image: imageToSend || undefined }
      );

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse,
        timestamp: Date.now()
      };

      setChats(prev => prev.map(c => {
        if (c.id === targetChatId) {
          return { ...c, messages: [...c.messages, assistantMsg], updatedAt: Date.now() };
        }
        return c;
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  };

  const startVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert("Voice input not supported.");
      return;
    }
    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = (event: any) => {
      setInputText(event.results[0][0].transcript);
    };
    recognition.start();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsExtracting(true);
    try {
      if (file.type === 'application/pdf') {
        const pdfjs = await loadPdfJs();
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        }
        setSelectedFile({ name: file.name, content: fullText, type: 'pdf' });
      } else {
        const text = await file.text();
        setSelectedFile({ name: file.name, content: text, type: 'txt' });
      }
    } catch (err) { alert("Error reading file."); } finally { setIsExtracting(false); }
  };

  const renderHome = () => (
    <div className="flex-1 overflow-y-auto w-full px-6 pt-12 pb-32 max-w-4xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-light text-zinc-100 tracking-tight">Intelligence Center</h1>
        <p className="text-zinc-500 text-sm mt-2">Ready to assist with specialized expert models.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-16">
        {ASSISTANTS.map(ass => (
          <MinimalCard key={ass.id} onClick={() => startNewChat(ass.id)} className="flex items-center gap-5">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br ${ass.color} text-xl shrink-0`}>
              {ass.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-zinc-100">{ass.name}</h3>
              <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{ass.description}</p>
            </div>
            <ChevronRight size={16} className="text-zinc-700" />
          </MinimalCard>
        ))}
      </div>

      <div className="space-y-4">
        <h2 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em]">Quick Prompts</h2>
        <div className="flex flex-wrap gap-2">
          {TRENDING_PROMPTS.map((p, i) => (
            <button 
              key={i} 
              onClick={() => startNewChat('chatgpt', p)}
              className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-all"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderChats = () => {
    if (currentChatId) {
      return (
        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          <header className="h-16 border-b border-zinc-900 flex items-center px-6 gap-3 bg-zinc-950/50 backdrop-blur-xl z-20">
            <button onClick={() => setCurrentChatId(null)} className="p-2 text-zinc-500 hover:text-zinc-200 transition-colors"><X size={20} /></button>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br ${activeAssistant?.color} text-sm shrink-0`}>
              {activeAssistant?.icon}
            </div>
            <div className="flex-1 truncate">
              <h3 className="text-sm font-semibold text-zinc-100">{activeAssistant?.name}</h3>
            </div>
            <button className="p-2 text-zinc-500 hover:text-zinc-200 transition-colors"><MoreVertical size={20} /></button>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 pb-48 scroll-smooth">
            {activeChat?.messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center opacity-20 pt-20">
                    <Sparkles size={48} className="mb-4" />
                    <p className="text-sm font-medium">Ask {activeAssistant?.name} anything.</p>
                </div>
            )}
            {activeChat?.messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl p-5 ${
                  m.role === 'user' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/10' : 'bg-zinc-900 border border-zinc-800 text-zinc-100'
                }`}>
                  {m.attachment?.type === 'image' && <img src={m.attachment.url} className="mb-4 rounded-xl border border-white/5 w-full object-cover max-h-80" />}
                  {m.attachment?.type === 'file' && (
                    <div className="mb-4 p-3 bg-black/30 rounded-lg flex items-center gap-3 border border-white/5">
                      <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400"><FileText size={18} /></div>
                      <span className="text-xs font-medium truncate">{m.attachment.name}</span>
                    </div>
                  )}
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  <div className="mt-3 text-[9px] opacity-30 font-bold uppercase tracking-widest">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex gap-1.5">
                  <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce delay-100"></div>
                  <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            )}
          </div>

          {/* Floating Input Area */}
          <div className="absolute bottom-8 left-0 right-0 px-6 z-30">
            <div className="max-w-3xl mx-auto">
              <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar pb-1">
                {selectedImage && (
                  <div className="relative group animate-in zoom-in duration-200 shrink-0">
                    <img src={selectedImage} className="w-14 h-14 object-cover rounded-xl border border-zinc-700 shadow-lg" />
                    <button 
                      onClick={resetImageState} 
                      className="absolute -top-1.5 -right-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full p-1 shadow-2xl border border-zinc-600 transition-colors"
                      title="Clear image"
                    >
                      <X size={10} />
                    </button>
                  </div>
                )}
                {selectedFile && (
                  <div className="bg-zinc-900 border border-zinc-800 pl-3 pr-1 py-1 rounded-full flex items-center gap-2 animate-in slide-in-from-left-2 duration-200 shrink-0 shadow-lg">
                    <FileCode size={14} className="text-indigo-400" />
                    <span className="text-[10px] font-bold text-zinc-300 truncate max-w-[120px]">{selectedFile.name}</span>
                    <button 
                      onClick={resetFileState} 
                      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 rounded-full p-1.5 transition-colors"
                      title="Clear file"
                      aria-label="Remove attachment"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
                {(selectedFile || selectedImage) && (
                  <button 
                    onClick={() => { resetFileState(); resetImageState(); }}
                    className="px-3 py-1 text-[9px] font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors whitespace-nowrap"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="bg-zinc-900/80 backdrop-blur-3xl border border-zinc-800 rounded-3xl p-2 flex items-center gap-1 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] focus-within:border-zinc-600 transition-all">
                <button onClick={() => imageInputRef.current?.click()} className="p-3 text-zinc-500 hover:text-zinc-200 transition-colors"><ImageIcon size={20} /></button>
                <button onClick={() => fileInputRef.current?.click()} className="p-3 text-zinc-500 hover:text-zinc-200 transition-colors"><Paperclip size={20} /></button>
                <textarea 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Ask ${activeAssistant?.name || "anything"}...`}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-3 px-2 resize-none max-h-32 placeholder:text-zinc-600"
                  rows={1}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                />
                <button onClick={startVoiceInput} className={`p-3 transition-colors ${isRecording ? 'text-red-500 animate-pulse' : 'text-zinc-500 hover:text-zinc-200'}`}><Mic size={20} /></button>
                <button 
                  onClick={() => handleSendMessage()} 
                  disabled={!inputText.trim() && !selectedImage && !selectedFile} 
                  className="p-3.5 bg-zinc-100 text-zinc-950 rounded-2xl disabled:opacity-20 transition-all active:scale-90 hover:bg-white"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
            <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = () => setSelectedImage(reader.result as string);
                reader.readAsDataURL(file);
              }
            }} />
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-y-auto w-full px-6 pt-12 pb-32 max-w-4xl mx-auto">
        <h2 className="text-xl font-light text-zinc-100 mb-8">Recent Dialogs</h2>
        <div className="space-y-4">
          {chats.length > 0 ? chats.map(c => (
            <MinimalCard key={c.id} className="flex items-center gap-5 py-4" onClick={() => setCurrentChatId(c.id)}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br ${ASSISTANTS.find(a => a.id === c.assistantId)?.color} text-lg shrink-0`}>
                {ASSISTANTS.find(a => a.id === c.assistantId)?.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100 truncate">{c.title}</p>
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-1">{new Date(c.updatedAt).toLocaleDateString()} • {c.messages.length} messages</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setChats(p => p.filter(ch => ch.id !== c.id)); }} className="p-2 text-zinc-800 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button>
            </MinimalCard>
          )) : <div className="text-center py-20 text-zinc-700 italic text-sm">No recent conversations.</div>}
        </div>
      </div>
    );
  };

  const renderProfile = () => (
    <div className="flex-1 overflow-y-auto w-full px-6 pt-12 pb-32 max-w-2xl mx-auto">
      <div className="flex flex-col items-center text-center">
        <div className="relative group">
            <div className="w-24 h-24 rounded-full border border-zinc-800 p-1.5 bg-zinc-900 group-hover:border-zinc-600 transition-colors">
                <img src={user.photo} className="w-full h-full rounded-full object-cover grayscale transition-all duration-500 group-hover:grayscale-0" />
            </div>
            {user.isPro && <div className="absolute -bottom-1 -right-1 bg-zinc-100 text-zinc-950 p-1 rounded-full border-2 border-zinc-950"><Zap size={14} fill="currentColor" /></div>}
        </div>
        <h2 className="text-2xl font-light mt-6 text-zinc-100 tracking-tight">{user.name}</h2>
        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mt-2">{user.isPro ? 'Platinum Member' : 'Standard Tier'}</p>
        {!user.isPro && (
          <button onClick={() => setShowPaywall(true)} className="mt-8 px-10 py-4 bg-zinc-100 text-zinc-950 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-white transition-all transform active:scale-95 shadow-xl shadow-white/5">
            Upgrade Account
          </button>
        )}
      </div>

      <div className="mt-16 space-y-3">
        {[
          { label: 'Security & Keys', icon: ShieldCheck, desc: 'API and encryption' },
          { label: 'Preferences', icon: Settings, desc: 'Language and theme' },
          { label: 'Chat Logs', icon: RotateCcw, desc: 'History management' }
        ].map((item, i) => (
          <div key={i} className="flex items-center justify-between p-5 bg-zinc-900/30 border border-zinc-800 rounded-xl hover:bg-zinc-800/50 cursor-pointer transition-all group">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-zinc-900 rounded-lg text-zinc-500 group-hover:text-zinc-200 transition-colors"><item.icon size={18} /></div>
              <div>
                  <span className="text-sm font-medium text-zinc-200">{item.label}</span>
                  <p className="text-[9px] font-bold text-zinc-700 uppercase tracking-tighter mt-0.5">{item.desc}</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-zinc-700 group-hover:text-zinc-400 transition-colors" />
          </div>
        ))}
      </div>
      <div className="mt-12 text-center">
          <p className="text-[9px] font-bold text-zinc-800 uppercase tracking-[0.4em]">OmniAI Pro Build 4.8</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-300 font-sans p-0 md:p-6 overflow-hidden selection:bg-indigo-500/20">
      {/* Detached Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-72 bg-zinc-950 p-8 border-r border-zinc-900/50">
        <div className="flex items-center gap-3 mb-16 px-2">
          <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center font-black text-zinc-950 text-xl shadow-2xl">O</div>
          <span className="font-bold tracking-widest text-zinc-100 uppercase text-[10px]">OmniAI Pro</span>
        </div>
        
        <nav className="space-y-2 flex-1">
          {[
            { id: 'home', icon: Home, label: 'Discover' },
            { id: 'chats', icon: MessageSquare, label: 'History' },
            { id: 'explore', icon: Compass, label: 'Lab' },
            { id: 'profile', icon: User, label: 'Account' }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id as any); setCurrentChatId(null); }}
              className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest ${
                activeTab === item.id && !currentChatId ? 'bg-zinc-900 text-zinc-100 border border-zinc-800/50 shadow-lg' : 'text-zinc-500 border border-transparent hover:text-zinc-200'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto border-t border-zinc-900 pt-8 px-2">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">Usage</span>
            <span className="text-[10px] text-zinc-300 font-black">{user.messageCount}/20</span>
          </div>
          <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
            <div className="h-full bg-zinc-700 transition-all duration-1000" style={{ width: `${Math.min((user.messageCount / 20) * 100, 100)}%` }}></div>
          </div>
          <p className="mt-3 text-[8px] font-black text-zinc-800 uppercase tracking-widest">Enterprise Edition</p>
        </div>
      </aside>

      {/* Floating Main Main Pane */}
      <main className="flex-1 flex flex-col relative overflow-hidden md:ml-6 bg-zinc-950 md:bg-zinc-900/20 md:border border-zinc-900/50 md:rounded-[2.5rem] shadow-2xl">
        {/* Mobile Header (Only on small screens) */}
        <header className="md:hidden h-16 border-b border-zinc-900 flex items-center justify-between px-6 bg-zinc-950/50 backdrop-blur-xl z-20">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-zinc-500 hover:text-zinc-200 transition-colors"><Menu size={24} /></button>
          <div className="font-bold tracking-[0.2em] text-zinc-100 uppercase text-[10px]">OmniAI</div>
          <button onClick={() => setActiveTab('profile')} className="w-9 h-9 rounded-full border border-zinc-800 overflow-hidden grayscale"><img src={user.photo} /></button>
        </header>

        {activeTab === 'home' && renderHome()}
        {activeTab === 'chats' && renderChats()}
        {activeTab === 'profile' && renderProfile()}
        {activeTab === 'explore' && (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-zinc-700 gap-4 opacity-50">
                <Compass size={40} />
                <p className="text-[10px] font-black uppercase tracking-[0.4em]">Productivity Laboratory Coming Soon</p>
            </div>
        )}

        {/* Floating Nav Mobile - Hidden when chat is active */}
        {!currentChatId && (
          <nav className="md:hidden fixed bottom-8 left-8 right-8 h-20 bg-zinc-900/90 backdrop-blur-3xl border border-zinc-800/50 rounded-[2.5rem] flex items-center justify-around px-6 z-40 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] animate-in fade-in duration-300">
            {[
              { id: 'home', icon: Home },
              { id: 'chats', icon: MessageSquare },
              { id: 'explore', icon: Compass },
              { id: 'profile', icon: User }
            ].map(item => (
              <button 
                key={item.id} 
                onClick={() => { setActiveTab(item.id as any); setCurrentChatId(null); }} 
                className={`p-3.5 rounded-2xl transition-all ${activeTab === item.id ? 'text-zinc-100 bg-zinc-800 shadow-xl' : 'text-zinc-600'}`}
              >
                <item.icon size={24} />
              </button>
            ))}
          </nav>
        )}
      </main>

      {/* Floating Modal */}
      {showPaywall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-zinc-950 border border-zinc-800 w-full max-w-sm rounded-[2.5rem] p-10 text-center animate-in zoom-in shadow-2xl">
            <div className="w-16 h-16 bg-zinc-100 text-zinc-950 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-8 shadow-2xl">⚡</div>
            <h2 className="text-2xl font-light text-zinc-100 mb-2 tracking-tight">OmniAI Platinum</h2>
            <p className="text-zinc-500 text-sm mb-10 leading-relaxed px-4">Unlock advanced reasoning models, vision analysis, and unlimited high-speed messaging.</p>
            <button onClick={() => { setUser(p => ({ ...p, isPro: true })); setShowPaywall(false); }} className="w-full py-5 bg-zinc-100 text-zinc-950 font-black rounded-2xl hover:bg-zinc-200 transition-all text-xs uppercase tracking-widest shadow-xl transform active:scale-95 mb-6">Unlock Pro • $12.99 / mo</button>
            <button onClick={() => setShowPaywall(false)} className="text-zinc-700 text-[10px] font-black hover:text-zinc-500 uppercase tracking-widest">Dismiss</button>
          </div>
        </div>
      )}

      {/* Sidebar Overlay Mobile */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 md:hidden backdrop-blur-md animate-in fade-in" onClick={() => setIsSidebarOpen(false)}>
            <div className="bg-zinc-950 w-64 h-full p-8 space-y-8 animate-in slide-in-from-left-2 duration-300" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-12">
                    <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center font-black text-zinc-950 text-sm">O</div>
                    <span className="font-bold tracking-widest text-zinc-100 uppercase text-[9px]">OMNIAI</span>
                </div>
                {[
                    { id: 'home', icon: Home, label: 'Home' },
                    { id: 'chats', icon: MessageSquare, label: 'History' },
                    { id: 'explore', icon: Compass, label: 'Lab' },
                    { id: 'profile', icon: User, label: 'Profile' }
                ].map(item => (
                    <button
                        key={item.id}
                        onClick={() => { setActiveTab(item.id as any); setIsSidebarOpen(false); setCurrentChatId(null); }}
                        className={`w-full flex items-center gap-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] ${activeTab === item.id ? 'text-zinc-100' : 'text-zinc-600'}`}
                    >
                        <item.icon size={18} />
                        {item.label}
                    </button>
                ))}
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
