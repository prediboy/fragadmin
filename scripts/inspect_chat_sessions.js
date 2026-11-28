import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function checkSessions() {
  const { data } = await supabase
    .from('ai_chat_messages')
    .select('session_id, role, content, taste_summary, intent, created_at')
    .order('created_at', { ascending: true });
    
  const sessions = {};
  data.forEach(m => {
    if (!sessions[m.session_id]) sessions[m.session_id] = [];
    sessions[m.session_id].push(m);
  });
  
  const multiTurn = Object.entries(sessions).filter(([id, msgs]) => msgs.filter(m => m.role === 'user').length > 1);
  console.log('Total sessions:', Object.keys(sessions).length);
  console.log('Multi-turn sessions (>1 user turn):', multiTurn.length);
  
  multiTurn.slice(0, 5).forEach(([id, msgs]) => {
    console.log(`\n=== SESSION: ${id} (${msgs.filter(m=>m.role==='user').length} turns) ===`);
    let turnCount = 0;
    msgs.forEach(m => {
      if (m.role === 'user') {
        turnCount++;
        console.log(`  [Turn ${turnCount} - USER]: "${m.content}" (${m.created_at})`);
      } else {
        console.log(`  [Turn ${turnCount} - ASST]: Intent: ${m.intent} | Crux: "${m.taste_summary || ''}"`);
      }
    });
  });
}
checkSessions();
