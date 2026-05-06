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
  // Variables are embedded inside the loop
  
  let currentMsg: Message | null = null;
  let idCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const originalLine = lines[i].replace(/\r/g, '');
    if (!originalLine.trim()) continue;

    // Clean up WhatsApp specific unicode characters and convert Arabic numerals to Latin
    const cleanLine = originalLine
      .replace(/[\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u202F\uFEFF]/g, ' ') // Remove LTR/RTL marks, BOM, and replace narrow space with space
      .trim()
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString()); // Arabic to English numbers

    // Regex 1: DD/MM/YYYY, HH:MM - Sender: Message
    const match1 = cleanLine.match(/^\[?(\d{1,4}[/\-\.]\d{1,2}[/\-\.]\d{1,4})[,\s]+(\d{1,2}[:.]\d{1,2}(?:[:.]\d{1,2})?(?:\s*[a-zA-Z]{1,2}|\s*[صم])?)\]?\s*(?:[-—–]\s*)?([^:]+):\s*(.*)$/i);
    // Regex 2: HH:MM, DD/MM/YYYY - Sender: Message (Reverse format)
    const match2 = cleanLine.match(/^\[?(\d{1,2}[:.]\d{1,2}(?:[:.]\d{1,2})?(?:\s*[a-zA-Z]{1,2}|\s*[صم])?)[,\s]+(\d{1,4}[/\-\.]\d{1,2}[/\-\.]\d{1,4})\]?\s*(?:[-—–]\s*)?([^:]+):\s*(.*)$/i);

    let match = null;
    let date = '', time = '', sender = '', text = '';

    if (match1) {
      match = match1;
      date = match[1];
      time = match[2];
      sender = match[3];
      text = match[4];
    } else if (match2) {
      match = match2;
      time = match[1];
      date = match[2];
      sender = match[3];
      text = match[4];
    }

    if (match) {
      if (currentMsg) {
        messages.push(currentMsg);
      }


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
             // Fallback 2: YY/MM/DD
             const fallbackDate2 = new Date(`20${parts[2]} ${parts[1]} ${parts[0]} ${cleanTime}`);
             if (!isNaN(fallbackDate2.getTime())) {
                 return fallbackDate2.getTime();
             }
        }
    }
    
    const time = date.getTime();
    return isNaN(time) ? 0 : time;
  } catch {
    return 0;
  }
}
