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

  let totalGrossPipeline = 0;
  let totalBottleGmv = 0;
  let totalDecantGmv = 0;

  let totalBottleConverts = 0;
  let totalDecantConverts = 0;

  // Day bucket helper
  const addDayVelocity = (dateStr, type) => {
    if (!dateStr) return;
    const d = new Date(dateStr);
    const dayKey = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!dayVelocityMap[dayKey]) {
      dayVelocityMap[dayKey] = {
        date: dayKey,
        rawDate: d,
        searches: 0,
        cardOpens: 0,
        converts: 0,
        bottles: 0,
        decants: 0
      };
    }
    if (type === 'search') dayVelocityMap[dayKey].searches++;
    if (type === 'card') dayVelocityMap[dayKey].cardOpens++;
    if (type === 'convert_bottle') {
      dayVelocityMap[dayKey].converts++;
      dayVelocityMap[dayKey].bottles++;
    }
    if (type === 'convert_decant') {
      dayVelocityMap[dayKey].converts++;
      dayVelocityMap[dayKey].decants++;
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
        firstSeen: createdAt
      });
    }
    const sess = sessions.get(sId);

    // EVENT: AI Search Query
    if (title === 'EVENT:search_query') {
      totalSearches++;
      addDayVelocity(createdAt, 'search');
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
    // AI Curated Umbrellas & Taste Profiles
    else if (title.includes('Umbrella') || title.includes('Profile')) {
      totalAiProfiles++;
      sess.aiProfiles.push(title);
    }
    // EVENT: Card Detail Click / Open
    else if (title === 'EVENT:card_click') {
      totalCardClicks++;
      addDayVelocity(createdAt, 'card');
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

      const sellerName = payload.seller_name || 'Unattributed Seller';
      const fmt = payload.format || (r.umbrella_season?.includes('decant') ? 'decant' : 'bottle');
      const price = Number(payload.price || 0);

      if (fmt === 'decant') {
        totalDecantConverts++;
        addDayVelocity(createdAt, 'convert_decant');
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
        addDayVelocity(createdAt, 'convert_bottle');
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
    .sort((a, b) => a.rawDate - b.rawDate);

  const sessionConversionRate = validSessions.length > 0
    ? Number(((convertingSessions.length / validSessions.length) * 100).toFixed(1))
    : 0;

  return {
    timeframe: {
      preset,
      customStart,
      customEnd,
      label,
      eventsCount: filteredRows.length
    },
    kpis: {
      totalClicks: totalCardClicks + totalWhatsAppClicks + totalSearches,
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
      totalSearches
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
