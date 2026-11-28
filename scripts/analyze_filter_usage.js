import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log('Fetching all logs from wardrobe_logs...');
  let allRows = [];
  let from = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('wardrobe_logs')
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) {
      console.error('Error fetching logs:', error);
      break;
    }
    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`Fetched ${allRows.length} total rows.`);

  // Analyze by timeframes: All Time & Last 7 Days
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  function analyze(rows, label) {
    console.log(`\n======================================================`);
    console.log(`ANALYSIS: ${label} (${rows.length} rows)`);
    console.log(`======================================================`);

    // Group rows by session_id
    const sessions = new Map();
    const filterTypesCount = {
      format: 0,
      quick_tab: 0,
      brand: 0,
      seller: 0,
      deal_lens: 0,
      budget: 0,
      dna: 0,
      vibe: 0,
      sort: 0
    };

    const specificFilters = new Map();

    for (const r of rows) {
      const sId = r.session_id || 'anon_session';
      if (!sessions.has(sId)) {
        sessions.set(sId, {
          sessionId: sId,
          visited: false,
          hasSearch: false,
          searchQueries: [],
          hasFilter: false,
          filterEvents: [],
          filtersUsed: new Set(),
          hasCardClick: false,
          hasWhatsApp: false,
          whatsappCount: 0,
          events: []
        });
      }

      const s = sessions.get(sId);
      const title = (r.umbrella_title || '').trim();
      const payload = Array.isArray(r.liked_perfumes) && r.liked_perfumes[0] ? r.liked_perfumes[0] : {};

      s.events.push(title);

      if (title === 'EVENT:session_visit') {
        s.visited = true;
      } else if (title === 'EVENT:search') {
        s.hasSearch = true;
        const q = payload.query || r.umbrella_season || '';
        if (q) s.searchQueries.push(q);
      } else if (title === 'EVENT:filter_applied') {
        // Ignore synthetic test verification payloads
        if (payload.dna === 'aventus' && payload.seller === 'Talib Musa') {
          continue;
        }

        s.hasFilter = true;
        s.filterEvents.push(payload);

        // Analyze specific filter categories (main text box excluded)
        if (payload.brand && payload.brand !== 'all') {
          filterTypesCount.brand++;
          s.filtersUsed.add(`Brand: ${payload.brand}`);
          specificFilters.set(`Brand: ${payload.brand}`, (specificFilters.get(`Brand: ${payload.brand}`) || 0) + 1);
        }
        if (payload.seller && payload.seller !== 'all') {
          filterTypesCount.seller++;
          s.filtersUsed.add(`Seller: ${payload.seller}`);
          specificFilters.set(`Seller: ${payload.seller}`, (specificFilters.get(`Seller: ${payload.seller}`) || 0) + 1);
        }
        if (Array.isArray(payload.formats) && payload.formats.length > 0) {
          filterTypesCount.format++;
          payload.formats.forEach(f => {
            s.filtersUsed.add(`Format: ${f}`);
            specificFilters.set(`Format: ${f}`, (specificFilters.get(`Format: ${f}`) || 0) + 1);
          });
        }
        if (payload.tab && payload.tab !== 'all') {
          filterTypesCount.quick_tab++;
          s.filtersUsed.add(`Tab: ${payload.tab}`);
          specificFilters.set(`Tab: ${payload.tab}`, (specificFilters.get(`Tab: ${payload.tab}`) || 0) + 1);
        }
        if (payload.deal_lens && payload.deal_lens !== 'all') {
          filterTypesCount.deal_lens++;
          s.filtersUsed.add(`Deal Lens: ${payload.deal_lens}`);
          specificFilters.set(`Deal Lens: ${payload.deal_lens}`, (specificFilters.get(`Deal Lens: ${payload.deal_lens}`) || 0) + 1);
        }
        if (payload.max_budget) {
          filterTypesCount.budget++;
          s.filtersUsed.add(`Budget: ₹${payload.max_budget}`);
          specificFilters.set(`Budget <= ₹${payload.max_budget}`, (specificFilters.get(`Budget <= ₹${payload.max_budget}`) || 0) + 1);
        }
        if (payload.dna && payload.dna !== 'all') {
          filterTypesCount.dna++;
          s.filtersUsed.add(`DNA: ${payload.dna}`);
          specificFilters.set(`DNA: ${payload.dna}`, (specificFilters.get(`DNA: ${payload.dna}`) || 0) + 1);
        }
        if (payload.vibe && payload.vibe !== 'all') {
          filterTypesCount.vibe++;
          s.filtersUsed.add(`Vibe: ${payload.vibe}`);
          specificFilters.set(`Vibe: ${payload.vibe}`, (specificFilters.get(`Vibe: ${payload.vibe}`) || 0) + 1);
        }
        if (payload.sort && payload.sort !== 'popular') {
          filterTypesCount.sort++;
          s.filtersUsed.add(`Sort: ${payload.sort}`);
          specificFilters.set(`Sort: ${payload.sort}`, (specificFilters.get(`Sort: ${payload.sort}`) || 0) + 1);
        }
      } else if (title === 'EVENT:card_open') {
        s.hasCardClick = true;
      } else if (title === 'EVENT:whatsapp_click') {
        s.hasWhatsApp = true;
        s.whatsappCount++;
      }
    }

    const sessionList = Array.from(sessions.values());
    const totalSessions = sessionList.length;
    
    // Sessions with explicit visit event or any active user interaction
    const activeVisitors = sessionList.filter(s => s.visited || s.hasSearch || s.hasFilter || s.hasCardClick || s.hasWhatsApp);
    
    // Filter users
    const filterUsers = sessionList.filter(s => s.hasFilter);
    const filterAndSearchUsers = sessionList.filter(s => s.hasFilter && s.hasSearch);
    const filterOnlyUsers = sessionList.filter(s => s.hasFilter && !s.hasSearch);
    const searchOnlyUsers = sessionList.filter(s => !s.hasFilter && s.hasSearch);
    const passiveBrowseUsers = sessionList.filter(s => !s.hasFilter && !s.hasSearch);

    // Conversion comparison
    const filterUserConverts = filterUsers.filter(s => s.hasWhatsApp).length;
    const nonFilterUserConverts = sessionList.filter(s => !s.hasFilter).filter(s => s.hasWhatsApp).length;

    console.log(`\n1. SESSIONS & AUDIENCE BREAKDOWN:`);
    console.log(`- Total Unique Sessions: ${totalSessions}`);
    console.log(`- Active Engaged Visitors: ${activeVisitors.length}`);
    console.log(`- Visitors Who Used Filters (Excluding Text Box): ${filterUsers.length} (${((filterUsers.length / totalSessions) * 100).toFixed(1)}% of all sessions)`);
    if (activeVisitors.length !== totalSessions) {
      console.log(`- Filter Penetration Among Engaged Visitors: ${((filterUsers.length / activeVisitors.length) * 100).toFixed(1)}%`);
    }

    console.log(`\n2. INTERACTION COHORT SPLIT:`);
    console.log(`- Filter ONLY (no text search): ${filterOnlyUsers.length} (${((filterOnlyUsers.length / totalSessions) * 100).toFixed(1)}%)`);
    console.log(`- Both Filters & Text Search: ${filterAndSearchUsers.length} (${((filterAndSearchUsers.length / totalSessions) * 100).toFixed(1)}%)`);
    console.log(`- Text Search ONLY (no filters): ${searchOnlyUsers.length} (${((searchOnlyUsers.length / totalSessions) * 100).toFixed(1)}%)`);
    console.log(`- Neither (Browsed catalog / card clicks / instant WhatsApp directly): ${passiveBrowseUsers.length} (${((passiveBrowseUsers.length / totalSessions) * 100).toFixed(1)}%)`);

    console.log(`\n3. FILTER CATEGORY USAGE (Events Count):`);
    Object.entries(filterTypesCount).forEach(([cat, count]) => {
      console.log(`- ${cat.toUpperCase()}: ${count} applications`);
    });

    console.log(`\n4. TOP 10 APPLIED FILTERS:`);
    const topFilters = Array.from(specificFilters.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);
    topFilters.forEach(([f, count], i) => {
      console.log(`  ${i + 1}. ${f} -> ${count} times`);
    });

    console.log(`\n5. WHATSAPP CONVERSION IMPACT:`);
    console.log(`- Filter Users WhatsApp Conv. Rate: ${filterUsers.length > 0 ? ((filterUserConverts / filterUsers.length) * 100).toFixed(1) : 0}% (${filterUserConverts}/${filterUsers.length})`);
    const nonFilterCount = totalSessions - filterUsers.length;
    console.log(`- Non-Filter Users WhatsApp Conv. Rate: ${nonFilterCount > 0 ? ((nonFilterUserConverts / nonFilterCount) * 100).toFixed(1) : 0}% (${nonFilterUserConverts}/${nonFilterCount})`);
  }

  // Run for All Time
  analyze(allRows, 'ALL TIME');

  // Run for Last 7 Days
  const last7dRows = allRows.filter(r => r.created_at && new Date(r.created_at) >= sevenDaysAgo);
  analyze(last7dRows, 'LAST 7 DAYS');
}

run().catch(console.error);
