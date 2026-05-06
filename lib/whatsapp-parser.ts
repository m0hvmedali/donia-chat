export interface Message {
  id: string;
  date: string;
  time: string;
  timestamp: number;
  sender: string;
  text: string;
}

export interface ChatData {
  messages: Message[];
  participants: string[];
}

export function parseWhatsAppChat(text: string): ChatData {
  const lines = text.split('\n');
  const messages: Message[] = [];
  const participantsSet = new Set<string>();

  // Regular expression to match standard WhatsApp chat formats + Arabic formats
  const lineRegex = /^\[?(\d{1,4}[/\-\.]\d{1,2}[/\-\.]\d{1,4})[,\s]+(\d{1,2}:\d{1,2}(?::\d{1,2})?(?:\s*[a-zA-Z]{1,2}|\s*[صم])?)\]?\s*(?:-\s*)?([^:]+):\s*(.*)$/i;

  let currentMsg: Message | null = null;
  let idCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const originalLine = lines[i];
    if (!originalLine.trim()) continue;

    // Clean up WhatsApp specific unicode characters and convert Arabic numerals to Latin
    const cleanLine = originalLine
      .replace(/[\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u202F]/g, '') // Remove LTR/RTL marks and non-breaking spaces
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString()); // Arabic to English numbers

    const match = cleanLine.match(lineRegex);

    if (match) {
      if (currentMsg) {
        messages.push(currentMsg);
      }

      const [, date, time, sender, text] = match;
      
      // Basic system messages often don't have a sender or the sender is the system.
      // We can try to filter out basic encryption messages etc. if needed, but keeping it simple.
      if (!sender.includes('added') && !sender.includes('removed') && !sender.includes('Encryption')) {
          participantsSet.add(sender.trim());
      }

      currentMsg = {
        id: `msg-${idCounter++}`,
        date: date.trim(),
        time: time.trim(),
        timestamp: parseTimestamp(date.trim(), time.trim()),
        sender: sender.trim(),
        text: text.trim(),
      };
    } else if (currentMsg) {
      // Continuation of previous message (multiline)
      currentMsg.text += '\n' + originalLine;
    }
  }

  if (currentMsg) {
    messages.push(currentMsg);
  }

  return {
    messages,
    participants: Array.from(participantsSet),
  };
}

function parseTimestamp(dateStr: string, timeStr: string): number {
  try {
    // Basic attempt to convert to UTC timestamp. Very rudimentary.
    // Assuming DD/MM/YYYY or MM/DD/YYYY. Will try standard JS parsing
    // Clean up possible weird chars
    const cleanDate = dateStr.replace(/[\/\-\.]/g, '/');
    let cleanTime = timeStr.replace(/\s*[AaPp][Mm]/i, (m) => m.toUpperCase());
    cleanTime = cleanTime.replace(/ص/g, 'AM').replace(/م/g, 'PM');
    
    // JS Date.parse might fail depending on locale format of DD/MM vs MM/DD.
    // For a real app, date-fns or dayjs parsing with multiple formats would be better.
    let date = new Date(`${cleanDate} ${cleanTime}`);
    if (isNaN(date.getTime())) {
        // Fallback: assume DD/MM/YYYY -> MM/DD/YYYY
        const parts = cleanDate.split('/');
        if (parts.length === 3) {
             const fallbackDate = new Date(`${parts[1]}/${parts[0]}/${parts[2]} ${cleanTime}`);
             if (!isNaN(fallbackDate.getTime())) {
                 return fallbackDate.getTime();
             }
        }
    }
    return date.getTime() || Date.now();
  } catch {
    return Date.now();
  }
}
