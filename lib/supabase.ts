import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pawwqdaiucbvohsgmtop.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhd3dxZGFpdWNidm9oc2dtdG9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMTQ5MDgsImV4cCI6MjA3ODc5MDkwOH0.EuNNd8Cj9TBxJvmPARhhR1J1KPwoS3X46msX-MhriRk';

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function saveChatToSupabase(chatText: string) {
  // Assuming a table named 'whatsapp_chats' with columns 'id' and 'raw_text'
  const { data, error } = await supabase
    .from('whatsapp_chats')
    .upsert([{ id: 'default_chat', raw_text: chatText }]);

  if (error) {
    console.error("Error saving to Supabase:", error);
    throw error;
  }
  return data;
}

export async function loadChatFromSupabase(): Promise<string | null> {
  const { data, error } = await supabase
    .from('whatsapp_chats')
    .select('raw_text')
    .eq('id', 'default_chat')
    .single();

  if (error || !data) {
    console.error("Error loading chat from Supabase (or not found):", error);
    return null;
  }

  return data.raw_text;
}
