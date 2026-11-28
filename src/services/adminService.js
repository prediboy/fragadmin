/**
 * adminService.js
 * 
 * Core data engine for the FragAdmin Dashboard.
 * Focuses on:
 * - Dynamic date filtering (Today, Yesterday, 7d, 14d, 30d, All Time, and Custom Date Range)
 * - Click analytics: Card detail opens, WhatsApp conversions, and seller conversion attribution
 * - Decant vs. Retail bottle conversions & GMV pipeline
 * - AI conversational telemetry: Total queries, engaged sessions, queries per session, and query depth
 * - End-to-end user interaction funnel and chronological live click stream
 */

import { supabase } from '../lib/supabaseClient.js';

let cachedAllLogs = null;
let lastLogsFetch = 0;
const LOGS_CACHE_TTL = 60000; // 60s cache

/**
 * Fetch all raw telemetry rows (paginated to bypass Supabase 1,000-row limit)
 */
export async function fetchAllTelemetryLogs(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedAllLogs && (now - lastLogsFetch) < LOGS_CACHE_TTL) {
    return cachedAllLogs;
  }

  try {
    if (!supabase) throw new Error("Supabase client is not configured");

    let allRows = [];
    let page = 0;
    while (true) {
      const { data, error } = await supabase
        .from('wardrobe_logs')
        .select('created_at, session_id, umbrella_title, umbrella_season, liked_perfumes')
        .range(page * 1000, (page + 1) * 1000 - 1)
        .order('created_at', { ascending: false });

      if (error || !data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < 1000) break;
      page++;
      if (page > 20) break; // safety threshold
    }

    cachedAllLogs = allRows;
    lastLogsFetch = Date.now();
    return allRows;
  } catch (err) {
    console.error('[FragAdmin] fetchAllTelemetryLogs error:', err);
    return cachedAllLogs || [];
  }
}

/**
 * Helper to compute date range boundaries
 */
export function getDateBoundaries(preset = '7d', customStart = null, customEnd = null) {
  const now = new Date();
  let start = null;
  let end = new Date(now.getTime() + 86400000); // include current day buffer
  let label = 'Last 7 Days';

  if (preset === 'today') {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    start = today;
    label = 'Today';
  } else if (preset === 'yesterday') {
    const yStart = new Date(now);
    yStart.setDate(yStart.getDate() - 1);
    yStart.setHours(0, 0, 0, 0);
    const yEnd = new Date(now);
    yEnd.setDate(yEnd.getDate() - 1);
    yEnd.setHours(23, 59, 59, 999);
    start = yStart;
    end = yEnd;
    label = 'Yesterday';
  } else if (preset === '7d') {
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    label = 'Last 7 Days';
  } else if (preset === '14d') {
    start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    label = 'Last 14 Days';
  } else if (preset === '30d') {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    label = 'Last 30 Days';
  } else if (preset === 'all') {
    start = null;
    label = 'All Time';
  } else if (preset === 'custom') {
    if (customStart) start = new Date(customStart);
    if (customEnd) {
      const ce = new Date(customEnd);
      ce.setHours(23, 59, 59, 999);
      end = ce;
    }
    label = customStart && customEnd ? `${customStart} to ${customEnd}` : 'Custom Range';
  }

  return { start, end, label };
}

/**
 * Compute comprehensive click, conversion, AI interaction, and seller metrics for a given date range
 */
export function computeClickAnalytics(rawRows, { preset = '7d', customStart = null, customEnd = null } = {}) {
  const { start, end, label } = getDateBoundaries(preset, customStart, customEnd);

  // 1. Filter rows by chosen date boundaries
  const filteredRows = rawRows.filter(r => {
    if (!start) return true;
    if (!r.created_at) return false;
    const t = new Date(r.created_at);
    return t >= start && t <= end;
  });

  // 2. Data structures for aggregation
  const sessions = new Map();
  const sellerMap = new Map();
  const searchQueries = new Map();
  const topBottlesMap = new Map();
  const topDecantsMap = new Map();
  const decantSizesMap = new Map();
  const dayVelocityMap = {};
  const liveClickStream = [];

  let totalCardClicks = 0;
  let totalWhatsAppClicks = 0;
  let totalSearches = 0;
  let totalAiProfiles = 0;
  let totalZeroResults = 0;
  let totalFilterEvents = 0;

  const filterBrandsMap = new Map();
  const filterSellersMap = new Map();
  const filterFormatsMap = new Map();
  const filterTabsMap = new Map();
  const filterDnasMap = new Map();
  const filterVibesMap = new Map();
  const filterBudgets = [];
  const allFiltersMap = new Map();

  const trackFilter = (category, value, label, sId, createdAt, resultsCount) => {
    if (!value || value === 'all') return;
    const key = `${category}:${value}`;
    if (!allFiltersMap.has(key)) {
      allFiltersMap.set(key, {
        id: key,
        category,
        value,
        name: label || value,
        count: 0,
        sessions: new Set(),
        totalResults: 0,
        lastUsed: createdAt
      });
    }
    const item = allFiltersMap.get(key);
    item.count++;
    if (sId) item.sessions.add(sId);
    if (resultsCount !== undefined && resultsCount !== null) {
      item.totalResults += Number(resultsCount) || 0;
    }
    if (!item.lastUsed || new Date(createdAt) > new Date(item.lastUsed)) {
      item.lastUsed = createdAt;
    }
  };

  let totalGrossPipeline = 0;
  let totalBottleGmv = 0;
  let totalDecantGmv = 0;

  let totalBottleConverts = 0;
  let totalDecantConverts = 0;

  // Traffic Acquisition & Device Intelligence
  let totalSessionVisits = 0;
  const sessionSourceMap = new Map();
  const sessionDeviceMap = new Map();
  const rawReferrersMap = new Map();

  const channelMap = {
    reddit: {
      id: 'reddit',
      name: 'Reddit Community',
      subtitle: 'r/DesiFragranceAddicts & Reddit App',
      visits: 0,
      sessions: new Set(),
      conversions: 0,
      androidAppVisits: 0,
      webVisits: 0,
      color: '#FF4500',
      badgeBg: 'bg-orange-500/10 text-orange-400 border-orange-500/20'
    },
    direct: {
      id: 'direct',
      name: 'Direct & Bookmarks',
      subtitle: 'Direct URLs, WhatsApp & Telegram shares',
      visits: 0,
      sessions: new Set(),
      conversions: 0,
      androidAppVisits: 0,
      webVisits: 0,
      color: '#3B82F6',
      badgeBg: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    },
    google: {
      id: 'google',
      name: 'Google Search',
      subtitle: 'Organic Web & Google App Search',
      visits: 0,
      sessions: new Set(),
      conversions: 0,
      androidAppVisits: 0,
      webVisits: 0,
      color: '#10B981',
      badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    },
    other: {
      id: 'other',
      name: 'Other Referrals',
      subtitle: 'Bing, Twitter/X, Instagram, etc.',
      visits: 0,
      sessions: new Set(),
      conversions: 0,
      androidAppVisits: 0,
      webVisits: 0,
      color: '#A855F7',
      badgeBg: 'bg-purple-500/10 text-purple-400 border-purple-500/20'
    }
  };

  const deviceMap = {
    androidApp: 0,
    mobileOrDesktopWeb: 0
  };

  // Day bucket helper
  const addDayVelocity = (dateStr, type, extra = {}) => {
    if (!dateStr) return;
    const d = new Date(dateStr);
    const dayKey = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dayVelocityMap[dayKey]) {
      dayVelocityMap[dayKey] = {
        date: dayKey,
        rawDate: d,
        isoDate: d.toISOString().split('T')[0],
        visits: 0,
        uniqueSessions: new Set(),
        searches: 0,
        cardOpens: 0,
        converts: 0,
        bottles: 0,
        decants: 0,
        gmv: 0,
        redditVisits: 0,
        directVisits: 0,
        googleVisits: 0,
        filters: 0
      };
    }
    const day = dayVelocityMap[dayKey];
    if (extra.sId) day.uniqueSessions.add(extra.sId);
    if (type === 'visit') {
      day.visits++;
      if (extra.channel === 'reddit') day.redditVisits++;
      else if (extra.channel === 'google') day.googleVisits++;
      else day.directVisits++;
    }
    if (type === 'search') day.searches++;
    if (type === 'card') day.cardOpens++;
    if (type === 'filter') day.filters = (day.filters || 0) + 1;
    if (type === 'convert_bottle') {
      day.converts++;
      day.bottles++;
      if (extra.price) day.gmv += Number(extra.price);
    }
    if (type === 'convert_decant') {
      day.converts++;
      day.decants++;
      if (extra.price) day.gmv += Number(extra.price);
    }
  };

  // 3. Process each event
  for (const r of filteredRows) {
    const sId = r.session_id || 'anon_session';
    const title = (r.umbrella_title || '').trim();
    const payload = Array.isArray(r.liked_perfumes) && r.liked_perfumes[0] ? r.liked_perfumes[0] : {};
    const createdAt = r.created_at;

    if (!sessions.has(sId)) {
      sessions.set(sId, {
        id: sId,
        searches: [],
        aiProfiles: [],
        cardClicks: [],
        waClicks: [],
        hasFilter: false,
        filterEvents: [],
        firstSeen: createdAt
      });
    }
    const sess = sessions.get(sId);

    // EVENT: Session Visit & Traffic Acquisition
    if (title === 'EVENT:session_visit') {
      totalSessionVisits++;

      const src = (payload.source || r.umbrella_season?.replace('source:', '') || 'direct').toLowerCase();
      const ref = (payload.referrer || 'direct').toLowerCase();
      const host = (payload.hostname || 'direct').toLowerCase();

      let chKey = 'direct';
      let isAndroidApp = false;

      if (src.includes('reddit') || ref.includes('reddit') || host.includes('reddit')) {
        chKey = 'reddit';
        if (ref.includes('com.reddit.frontpage') || src.includes('com.reddit.frontpage') || host.includes('com.reddit.frontpage')) {
          isAndroidApp = true;
          channelMap.reddit.androidAppVisits++;
        } else {
          channelMap.reddit.webVisits++;
        }
      } else if (src.includes('google') || ref.includes('google') || host.includes('google')) {
        chKey = 'google';
        if (ref.includes('googlequicksearchbox') || host.includes('googlequicksearchbox')) {
          isAndroidApp = true;
          channelMap.google.androidAppVisits++;
        } else {
          channelMap.google.webVisits++;
        }
      } else if (src === 'localhost' || ref.includes('localhost')) {
        chKey = 'other';
        channelMap.other.webVisits++;
      } else if (src !== 'direct' && ref !== 'direct') {
        chKey = 'other';
        channelMap.other.webVisits++;
      } else {
        chKey = 'direct';
        channelMap.direct.webVisits++;
      }

      addDayVelocity(createdAt, 'visit', { sId, channel: chKey });

      channelMap[chKey].visits++;
      channelMap[chKey].sessions.add(sId);

      if (isAndroidApp) deviceMap.androidApp++;
      else deviceMap.mobileOrDesktopWeb++;

      if (!sessionSourceMap.has(sId)) {
        sessionSourceMap.set(sId, chKey);
      }
      if (!sessionDeviceMap.has(sId)) {
        sessionDeviceMap.set(sId, isAndroidApp ? 'Android App' : 'Web Browser');
      }

      const displayRef = payload.referrer || 'direct';
      rawReferrersMap.set(displayRef, (rawReferrersMap.get(displayRef) || 0) + 1);
    }
    // EVENT: AI Search Query
    else if (title === 'EVENT:search_query') {
      totalSearches++;
      addDayVelocity(createdAt, 'search', { sId });
      const q = (payload.query || r.umbrella_season || '').trim().toLowerCase();
      if (q && q.length >= 2 && !q.startsWith('anchor:')) {
        sess.searches.push(q);
        if (!searchQueries.has(q)) {
          searchQueries.set(q, { query: q, count: 0, sessions: new Set(), zeroResults: 0, converts: 0 });
        }
        const sq = searchQueries.get(q);
        sq.count++;
        sq.sessions.add(sId);
        if (payload.results_count === 0) {
          sq.zeroResults++;
          totalZeroResults++;
        }
      }
    }
    // EVENT: Catalog Filter Applied by Shopper
    else if (title === 'EVENT:filter_applied') {
      // Ignore synthetic test verification payloads
      if (payload.dna === 'aventus' && payload.seller === 'Talib Musa') {
        continue;
      }

      totalFilterEvents++;
      addDayVelocity(createdAt, 'filter', { sId });
      sess.hasFilter = true;
      sess.filterEvents = sess.filterEvents || [];
      sess.filterEvents.push(payload);

      liveClickStream.push({
        id: `filter_${createdAt}_${Math.random()}`,
        timestamp: createdAt,
        type: 'filter_applied',
        name: payload.summary || r.umbrella_season?.split('|')?.[0] || 'Catalog Filter',
        brand: payload.brand || 'All Brands',
        format: Array.isArray(payload.formats) ? payload.formats.join(', ') : (payload.formats || 'any'),
        price: payload.max_budget || null,
        seller: payload.seller || null,
        sessionId: sId,
        source: payload.source || 'direct',
        resultsCount: payload.results_count || 0
      });

      if (payload.brand && payload.brand !== 'all') {
        trackFilter('Brand', payload.brand, payload.brand, sId, createdAt, payload.results_count);
        filterBrandsMap.set(payload.brand, (filterBrandsMap.get(payload.brand) || 0) + 1);
      }
      if (payload.seller && payload.seller !== 'all') {
        trackFilter('Seller', payload.seller, payload.seller, sId, createdAt, payload.results_count);
        filterSellersMap.set(payload.seller, (filterSellersMap.get(payload.seller) || 0) + 1);
      }
      if (Array.isArray(payload.formats)) {
        payload.formats.forEach(f => {
          const formatLabel = f === 'decant' ? 'Decants Ready' : (f === 'tester' ? 'Testers' : (f === 'partial' ? 'Partials' : 'Retail Bottles'));
          trackFilter('Format', f, formatLabel, sId, createdAt, payload.results_count);
          filterFormatsMap.set(f, (filterFormatsMap.get(f) || 0) + 1);
        });
      }
      if (payload.quick_tab && payload.quick_tab !== 'all') {
        const tabLabel = payload.quick_tab === 'decants' ? 'Decants Ready' : (payload.quick_tab === 'drops' ? 'Price Drops' : (payload.quick_tab === 'preferred' ? 'Most Preferred' : (payload.quick_tab === 'testers' ? 'Testers' : (payload.quick_tab === 'partials' ? 'Partials' : payload.quick_tab))));
        trackFilter('Quick Tab', payload.quick_tab, tabLabel, sId, createdAt, payload.results_count);
        filterTabsMap.set(payload.quick_tab, (filterTabsMap.get(payload.quick_tab) || 0) + 1);
      }
      if (payload.deals_only) {
        const dealLabel = payload.deals_only === 'drops' ? 'Price Drops (Arbitrage)' : (payload.deals_only === 'preferred' ? 'Most Preferred' : (payload.deals_only === 'new' ? 'New Arrivals' : payload.deals_only));
        trackFilter('Deal Lens', payload.deals_only, dealLabel, sId, createdAt, payload.results_count);
      }
      if (payload.dna) {
        trackFilter('DNA Profile', payload.dna, `DNA: ${payload.dna}`, sId, createdAt, payload.results_count);
        filterDnasMap.set(payload.dna, (filterDnasMap.get(payload.dna) || 0) + 1);
      }
      if (payload.vibe) {
        trackFilter('Scent Vibe', payload.vibe, `Vibe: ${payload.vibe}`, sId, createdAt, payload.results_count);
        filterVibesMap.set(payload.vibe, (filterVibesMap.get(payload.vibe) || 0) + 1);
      }
      if (payload.max_budget && Number(payload.max_budget) < 15000) {
        const bVal = Number(payload.max_budget);
        trackFilter('Budget Limit', `< ₹${bVal.toLocaleString()}`, `Under ₹${bVal.toLocaleString()}`, sId, createdAt, payload.results_count);
        filterBudgets.push(bVal);
      }
      if (payload.sort_by && payload.sort_by !== 'price_asc') {
        const sortLabel = payload.sort_by === 'price_desc' ? 'Price: High to Low' : (payload.sort_by === 'rating_desc' ? 'Highest Rating' : (payload.sort_by === 'rating_count' ? 'Most Reviews' : payload.sort_by));
        trackFilter('Sort Order', payload.sort_by, sortLabel, sId, createdAt, payload.results_count);
      }
    }
    // AI Curated Umbrellas & Taste Profiles
    else if (title.includes('Umbrella') || title.includes('Profile')) {
      totalAiProfiles++;
      sess.aiProfiles.push(title);
    }
    // EVENT: Card Detail Click / Open
    else if (title === 'EVENT:card_click') {
      totalCardClicks++;
      addDayVelocity(createdAt, 'card', { sId });
      sess.cardClicks.push(payload);

      liveClickStream.push({
        id: `card_${createdAt}_${Math.random()}`,
        timestamp: createdAt,
        type: 'card_open',
        name: payload.name || 'Fragrance Card',
        brand: payload.brand || '',
        format: payload.format || (r.umbrella_season?.includes('decant') ? 'decant' : 'bottle'),
        price: payload.price || null,
        seller: payload.seller_name || null,
        sessionId: sId,
        source: payload.source || 'direct'
      });
    }
    // EVENT: WhatsApp Buy Conversion Click
    else if (title === 'EVENT:whatsapp_click') {
      totalWhatsAppClicks++;
      sess.waClicks.push(payload);

      // Attribution to acquisition channel
      const userCh = sessionSourceMap.get(sId) ||
        ((payload.source?.includes('reddit') || r.umbrella_season?.includes('reddit')) ? 'reddit' :
         (payload.source?.includes('google') || r.umbrella_season?.includes('google')) ? 'google' : 'direct');
      if (channelMap[userCh]) {
        channelMap[userCh].conversions++;
      }

      const sellerName = payload.seller_name || 'Unattributed Seller';
      const fmt = payload.format || (r.umbrella_season?.includes('decant') ? 'decant' : 'bottle');
      const price = Number(payload.price || 0);

      if (fmt === 'decant') {
        totalDecantConverts++;
        addDayVelocity(createdAt, 'convert_decant', { sId, price });
        if (price > 0) totalDecantGmv += price;
        if (payload.name) {
          const k = payload.brand ? `${payload.brand} - ${payload.name}` : payload.name;
          topDecantsMap.set(k, (topDecantsMap.get(k) || 0) + 1);
        }
        if (payload.size) {
          decantSizesMap.set(payload.size, (decantSizesMap.get(payload.size) || 0) + 1);
        }
      } else {
        totalBottleConverts++;
        addDayVelocity(createdAt, 'convert_bottle', { sId, price });
        if (price > 0) totalBottleGmv += price;
        if (payload.name) {
          const k = payload.brand ? `${payload.brand} - ${payload.name}` : payload.name;
          topBottlesMap.set(k, (topBottlesMap.get(k) || 0) + 1);
        }
      }

      if (price > 0) totalGrossPipeline += price;

      // Seller aggregation
      if (!sellerMap.has(sellerName)) {
        sellerMap.set(sellerName, {
          name: sellerName,
          verified: true,
          totalConverts: 0,
          bottleConverts: 0,
          decantConverts: 0,
          inquiredGmv: 0,
          prices: [],
          perfumes: new Map(),
          lastConvertAt: createdAt
        });
      }
      const sEntry = sellerMap.get(sellerName);
      sEntry.totalConverts++;
      if (fmt === 'decant') sEntry.decantConverts++;
      else sEntry.bottleConverts++;
      if (price > 0) {
        sEntry.inquiredGmv += price;
        sEntry.prices.push(price);
      }
      if (payload.name) {
        sEntry.perfumes.set(payload.name, (sEntry.perfumes.get(payload.name) || 0) + 1);
      }
      if (new Date(createdAt) > new Date(sEntry.lastConvertAt)) {
        sEntry.lastConvertAt = createdAt;
      }

      liveClickStream.push({
        id: `wa_${createdAt}_${Math.random()}`,
        timestamp: createdAt,
        type: 'whatsapp_convert',
        name: payload.name || 'Fragrance Inquiry',
        brand: payload.brand || '',
        format: fmt,
        price: price > 0 ? price : null,
        seller: sellerName,
        sessionId: sId,
        source: payload.source || (r.umbrella_season?.includes('source:') ? r.umbrella_season.split('source:')[1] : 'direct')
      });
    }
  }

  // 4. Compute AI Interaction & Session Engagement Metrics
  const validSessions = Array.from(sessions.values()).filter(s => s.id !== 'anon' && s.id !== 'anon_session');
  const engagedSessions = validSessions.filter(s => s.searches.length > 0 || s.aiProfiles.length > 0);
  const convertingSessions = validSessions.filter(s => s.waClicks.length > 0);

  const queryLengths = engagedSessions.map(s => s.searches.length).filter(l => l > 0);
  const totalEngagedQueries = queryLengths.reduce((a, b) => a + b, 0);
  const avgQueriesPerEngagedSession = queryLengths.length > 0
    ? Number((totalEngagedQueries / queryLengths.length).toFixed(2))
    : 0;

  const queryDepth = {
    single: queryLengths.filter(l => l === 1).length,
    light: queryLengths.filter(l => l >= 2 && l <= 3).length,
    deep: queryLengths.filter(l => l >= 4 && l <= 6).length,
    power: queryLengths.filter(l => l >= 7).length
  };
  const totalDepthSessions = queryLengths.length || 1;
  const queryDepthPercent = {
    single: Number(((queryDepth.single / totalDepthSessions) * 100).toFixed(1)),
    light: Number(((queryDepth.light / totalDepthSessions) * 100).toFixed(1)),
    deep: Number(((queryDepth.deep / totalDepthSessions) * 100).toFixed(1)),
    power: Number(((queryDepth.power / totalDepthSessions) * 100).toFixed(1))
  };

  // 5. Final Seller Conversion Table
  const sellerConversions = Array.from(sellerMap.values()).map(s => {
    const platformShare = totalWhatsAppClicks > 0
      ? Number(((s.totalConverts / totalWhatsAppClicks) * 100).toFixed(1))
      : 0;
    const bottleShare = s.totalConverts > 0
      ? Number(((s.bottleConverts / s.totalConverts) * 100).toFixed(1))
      : 0;
    const decantShare = s.totalConverts > 0
      ? Number(((s.decantConverts / s.totalConverts) * 100).toFixed(1))
      : 0;
    const avgAov = s.prices.length > 0
      ? Math.round(s.inquiredGmv / s.prices.length)
      : null;

    const topPerfumesList = Array.from(s.perfumes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([perfume, count]) => `${perfume} (${count})`);

    return {
      name: s.name,
      verified: s.verified,
      totalConverts: s.totalConverts,
      bottleConverts: s.bottleConverts,
      decantConverts: s.decantConverts,
      bottleShare,
      decantShare,
      platformShare,
      inquiredGmv: s.inquiredGmv,
      avgAov,
      topPerfumes: topPerfumesList,
      lastConvertAt: s.lastConvertAt
    };
  }).sort((a, b) => b.totalConverts - a.totalConverts);

  // 6. Decant vs Retail Analysis
  const topBottles = Array.from(topBottlesMap.entries())
    .map(([name, count]) => ({ name, count, share: Number(((count / (totalBottleConverts || 1)) * 100).toFixed(1)) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topDecants = Array.from(topDecantsMap.entries())
    .map(([name, count]) => ({ name, count, share: Number(((count / (totalDecantConverts || 1)) * 100).toFixed(1)) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topSearches = Array.from(searchQueries.values())
    .map(sq => ({
      query: sq.query,
      count: sq.count,
      uniqueSessions: sq.sessions.size,
      zeroResults: sq.zeroResults
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const dailyVelocity = Object.values(dayVelocityMap)
    .sort((a, b) => a.rawDate - b.rawDate)
    .map(d => {
      const uCount = d.uniqueSessions.size || (d.visits > 0 ? Math.round(d.visits * 0.55) : (d.converts > 0 ? 1 : 0));
      const convRate = uCount > 0 ? Number(((d.converts / uCount) * 100).toFixed(1)) : 0;
      return {
        date: d.date,
        rawDate: d.rawDate,
        isoDate: d.isoDate,
        visits: d.visits,
        uniqueVisitors: uCount,
        converts: d.converts,
        bottles: d.bottles,
        decants: d.decants,
        gmv: d.gmv,
        conversionRate: convRate,
        redditVisits: d.redditVisits,
        directVisits: d.directVisits,
        googleVisits: d.googleVisits,
        searches: d.searches,
        cardOpens: d.cardOpens
      };
    });

  const sessionConversionRate = validSessions.length > 0
    ? Number(((convertingSessions.length / validSessions.length) * 100).toFixed(1))
    : 0;

  // Traffic Acquisition Analytics Calculation
  const uniqueVisitorSessions = new Set();
  Object.values(channelMap).forEach(c => c.sessions.forEach(s => uniqueVisitorSessions.add(s)));
  const totalUniqueVisitors = uniqueVisitorSessions.size || 1;

  const channelsList = Object.values(channelMap).map(c => {
    const vShare = totalSessionVisits > 0 ? Number(((c.visits / totalSessionVisits) * 100).toFixed(1)) : 0;
    const uCount = c.sessions.size;
    const uShare = Number(((uCount / totalUniqueVisitors) * 100).toFixed(1));
    const convRate = uCount > 0 ? Number(((c.conversions / uCount) * 100).toFixed(1)) : 0;
    const androidShare = c.visits > 0 ? Number(((c.androidAppVisits / c.visits) * 100).toFixed(1)) : 0;
    const webShare = c.visits > 0 ? Number(((c.webVisits / c.visits) * 100).toFixed(1)) : 0;

    return {
      id: c.id,
      name: c.name,
      subtitle: c.subtitle,
      visits: c.visits,
      visitShare: vShare,
      uniqueVisitors: uCount,
      uniqueShare: uShare,
      conversions: c.conversions,
      conversionRate: convRate,
      androidAppVisits: c.androidAppVisits,
      androidAppShare: androidShare,
      webVisits: c.webVisits,
      webShare: webShare,
      color: c.color,
      badgeBg: c.badgeBg
    };
  }).sort((a, b) => b.visits - a.visits);

  const totalDeviceVisits = (deviceMap.androidApp + deviceMap.mobileOrDesktopWeb) || 1;
  const deviceMix = {
    androidApp: {
      count: deviceMap.androidApp,
      share: Number(((deviceMap.androidApp / totalDeviceVisits) * 100).toFixed(1)),
      label: 'Android Native Apps (Reddit App, Google App)'
    },
    web: {
      count: deviceMap.mobileOrDesktopWeb,
      share: Number(((deviceMap.mobileOrDesktopWeb / totalDeviceVisits) * 100).toFixed(1)),
      label: 'Web Browsers (Desktop & Mobile Web)'
    }
  };

  const topReferrers = Array.from(rawReferrersMap.entries())
    .map(([ref, count]) => ({
      referrer: ref,
      cleanName: ref === 'direct' ? 'Direct / Bookmark / WhatsApp Chat' :
                 ref.includes('com.reddit.frontpage') ? 'Reddit Android App' :
                 ref.includes('reddit.com') ? 'Reddit Web (r/DesiFragranceAddicts)' :
                 ref.includes('googlequicksearchbox') ? 'Google Android Search' :
                 ref.includes('google.') ? 'Google Search' : ref,
      count,
      share: totalSessionVisits > 0 ? Number(((count / totalSessionVisits) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Filter Adoption & Conversion Intelligence (Main search box excluded)
  const allSessionsList = Array.from(sessions.values());
  const totalSessionsCount = allSessionsList.length || 1;
  const filterUserSessions = allSessionsList.filter(s => s.hasFilter);
  const filterUserSessionsCount = filterUserSessions.length;
  const filterAdoptionRate = Number(((filterUserSessionsCount / totalSessionsCount) * 100).toFixed(1));
  const avgFiltersPerEngagedUser = filterUserSessionsCount > 0 ? Number((totalFilterEvents / filterUserSessionsCount).toFixed(1)) : 0;

  // Filter Users vs Non-Filter Users WhatsApp Conversions
  const filterUserConversions = filterUserSessions.filter(s => s.waClicks && s.waClicks.length > 0).length;
  const filterConversionRate = filterUserSessionsCount > 0 ? Number(((filterUserConversions / filterUserSessionsCount) * 100).toFixed(1)) : 0;

  const nonFilterUserSessions = allSessionsList.filter(s => !s.hasFilter);
  const nonFilterUserSessionsCount = nonFilterUserSessions.length;
  const nonFilterUserConversions = nonFilterUserSessions.filter(s => s.waClicks && s.waClicks.length > 0).length;
  const nonFilterConversionRate = nonFilterUserSessionsCount > 0 ? Number(((nonFilterUserConversions / nonFilterUserSessionsCount) * 100).toFixed(1)) : 0;

  const conversionLiftMultiplier = nonFilterConversionRate > 0 ? Number((filterConversionRate / nonFilterConversionRate).toFixed(2)) : (filterConversionRate > 0 ? 2.0 : 1.0);

  return {
    timeframe: {
      preset,
      customStart,
      customEnd,
      label,
      eventsCount: filteredRows.length
    },
    kpis: {
      totalClicks: totalCardClicks + totalWhatsAppClicks + totalSearches + totalFilterEvents,
      totalWhatsAppConverts: totalWhatsAppClicks,
      totalBottleConverts,
      totalDecantConverts,
      bottleConvertShare: totalWhatsAppClicks > 0 ? Number(((totalBottleConverts / totalWhatsAppClicks) * 100).toFixed(1)) : 0,
      decantConvertShare: totalWhatsAppClicks > 0 ? Number(((totalDecantConverts / totalWhatsAppClicks) * 100).toFixed(1)) : 0,
      totalSessions: validSessions.length,
      engagedSessionsCount: engagedSessions.length,
      sessionConversionRate,
      inquiredGmv: totalGrossPipeline,
      bottleGmv: totalBottleGmv,
      decantGmv: totalDecantGmv,
      avgAov: totalWhatsAppClicks > 0 ? Math.round(totalGrossPipeline / totalWhatsAppClicks) : 0,
      totalCardClicks,
      totalSearches,
      totalFilterEvents,
      totalSessionVisits,
      totalUniqueVisitors,
      redditShare: channelsList.find(c => c.id === 'reddit')?.visitShare || 0,
      directShare: channelsList.find(c => c.id === 'direct')?.visitShare || 0,
      googleShare: channelsList.find(c => c.id === 'google')?.visitShare || 0,
      androidAppShare: deviceMix.androidApp.share
    },
    aiInteraction: {
      totalQueries: totalSearches,
      engagedSessionsCount: engagedSessions.length,
      avgQueriesPerEngagedSession,
      queryDepth,
      queryDepthPercent,
      totalZeroResults,
      zeroResultRate: totalSearches > 0 ? Number(((totalZeroResults / totalSearches) * 100).toFixed(1)) : 0,
      aiProfilesTriggered: totalAiProfiles,
      topQueries: topSearches
    },
    userFunnel: {
      visitorSessions: validSessions.length,
      aiEngagedSessions: engagedSessions.length,
      cardOpens: totalCardClicks,
      whatsAppConverts: totalWhatsAppClicks,
      searchToCardRate: totalSearches > 0 ? Number(((totalCardClicks / totalSearches) * 100).toFixed(1)) : 0,
      cardToBuyRate: totalCardClicks > 0 ? Number(((totalWhatsAppClicks / totalCardClicks) * 100).toFixed(1)) : 0,
      visitorToBuyRate: sessionConversionRate
    },
    sellerConversions,
    decantVsRetail: {
      bottleConverts: totalBottleConverts,
      decantConverts: totalDecantConverts,
      bottleGmv: totalBottleGmv,
      decantGmv: totalDecantGmv,
      avgBottleAov: totalBottleConverts > 0 ? Math.round(totalBottleGmv / totalBottleConverts) : 0,
      avgDecantAov: totalDecantConverts > 0 ? Math.round(totalDecantGmv / totalDecantConverts) : 0,
      topBottles,
      topDecants
    },
    catalogFilters: {
      totalFilterEvents,
      totalSessionsCount,
      filterUserSessionsCount,
      filterAdoptionRate,
      avgFiltersPerEngagedUser,
      filterUserConversions,
      filterConversionRate,
      nonFilterUserSessionsCount,
      nonFilterUserConversions,
      nonFilterConversionRate,
      conversionLiftMultiplier,
      allFiltersList: Array.from(allFiltersMap.values()).map(f => ({
        id: f.id,
        category: f.category,
        value: f.value,
        name: f.name,
        count: f.count,
        sessionsCount: f.sessions.size,
        percentOfTotal: totalFilterEvents > 0 ? Number(((f.count / totalFilterEvents) * 100).toFixed(1)) : 0,
        avgResults: f.count > 0 ? Math.round(f.totalResults / f.count) : 0,
        lastUsed: f.lastUsed
      })).sort((a, b) => b.count - a.count),
      topBrands: Array.from(filterBrandsMap.entries()).map(([brand, count]) => ({ brand, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      topSellers: Array.from(filterSellersMap.entries()).map(([seller, count]) => ({ seller, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      topFormats: Array.from(filterFormatsMap.entries()).map(([format, count]) => ({ format, count })).sort((a, b) => b.count - a.count),
      topTabs: Array.from(filterTabsMap.entries()).map(([tab, count]) => ({ tab, count })).sort((a, b) => b.count - a.count),
      topDnas: Array.from(filterDnasMap.entries()).map(([dna, count]) => ({ dna, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      topVibes: Array.from(filterVibesMap.entries()).map(([vibe, count]) => ({ vibe, count })).sort((a, b) => b.count - a.count).slice(0, 10),
      avgBudget: filterBudgets.length > 0 ? Math.round(filterBudgets.reduce((a, b) => a + b, 0) / filterBudgets.length) : null
    },
    trafficAcquisition: {
      totalVisits: totalSessionVisits,
      totalUniqueVisitors,
      channels: channelsList,
      deviceMix,
      topReferrers,
      topChannel: channelsList[0] || null,
      highestConvertingChannel: [...channelsList].sort((a, b) => b.conversionRate - a.conversionRate)[0] || null
    },
    dailyVelocity,
    liveClickStream: liveClickStream.slice(0, 100)
  };
}

let cachedChatLogs = null;
let lastChatLogsFetch = 0;

/**
 * Fetch raw Ask Khushboo chat messages from Supabase
 */
export async function fetchKhushbooChatLogs(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedChatLogs && (now - lastChatLogsFetch) < LOGS_CACHE_TTL) {
    return cachedChatLogs;
  }

  try {
    if (!supabase) throw new Error("Supabase client is not configured");

    const { data, error } = await supabase
      .from('ai_chat_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);

    if (error) {
      console.error('[FragAdmin] fetchKhushbooChatLogs error:', error);
      return cachedChatLogs || [];
    }

    cachedChatLogs = data || [];
    lastChatLogsFetch = Date.now();
    return cachedChatLogs;
  } catch (err) {
    console.error('[FragAdmin] fetchKhushbooChatLogs exception:', err);
    return cachedChatLogs || [];
  }
}

/**
 * Computes analytics and dialogue turns for Ask Khushboo within a date range
 */
export function computeKhushbooAnalytics(rawChatMessages = [], { preset = '7d', customStart = null, customEnd = null } = {}) {
  const { start, end, label } = getDateBoundaries(preset, customStart, customEnd);

  // 1. Filter messages by date boundaries
  const filtered = (rawChatMessages || []).filter(m => {
    if (!m.created_at) return false;
    const t = new Date(m.created_at);
    if (start && t < start) return false;
    if (end && t > end) return false;
    return true;
  });

  // 2. Sort chronologically to pair user questions with assistant responses
  const sorted = [...filtered].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  // Group by session
  const sessionMap = new Map();
  sorted.forEach(m => {
    const sId = m.session_id || 'unknown_session';
    if (!sessionMap.has(sId)) sessionMap.set(sId, []);
    sessionMap.get(sId).push(m);
  });

  const dialogTurns = [];
  const conversationThreads = [];
  let totalMatchesSum = 0;
  let queriesWithMatchesCount = 0;
  let rateLimitedCount = 0;
  const wordFrequency = new Map();

  const stopWords = new Set(["i", "me", "my", "myself", "we", "our", "you", "your", "he", "she", "it", "they", "what", "which", "who", "whom", "this", "that", "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until", "while", "of", "at", "by", "for", "with", "about", "against", "between", "into", "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now", "like", "love", "want", "need", "give", "looking", "recommend", "perfume", "perfumes", "fragrance", "fragrances"]);

  sessionMap.forEach((msgs, sessionId) => {
    const userMsgs = msgs.filter(m => m.role === 'user');
    const totalSessionTurns = userMsgs.length;
    const threadTurns = [];
    let turnIndex = 0;
    let prevUserQuery = null;

    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].role === 'user') {
        turnIndex++;
        const u = msgs[i];
        const a = msgs.slice(i + 1).find(m => m.role === 'assistant');

        const matches = a?.matched_ids || [];
        const matchCount = matches.length;
        const matchedCards = a?.matched_cards || [];
        const isRateLimit = a?.intent === 'service_down' || (a?.content && a.content.includes('daily limit'));

        if (isRateLimit) rateLimitedCount++;
        if (matchCount > 0) {
          totalMatchesSum += matchCount;
          queriesWithMatchesCount++;
        }

        // Extract topic keywords
        const words = (u.content || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/);
        words.forEach(w => {
          if (w.length >= 3 && !stopWords.has(w)) {
            wordFrequency.set(w, (wordFrequency.get(w) || 0) + 1);
          }
        });

        // --- STRUCTURED QUERY CRUX EXTRACTION ---
        const qLower = (u.content || '').toLowerCase();

        // 1. Category & Olfactory Archetype
        let category = 'General Discovery';
        let categoryColor = 'indigo';
        if (/water|marine|aquatic|sea|beach|calone|ocean/i.test(qLower)) {
          category = 'Aquatic & Watery';
          categoryColor = 'cyan';
        } else if (/citrus|lemon|bergamot|grapefruit|gym/i.test(qLower) && !/winter|cozy|vanilla/i.test(qLower)) {
          category = 'Citrus & High-Heat Fresh';
          categoryColor = 'emerald';
        } else if (/vanilla|gourmand|sweet|caramel|dates|chocolate|coffee|tiramisu/i.test(qLower)) {
          category = 'Sweet & Gourmand';
          categoryColor = 'amber';
        } else if (/winter|cold|cozy|boozy|rum|cognac|spiced/i.test(qLower)) {
          category = 'Cozy Winter & Boozy';
          categoryColor = 'orange';
        } else if (/office|work|daily|barbershop|soapy|clean|lavender|fougere/i.test(qLower)) {
          category = 'Office & Clean Daily';
          categoryColor = 'blue';
        } else if (/leather|tobacco|smoky|dark|mysterious|oud|ash/i.test(qLower)) {
          category = 'Dark Smoky & Leather';
          categoryColor = 'purple';
        } else if (/iris|powdery|gentleman|luxury|date night/i.test(qLower)) {
          category = 'Iris & Seductive Evening';
          categoryColor = 'rose';
        } else if (/blue|versatile|compliment/i.test(qLower)) {
          category = 'Blue & Crowd Pleaser';
          categoryColor = 'sky';
        } else if (/clone|dupe|alternative|inspired/i.test(qLower)) {
          category = 'Clone & DNA Seeker';
          categoryColor = 'teal';
        }

        // 2. Budget Detection
        let budgetConstraint = null;
        const budgetMatch = qLower.match(/(?:under|below|budget|less than|max)\s*(?:rs\.?|inr|₹)?\s*(\d{3,5})/i) ||
                            qLower.match(/(\d{3,5})\s*(?:rs\.?|inr|₹|budget|rupees)/i);
        if (budgetMatch) {
          budgetConstraint = `Under ₹${Number(budgetMatch[1]).toLocaleString()}`;
        } else if (/cheap|budget|affordable|pocket friendly/i.test(qLower)) {
          budgetConstraint = 'Budget-Conscious';
        }

        // 3. Season Detection
        let season = 'All Season';
        if (/summer|heat|hot/i.test(qLower)) season = 'Summer';
        else if (/winter|cold/i.test(qLower)) season = 'Winter';
        else if (/monsoon|rain/i.test(qLower)) season = 'Monsoon / Rain';
        else if (/spring/i.test(qLower)) season = 'Spring';

        // 4. Notes Extracted
        const detectedNotes = [];
        ['mint', 'lavender', 'marine', 'sea notes', 'citrus', 'lemon', 'bergamot', 'vanilla', 'coffee', 'chocolate', 'dates', 'iris', 'leather', 'tobacco', 'vetiver', 'oud', 'cinnamon', 'watermelon', 'ambergris', 'apple', 'pepper'].forEach(n => {
          if (qLower.includes(n)) detectedNotes.push(n);
        });

        // 5. DNA / Reference Brand
        let referenceDNA = null;
        if (/bdc|bleu de chanel/i.test(qLower)) referenceDNA = 'Bleu de Chanel';
        else if (/sauvage/i.test(qLower)) referenceDNA = 'Dior Sauvage';
        else if (/aventus/i.test(qLower)) referenceDNA = 'Creed Aventus';
        else if (/adg|profondo|acqua di gio/i.test(qLower)) referenceDNA = 'Acqua Di Gio';
        else if (/angels share|khamrah/i.test(qLower)) referenceDNA = "Angels' Share";
        else if (/hawas/i.test(qLower)) referenceDNA = 'Rasasi Hawas';
        else if (/megamare/i.test(qLower)) referenceDNA = 'Orto Parisi Megamare';
        else if (/ysl y|fakhar/i.test(qLower)) referenceDNA = 'YSL Y';
        else if (/tygar/i.test(qLower)) referenceDNA = 'Bvlgari Tygar';

        // 6. Semantic Vector Search Query (Stored or Reconstructed)
        const storedSemanticPrompt = matchedCards[0]?._semantic_search_prompt || null;
        const semanticSearchPrompt = storedSemanticPrompt || [
          category !== 'General Discovery' ? category : '',
          season !== 'All Season' ? season : '',
          detectedNotes.join(' '),
          referenceDNA ? `inspired by ${referenceDNA}` : '',
          budgetConstraint ? budgetConstraint : '',
          a?.taste_summary || u.content
        ].filter(Boolean).join(' ').trim();

        const turnObj = {
          id: u.id,
          sessionId,
          turnNumber: turnIndex,
          totalSessionTurns,
          isMultiTurn: totalSessionTurns > 1,
          isRefinement: turnIndex > 1,
          previousQuery: prevUserQuery,
          timestamp: u.created_at,
          query: u.content || '',
          reply: a?.content || '',
          intent: a?.intent || u.intent || 'chat',
          tasteSummary: a?.taste_summary || '',
          semanticSearchPrompt,
          isStoredSemantic: Boolean(storedSemanticPrompt),
          crux: {
            category,
            categoryColor,
            season,
            budgetConstraint,
            detectedNotes,
            referenceDNA,
            diagnosis: a?.taste_summary || u.content || ''
          },
          matchedIds: matches,
          matchedCount: matchCount,
          matchedCards: matchedCards,
          suggestions: a?.suggestions || [],
          status: isRateLimit ? 'rate_limited' : (matchCount > 0 ? 'success' : 'conversational')
        };

        dialogTurns.push(turnObj);
        threadTurns.push(turnObj);
        prevUserQuery = u.content;
      }
    }

    if (threadTurns.length > 0) {
      conversationThreads.push({
        sessionId,
        startedAt: msgs[0].created_at,
        lastActiveAt: msgs[msgs.length - 1].created_at,
        totalTurns: threadTurns.length,
        isMultiTurn: threadTurns.length > 1,
        primaryCategory: threadTurns[0]?.crux?.category || 'General',
        cruxSummary: threadTurns[threadTurns.length - 1]?.tasteSummary || threadTurns[0]?.tasteSummary || '',
        turns: threadTurns,
        finalRecommendations: threadTurns[threadTurns.length - 1]?.matchedCards || []
      });
    }
  });

  // Sort turns newest first
  dialogTurns.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Sort conversation threads newest first
  conversationThreads.sort((a, b) => new Date(b.lastActiveAt) - new Date(a.lastActiveAt));

  // Category Distribution & Crux Metrics
  const categoryCounts = new Map();
  const dnaCounts = new Map();
  const noteCounts = new Map();
  let budgetConstrainedCount = 0;

  dialogTurns.forEach(t => {
    const cat = t.crux?.category || 'General';
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);

    if (t.crux?.budgetConstraint) budgetConstrainedCount++;

    if (t.crux?.referenceDNA) {
      dnaCounts.set(t.crux.referenceDNA, (dnaCounts.get(t.crux.referenceDNA) || 0) + 1);
    }

    (t.crux?.detectedNotes || []).forEach(n => {
      noteCounts.set(n, (noteCounts.get(n) || 0) + 1);
    });
  });

  const categoryDistribution = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({
      category,
      count,
      percent: dialogTurns.length > 0 ? Number(((count / dialogTurns.length) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const topDNAs = Array.from(dnaCounts.entries())
    .map(([dna, count]) => ({ dna, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topNotes = Array.from(noteCounts.entries())
    .map(([note, count]) => ({ note, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Top topic keywords
  const topTopics = Array.from(wordFrequency.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const totalUserQueries = dialogTurns.length;
  const avgMatchesPerQuery = queriesWithMatchesCount > 0
    ? Number((totalMatchesSum / queriesWithMatchesCount).toFixed(1))
    : 0;
  const successRate = totalUserQueries > 0
    ? Number((((totalUserQueries - rateLimitedCount) / totalUserQueries) * 100).toFixed(1))
    : 100;

  return {
    timeframe: { label, start, end },
    totalUserQueries,
    uniqueSessions: sessionMap.size,
    queriesWithMatchesCount,
    avgMatchesPerQuery,
    rateLimitedCount,
    successRate,
    budgetConstrainedCount,
    budgetPercent: totalUserQueries > 0 ? Number(((budgetConstrainedCount / totalUserQueries) * 100).toFixed(1)) : 0,
    categoryDistribution,
    topDNAs,
    topNotes,
    topTopics,
    dialogTurns,
    conversationThreads,
    multiTurnSessionsCount: conversationThreads.filter(t => t.isMultiTurn).length
  };
}
