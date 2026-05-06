import { Message } from "./whatsapp-parser";

export interface ChatStats {
  participantStats: Record<string, { count: number; words: number }>;
  totalMessages: number;
  totalWords: number;
  topWords: Array<{ word: string; count: number }>;
  dominance: { sender: string; percentage: number; count: number }[];
  activityByDate: Record<string, number>;
  activityByMonth: Record<string, number>;
  sentiment: {
    overall: number;
    byParticipant: Record<string, number>;
  };
}

const STOP_WORDS = new Set([
  'في','من','على','الى','عن','مع','انه','اللي','انا','انت','هو','هي','احنا',
  'ده','دي','بس','مش','فيها','ايه','يا','و','او','لو','لا','نعم','ايوه',
  'the','is','in','at','of','on','and','a','an','to','for','it','that','you','i'
]);

const POSITIVE_WORDS = new Set([
  'حلو','جميل','ممتاز','رائع','شكرا','مبروك','عظيم','جيد','تحفة','تمام','حبيبي','حبيبتي','بحبك','حب','good','great','awesome','perfect','thanks','thank','love','happy','amazing','excellent','nice','beautiful','congratulations','congrats'
]);

const NEGATIVE_WORDS = new Set([
  'سيء','وحش','زفت','غبي','زعلان','حزين','مريض','تعبان','مشكلة','غلط','حرام','موت','bad','terrible','awful','sad','angry','sick','hate','wrong','problem','stupid','worst','dumb','tired'
]);

export function analyzeChat(messages: Message[], participants: string[]): ChatStats {
  const participantStats: Record<string, { count: number; words: number }> = {};
  const sentimentByParticipant: Record<string, { score: number; count: number }> = {};

  participants.forEach(p => {
    participantStats[p] = { count: 0, words: 0 };
    sentimentByParticipant[p] = { score: 0, count: 0 };
  });

  let totalMessages = 0;
  let totalWords = 0;
  let totalSentimentScore = 0;
  let messagesWithSentiment = 0;
  
  const wordFreq: Record<string, number> = {};
  const activityByDate: Record<string, number> = {};
  const activityByMonth: Record<string, number> = {};

  for (const msg of messages) {
    totalMessages++;
    
    // Date activity
    const dateKey = msg.date;
    activityByDate[dateKey] = (activityByDate[dateKey] || 0) + 1;

    // Monthly activity using YYYY-MM
    let monthKey = "Unknown";
    try {
        const parts = msg.date.split('/');
        if (parts.length === 3) {
            // Assume DD/MM/YYYY or MM/DD/YYYY, let's try to get year and month
            const year = parts[2].length === 4 ? parts[2] : (parts[2].length === 2 ? `20${parts[2]}` : parts[2]);
            const month = parts[1].length === 2 || parseInt(parts[1]) > 12 ? parts[0] : parts[1]; // rough heuristic
            monthKey = `${year}-${month.padStart(2, '0')}`;
        }
    } catch (e) {}
    activityByMonth[monthKey] = (activityByMonth[monthKey] || 0) + 1;

    if (!participantStats[msg.sender]) {
       participantStats[msg.sender] = { count: 0, words: 0 };
       sentimentByParticipant[msg.sender] = { score: 0, count: 0 };
    }
    
    participantStats[msg.sender].count++;

    const words = msg.text.split(/\s+/).filter(w => w.length > 0);
    const wCount = words.length;
    participantStats[msg.sender].words += wCount;
    totalWords += wCount;

    let msgSentiment = 0;
    let scoredWords = 0;

    // Word frequency and sentiment
    for (let w of words) {
      w = w.toLowerCase().replace(/[^\w\u0600-\u06FF]/g, '');
      if (w.length > 2 && !STOP_WORDS.has(w)) {
        wordFreq[w] = (wordFreq[w] || 0) + 1;
      }
      if (POSITIVE_WORDS.has(w)) { msgSentiment += 1; scoredWords++; }
      if (NEGATIVE_WORDS.has(w)) { msgSentiment -= 1; scoredWords++; }
    }

    if (scoredWords > 0) {
        // Normalize sentiment between -1 and 1 per message
        const normalized = msgSentiment / scoredWords;
        sentimentByParticipant[msg.sender].score += normalized;
        sentimentByParticipant[msg.sender].count++;
        totalSentimentScore += normalized;
        messagesWithSentiment++;
    }
  }

  // Top words
  const topWords = Object.entries(wordFreq)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  // Dominance (based on message count)
  let maxCount = 0;
  const dominance = Object.entries(participantStats).map(([sender, stats]) => {
     let pct = totalMessages > 0 ? Math.round((stats.count / totalMessages) * 100) : 0;
     return { sender, percentage: pct, count: stats.count };
  }).sort((a,b) => b.count - a.count);

  const finalSentimentByParticipant: Record<string, number> = {};
  for (const [p, s] of Object.entries(sentimentByParticipant)) {
      finalSentimentByParticipant[p] = s.count > 0 ? Number((s.score / s.count).toFixed(2)) : 0;
  }

  return {
    participantStats,
    totalMessages,
    totalWords,
    topWords,
    dominance,
    activityByDate,
    activityByMonth,
    sentiment: {
        overall: messagesWithSentiment > 0 ? Number((totalSentimentScore / messagesWithSentiment).toFixed(2)) : 0,
        byParticipant: finalSentimentByParticipant
    }
  };
}
