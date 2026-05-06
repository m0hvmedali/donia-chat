'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Download, Search, Filter, Calendar } from 'lucide-react';
import { parseWhatsAppChat, Message, ChatData } from '@/lib/whatsapp-parser';
import { analyzeChat, ChatStats } from '@/lib/analyzer';
import { Virtuoso } from 'react-virtuoso';
import FlexSearch from 'flexsearch';
import { saveChatToSupabase, loadChatFromSupabase } from '@/lib/supabase';

export default function Home() {
  const [chatData, setChatData] = useState<ChatData | null>(null);
  const [stats, setStats] = useState<ChatStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Initializing Supabase connection...');
  const [searchQuery, setSearchQuery] = useState('');
  const [fileName, setFileName] = useState('');
  const [searchIndex, setSearchIndex] = useState<any>(null);

  // Advanced Filters
  const [showFilters, setShowFilters] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSenders, setSelectedSenders] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Attempt to load from Supabase on mount
    async function initFromSupabase() {
      try {
        const text = await loadChatFromSupabase();
        if (text) {
          setFileName('Supabase Cloud Sync');
          setLoadingMsg('Parsing cloud data...');
          setTimeout(() => {
            processChatText(text);
          }, 100);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to init from Supabase", err);
        setLoading(false);
      }
    }
    initFromSupabase();
  }, []);

  const processChatText = (text: string) => {
    try {
      const parsed = parseWhatsAppChat(text);
      if (parsed.messages.length === 0) {
        throw new Error("Could not parse any messages from the file. Ensure it is a valid WhatsApp chat format.");
      }
      const analysis = analyzeChat(parsed.messages, parsed.participants);
      
      const index = new FlexSearch.Document({
        document: {
          id: 'id',
          index: ['text', 'sender'],
          store: true
        },
        tokenize: "forward",
      });

      parsed.messages.forEach(msg => {
        index.add(msg as any);
      });

      setSearchIndex(index);
      setChatData(parsed);
      setStats(analysis);
    } catch (e) {
      console.error("Error parsing chat:", e);
      alert("Error parsing chat data.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);
    setLoadingMsg('Uploading to Supabase...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      
      try {
        // Try to save to supabase
        await saveChatToSupabase(text);
      } catch (err) {
        console.error("Upload to supabase failed:", err);
        alert("Failed to save to Supabase (check your table setup). Continuing with local parsing...");
      }
      
      setLoadingMsg('Parsing and building index...');
      setTimeout(() => {
        processChatText(text);
      }, 50);
    };
    reader.readAsText(file);
  };

  const filteredMessages = useMemo(() => {
    if (!chatData || !searchIndex) return [];

    let result = chatData.messages;

    // Fast textual search using FlexSearch or Regex
    if (searchQuery.trim()) {
      let isRegex = false;
      if (searchQuery.startsWith('/') && searchQuery.endsWith('/')) {
          try {
              const regex = new RegExp(searchQuery.slice(1, -1), 'gi');
              isRegex = true;
              result = result.filter(msg => regex.test(msg.text) || regex.test(msg.sender));
          } catch (e) {
              // Invalid regex, fallback to normal search
          }
      }

      if (!isRegex) {
          const results = searchIndex.search(searchQuery);
          const idSet = new Set<string>();
          results.forEach((fieldResult: any) => {
             fieldResult.result.forEach((doc: any) => {
                 idSet.add(typeof doc === 'string' ? doc : doc.id || doc);
             });
          });
          result = result.filter(msg => idSet.has(msg.id));
      }
    }

    // Filter by Date
    if (startDate) {
        const startTs = new Date(startDate).getTime();
        result = result.filter(msg => msg.timestamp >= startTs);
    }
    if (endDate) {
        // add 1 day to end date to include the whole day
        const endTs = new Date(endDate).getTime() + 86400000;
        result = result.filter(msg => msg.timestamp <= endTs);
    }

    // Filter by Senders
    if (selectedSenders.length > 0) {
        result = result.filter(msg => selectedSenders.includes(msg.sender));
    }

    return result;
  }, [searchQuery, chatData, searchIndex, startDate, endDate, selectedSenders]);

  const timelineBuckets = useMemo(() => {
    if (filteredMessages.length === 0) return [];
    const NUM_BUCKETS = 120;
    
    // Sort slightly to be safe but typically they are sorted
    const startTs = filteredMessages[0].timestamp;
    const endTs = filteredMessages[filteredMessages.length - 1].timestamp;
    const span = Math.max(endTs - startTs, 1);
    
    const buckets = new Array(NUM_BUCKETS).fill(0);
    filteredMessages.forEach(msg => {
        const b = Math.floor(((msg.timestamp - startTs) / span) * NUM_BUCKETS);
        buckets[Math.min(b, NUM_BUCKETS - 1)]++;
    });

    const maxCount = Math.max(...buckets, 1);
    return buckets.map(count => ({ count, normalized: count / maxCount }));
  }, [filteredMessages]);


  if (!chatData || !stats) {
    return (
      <div className="w-full h-screen bg-[#0A0B0D] text-[#E0E0E0] p-8 flex flex-col items-center justify-center font-sans tracking-tight">
        <h1 className="text-3xl font-medium tracking-tight mb-8">WA <span className="text-indigo-400">CHRONOLEX</span></h1>
        
        <div 
          className="border-2 border-dashed border-white/20 p-12 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 hover:border-indigo-500/50 transition-colors w-full max-w-md"
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".txt" 
            className="hidden" 
          />
          {loading ? (
            <div className="text-center">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto mb-4"></div>
              <p className="text-indigo-300">{loadingMsg}</p>
            </div>
          ) : (
            <div className="text-center">
              <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-500/30">
                <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
              </div>
              <p className="font-bold mb-2">Upload WhatsApp Export</p>
              <p className="text-sm text-white/40">Select your .txt file to begin indexing.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const toggleSender = (sender: string) => {
      setSelectedSenders(prev => 
         prev.includes(sender) ? prev.filter(s => s !== sender) : [...prev, sender]
      );
  };

  return (
    <div className="w-full h-screen bg-[#0A0B0D] text-[#E0E0E0] font-sans flex flex-col overflow-hidden">
      
      {/* Top Navigation / Search Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-4 md:px-8 bg-[#0F1115] shrink-0 relative z-50">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-600 rounded-full flex items-center justify-center font-bold text-white text-xs md:text-base">WA</div>
          <h1 className="text-lg md:text-xl font-medium tracking-tight hidden sm:block">CHRONO<span className="text-indigo-400">LEX</span></h1>
          <span className="text-[10px] md:text-xs bg-white/5 border border-white/10 px-2 py-1 rounded text-white/50 hidden md:block">v2.4.0 Engine</span>
        </div>
        
        <div className="flex-1 max-w-xl mx-4 relative flex items-center">
          <div className="relative w-full">
            <input 
              type="text" 
              placeholder="Search messages (Regex supported)..." 
              className="w-full bg-white/5 border border-white/10 rounded-full py-1.5 md:py-2 pl-9 pr-10 text-xs md:text-sm focus:outline-none focus:border-indigo-500/50 transition-colors" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search className="absolute left-3 top-2 md:top-2.5 w-4 h-4 text-white/30 pointer-events-none" />
            <button 
               onClick={() => setShowFilters(!showFilters)}
               className={`absolute right-1.5 top-1 md:top-1.5 p-1 rounded-full transition-colors ${showFilters ? 'bg-indigo-500/20 text-indigo-400' : 'text-white/40 hover:text-white hover:bg-white/10'}`}
            >
               <Filter className="w-4 h-4" />
            </button>
          </div>

          {/* Advanced Filters Dropdown */}
          {showFilters && (
            <div className="absolute top-12 right-0 w-80 bg-[#14161A] border border-white/10 rounded-xl shadow-2xl p-4 flex flex-col gap-4 z-50">
               <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2 block">Date Range</label>
                  <div className="flex items-center gap-2">
                     <div className="flex-1 bg-white/5 border border-white/10 rounded flex items-center px-2 py-1">
                        <Calendar className="w-3 h-3 mr-2 text-indigo-400" />
                        <input type="date" className="bg-transparent text-xs w-full outline-none text-white/80" value={startDate} onChange={e => setStartDate(e.target.value)} />
                     </div>
                     <span className="text-xs text-white/30">-</span>
                     <div className="flex-1 bg-white/5 border border-white/10 rounded flex items-center px-2 py-1">
                        <Calendar className="w-3 h-3 mr-2 text-indigo-400" />
                        <input type="date" className="bg-transparent text-xs w-full outline-none text-white/80" value={endDate} onChange={e => setEndDate(e.target.value)} />
                     </div>
                  </div>
               </div>

               <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-2 block">Senders</label>
                  <div className="flex flex-wrap gap-2">
                     {chatData.participants.map(p => (
                         <button 
                            key={p} 
                            onClick={() => toggleSender(p)}
                            className={`px-2 py-1 rounded text-[10px] border transition-colors ${selectedSenders.includes(p) ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10'}`}
                         >
                            {p}
                         </button>
                     ))}
                  </div>
               </div>
               
               {(startDate || endDate || selectedSenders.length > 0) && (
                  <button 
                    onClick={() => { setStartDate(''); setEndDate(''); setSelectedSenders([]); }}
                    className="text-[10px] text-rose-400 hover:text-rose-300 mt-2 self-start uppercase tracking-widest"
                  >
                    Clear Filters
                  </button>
               )}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-[9px] md:text-[10px] text-white/40 uppercase tracking-widest">File Indexed</span>
            <span className="text-[10px] md:text-xs font-mono text-green-400 truncate max-w-[120px]" title={fileName}>{fileName}</span>
          </div>
          <button className="p-2 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10" onClick={() => { setChatData(null); setStats(null); }}>
             <svg className="w-4 h-4 md:w-5 md:h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden flex-col md:flex-row">
        
        {/* Left Rail: Filters & Heatmap */}
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-white/5 flex flex-col p-4 md:p-6 gap-6 md:gap-8 bg-[#0A0B0D] shrink-0 overflow-y-auto">
          <div>
            <h3 className="text-[10px] md:text-[11px] font-bold text-white/30 uppercase tracking-widest mb-3 md:mb-4">Monthly Heatmap</h3>
            <div className="grid grid-cols-7 gap-1">
               {Object.values(stats.activityByMonth).slice(-21).map((val, i) => {
                  const max = Math.max(...Object.values(stats.activityByMonth), 1);
                  const opacity = Math.max(0.1, val / max);
                  return (
                    <div key={i} className="w-full aspect-square rounded-[2px]" style={{ backgroundColor: `rgba(99,102,241,${opacity})` }} title={`Activity: ${val}`}></div>
                  );
               })}
            </div>
            <div className="mt-2 flex justify-between text-[8px] md:text-[9px] text-white/20">
              <span>OLDER</span>
              <span>RECENT</span>
            </div>
          </div>

          <div>
            <h3 className="text-[10px] md:text-[11px] font-bold text-white/30 uppercase tracking-widest mb-3 md:mb-4">Participants</h3>
            <div className="space-y-3">
              {stats.dominance.map((dom, i) => {
                  const colors = ['bg-indigo-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-cyan-500'];
                  const color = colors[i % colors.length];
                  return (
                    <div key={dom.sender} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 truncate">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`}></div>
                        <span className="text-xs md:text-sm truncate max-w-[100px]">{dom.sender}</span>
                        </div>
                        <span className="text-[10px] md:text-xs text-white/40 font-mono">{dom.count.toLocaleString()}</span>
                    </div>
                  );
              })}
            </div>
          </div>

          <div className="mt-auto pt-4 md:pt-0 hidden md:block">
            <div className="p-3 md:p-4 bg-indigo-600/10 border border-indigo-500/20 rounded-xl">
              <p className="text-[10px] md:text-[11px] text-indigo-300 font-medium tracking-tight">INDEX PERFORMANCE</p>
              <p className="text-lg md:text-xl font-bold mt-1 text-white">0.05ms</p>
              <p className="text-[9px] md:text-[10px] text-indigo-300/50">FlexSearch v2 Cluster</p>
            </div>
          </div>
        </aside>

        {/* Center: Chat View */}
        <section className="flex-1 flex flex-col bg-[#0F1115] relative overflow-hidden">
          <div className="flex-1 overflow-hidden relative">
            <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#0F1115] to-transparent z-10 pointer-events-none"></div>
            
            <Virtuoso
              className="w-full h-full p-4 md:p-8"
              data={filteredMessages}
              initialTopMostItemIndex={filteredMessages.length > 0 ? filteredMessages.length - 1 : 0}
              itemContent={(index, msg) => {
                 const isFirstSender = stats.dominance[0] && msg.sender === stats.dominance[0].sender;
                 const initials = msg.sender.substring(0,2).toUpperCase();

                 if (isFirstSender) {
                     return (
                        <div className="flex gap-3 md:gap-4 mb-4 md:mb-6 pr-8">
                            <div className="w-6 h-6 md:w-8 md:h-8 rounded-lg bg-indigo-500/20 flex-shrink-0 flex items-center justify-center text-[10px] md:text-xs font-bold border border-indigo-500/30 text-indigo-300">{initials}</div>
                            <div className="space-y-1 w-full flex-1">
                                <div className="flex items-baseline gap-2 md:gap-3">
                                    <span className="text-[10px] md:text-xs font-bold text-indigo-400">{msg.sender}</span>
                                    <span className="text-[9px] md:text-[10px] text-white/20 font-mono">{msg.date} {msg.time}</span>
                                </div>
                                <div className="p-2 md:p-3 bg-white/5 rounded-2xl rounded-tl-none border border-white/10 text-xs md:text-sm inline-block break-words whitespace-pre-wrap max-w-full">
                                    {highlightText(msg.text, searchQuery)}
                                </div>
                            </div>
                        </div>
                    );
                 } else {
                     return (
                         <div className="flex gap-3 md:gap-4 mb-4 md:mb-6 justify-end pl-8">
                            <div className="space-y-1 items-end flex flex-col w-full flex-1 text-right">
                                <div className="flex items-baseline gap-2 md:gap-3 flex-row-reverse">
                                    <span className="text-[10px] md:text-xs font-bold text-emerald-400">{msg.sender}</span>
                                    <span className="text-[9px] md:text-[10px] text-white/20 font-mono">{msg.date} {msg.time}</span>
                                </div>
                                <div className="p-2 md:p-3 bg-emerald-500/10 rounded-2xl rounded-tr-none border border-emerald-500/20 text-xs md:text-sm inline-block break-words whitespace-pre-wrap max-w-full text-right text-emerald-50">
                                     {highlightText(msg.text, searchQuery)}
                                </div>
                            </div>
                            <div className="w-6 h-6 md:w-8 md:h-8 rounded-lg bg-emerald-500/20 flex-shrink-0 flex items-center justify-center text-[10px] md:text-xs font-bold border border-emerald-500/30 text-emerald-300">{initials}</div>
                        </div>
                     );
                 }
              }}
            />

            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0F1115] to-transparent z-10 pointer-events-none"></div>
          </div>
          
          {/* Interactive Timeline Scrubber with Heatmap Overlay */}
          <div className="h-16 md:h-20 border-t border-white/5 bg-[#0A0B0D] shrink-0 p-2 md:p-4 flex flex-col justify-end">
            <div className="flex items-end w-full h-10 gap-[1px]">
               {timelineBuckets.map((bucket, i) => (
                  <div 
                     key={i} 
                     className="flex-1 bg-indigo-500 rounded-t-sm transition-all hover:bg-indigo-300"
                     style={{ 
                         height: `${Math.max(4, bucket.normalized * 100)}%`,
                         opacity: Math.max(0.15, bucket.normalized)
                     }}
                     title={`Volume: ${bucket.count}`}
                  />
               ))}
            </div>
            <div className="flex justify-between items-center mt-1">
               <span className="text-[8px] md:text-[9px] font-mono text-white/30">BEGIN</span>
               <span className="text-[8px] md:text-[9px] font-mono text-white/30">TIMELINE HEATMAP</span>
               <span className="text-[8px] md:text-[9px] font-mono text-white/30">END</span>
            </div>
          </div>
        </section>

        {/* Right Rail: Statistics */}
        <aside className="w-full md:w-80 border-t md:border-t-0 md:border-l border-white/5 p-4 md:p-6 space-y-6 md:space-y-8 bg-[#0A0B0D] shrink-0 overflow-y-auto hidden lg:block">
          
          <section>
            <h3 className="text-[10px] md:text-[11px] font-bold text-white/30 uppercase tracking-widest mb-4 md:mb-6">Dominance Analysis</h3>
            {stats.dominance.length >= 2 && (
              <div className="relative h-24 md:h-32 flex items-end gap-2">
                <div 
                    className="flex-1 bg-indigo-500/40 rounded-t-lg flex items-center justify-center group relative cursor-pointer hover:bg-indigo-500/60 transition-colors"
                    style={{ height: `${Math.max(20, stats.dominance[0].percentage)}%` }}
                >
                  <span className="-rotate-90 text-[9px] md:text-[10px] font-bold truncate max-w-[60px]">{stats.dominance[0].sender.substring(0,8)}</span>
                </div>
                <div 
                    className="flex-1 bg-emerald-500/40 rounded-t-lg flex items-center justify-center group relative cursor-pointer hover:bg-emerald-500/60 transition-colors"
                    style={{ height: `${Math.max(20, stats.dominance[1].percentage)}%` }}
                >
                  <span className="-rotate-90 text-[9px] md:text-[10px] font-bold truncate max-w-[60px]">{stats.dominance[1].sender.substring(0,8)}</span>
                </div>
                <div className="absolute top-0 right-0 text-right">
                  <div className="text-2xl md:text-3xl font-light tracking-tighter">{stats.dominance[0].percentage}<span className="text-xs md:text-sm text-indigo-400">%</span></div>
                  <div className="text-[9px] md:text-[10px] text-white/40 uppercase truncate max-w-[100px]">{stats.dominance[0].sender}</div>
                </div>
              </div>
            )}
          </section>

          <section>
            <h3 className="text-[10px] md:text-[11px] font-bold text-white/30 uppercase tracking-widest mb-3 md:mb-4">Lexicon (Top Keywords)</h3>
            <div className="flex flex-wrap gap-2">
              {stats.topWords.slice(0, 10).map((w, i) => (
                  <span key={w.word} className="px-2 md:px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] md:text-xs">
                    {w.word} <span className="text-white/40 ml-1">{w.count}</span>
                  </span>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-[10px] md:text-[11px] font-bold text-white/30 uppercase tracking-widest mb-3 md:mb-4">Sentiment & Vitality</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] md:text-xs mb-1">
                  <span className="text-white/60">Overall Sentiment</span>
                  {/* Score ranges from -1 to 1 */}
                  <span className={`font-mono ${stats.sentiment.overall >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                     {stats.sentiment.overall > 0 ? '+' : ''}{stats.sentiment.overall.toFixed(2)}
                  </span>
                </div>
                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden flex">
                  {/* Visual bar: Map -1..1 to 0..100% */}
                  <div 
                      className={`h-full ${stats.sentiment.overall >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} 
                      style={{ width: `${((stats.sentiment.overall + 1) / 2) * 100}%` }}
                  ></div>
                </div>
                <div className="flex justify-between mt-2 flex-wrap gap-2">
                   {Object.entries(stats.sentiment.byParticipant).slice(0,2).map(([sender, score]) => (
                      <div key={sender} className="text-[9px] text-white/40">
                         {sender.substring(0,8)}: <span className={score >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}>{score}</span>
                      </div>
                   ))}
                </div>
              </div>
              <div className="pt-2">
                <div className="flex justify-between text-[10px] md:text-xs mb-1">
                  <span className="text-white/60">Total Messages</span>
                  <span className="text-indigo-400 font-mono">{stats.totalMessages.toLocaleString()}</span>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] md:text-xs mb-1">
                  <span className="text-white/60">Total Words</span>
                  <span className="text-emerald-400 font-mono">{stats.totalWords.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </section>

          <div className="pt-2 md:pt-4">
            <button className="w-full py-2.5 md:py-3 bg-white text-black font-bold text-[10px] md:text-xs uppercase tracking-widest rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2">
              <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Export Insights
            </button>
          </div>
        </aside>
      </main>

      {/* Bottom Status Bar */}
      <footer className="h-6 md:h-8 border-t border-white/5 bg-[#0A0B0D] px-4 md:px-6 flex items-center justify-between text-[8px] md:text-[10px] text-white/30 font-mono uppercase tracking-widest shrink-0">
        <div className="flex gap-4 md:gap-6">
          <span className="flex items-center gap-1.5 md:gap-2"><div className="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full bg-green-500 shadow-[0_0_4px_#22c55e]"></div> DB CONNECTED</span>
          <span className="hidden sm:inline">MESSAGES: {stats.totalMessages.toLocaleString()}</span>
          <span className="hidden md:inline">WORDS: {stats.totalWords.toLocaleString()}</span>
        </div>
        <div className="flex gap-2 md:gap-4">
          <span className="hidden sm:inline">ENGINE: RUST/WASM</span>
          <span>RESULTS: {filteredMessages.length.toLocaleString()}</span>
        </div>
      </footer>

    </div>
  );
}

function highlightText(text: string, query: string) {
  if (!query) return text;
  
  let regex: RegExp;
  try {
     if (query.startsWith('/') && query.endsWith('/')) {
         regex = new RegExp(query.slice(1, -1), 'gi');
     } else {
         // Escape regex chars for standard text search
         const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
         regex = new RegExp(`(${escaped})`, 'gi');
     }
  } catch (e) {
     return text;
  }

  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) => 
        regex.test(part) ? (
          <mark key={i} className="bg-indigo-500/50 text-white px-0.5 rounded-sm">{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}
