import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar, Clock, Filter, ArrowUpDown, ArrowUp, ArrowDown, Activity,
  Users, ShoppingBag, Eye, Award, CheckCircle2, AlertCircle, Zap,
  Tag, MessageCircle, BarChart2, Layers, DollarSign, Package,
  Search, ExternalLink, RefreshCw, Sparkles, ChevronRight, Check, X,
  TrendingUp, MousePointer, HelpCircle, Bot, Compass, Send, Phone
} from 'lucide-react';
import {
  fetchAllTelemetryLogs,
  computeClickAnalytics,
  fetchKhushbooChatLogs,
  computeKhushbooAnalytics,
  getDateBoundaries
} from '../services/adminService.js';

// Reusable Sortable Column Header Component
function SortableTh({ label, sortKey, currentKey, order, onSort, align = 'left', className = '' }) {
  const isActive = currentKey === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`py-3 px-3 cursor-pointer select-none transition group text-[11px] font-bold uppercase tracking-wider ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      } ${isActive ? 'text-indigo-400 bg-indigo-500/5' : 'text-slate-400 hover:text-slate-200'} ${className}`}
      title={`Sort by ${label} (${isActive && order === 'asc' ? 'descending' : 'ascending'})`}
    >
      <div className={`inline-flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
        <span>{label}</span>
        {isActive ? (
          order === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5 text-indigo-400 stroke-[2.5]" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5 text-indigo-400 stroke-[2.5]" />
          )
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition" />
        )}
      </div>
    </th>
  );
}

// Generic comparator supporting numbers, strings, dates, arrays, and nulls
function genericSort(list, key, order) {
  return [...list].sort((a, b) => {
    let valA = a[key];
    let valB = b[key];

    if (valA === null || valA === undefined) valA = order === 'asc' ? Infinity : -Infinity;
    if (valB === null || valB === undefined) valB = order === 'asc' ? Infinity : -Infinity;

    if (key === 'timestamp' || key === 'lastConvertAt') {
      valA = new Date(valA).getTime() || 0;
      valB = new Date(valB).getTime() || 0;
    } else if (typeof valA === 'string' && typeof valB === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    } else if (Array.isArray(valA) && Array.isArray(valB)) {
      valA = valA[0] ? valA[0].toLowerCase() : '';
      valB = valB[0] ? valB[0].toLowerCase() : '';
    }

    if (valA < valB) return order === 'asc' ? -1 : 1;
    if (valA > valB) return order === 'asc' ? 1 : -1;
    return 0;
  });
}

export default function FragAdminDashboard({ isDark, onToggleTheme, onOpenSellerPortal }) {
  // Global Telemetry State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [rawLogs, setRawLogs] = useState([]);

  // Date Filtering State
  const [datePreset, setDatePreset] = useState('7d');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split('T')[0]);

  // Active Tab: 'sellers' | 'khushboo' | 'ai_interaction' | 'decant_vs_retail' | 'live_stream'
  const [activeTab, setActiveTab] = useState('sellers');

  // Khushboo Chat Telemetry State
  const [rawChatLogs, setRawChatLogs] = useState([]);
  const [khushbooFilter, setKhushbooFilter] = useState('all'); // 'all' | 'with_matches' | 'conversational' | 'rate_limited'
  const [khushbooSearch, setKhushbooSearch] = useState('');
  const [expandedTurnId, setExpandedTurnId] = useState(null);

  // Table 1: Seller Conversions Table Sorting & Filtering
  const [sellerSearch, setSellerSearch] = useState('');
  const [sellerSortKey, setSellerSortKey] = useState('totalConverts');
  const [sellerSortOrder, setSellerSortOrder] = useState('desc');

  // Table 2: AI Queries Table Sorting
  const [aiSortKey, setAiSortKey] = useState('count');
  const [aiSortOrder, setAiSortOrder] = useState('desc');

  // Table 3: Top Bottles Sorting
  const [bottlesSortKey, setBottlesSortKey] = useState('count');
  const [bottlesSortOrder, setBottlesSortOrder] = useState('desc');

  // Table 3: Top Decants Sorting
  const [decantsSortKey, setDecantsSortKey] = useState('count');
  const [decantsSortOrder, setDecantsSortOrder] = useState('desc');

  // Table 4: Live Click Stream Sorting
  const [streamSortKey, setStreamSortKey] = useState('timestamp');
  const [streamSortOrder, setStreamSortOrder] = useState('desc');

  // Initial Load
  const loadLogs = async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);

    try {
      const [logs, chatLogs] = await Promise.all([
        fetchAllTelemetryLogs(force),
        fetchKhushbooChatLogs(force)
      ]);
      setRawLogs(logs);
      setRawChatLogs(chatLogs);
      setLoading(false);
      setRefreshing(false);
    } catch (err) {
      setError(err.message || 'Failed to fetch telemetry logs');
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLogs(false);
  }, []);

  // Compute analytics dynamically based on selected date range in memory (<3ms)
  const analytics = useMemo(() => {
    if (!rawLogs || rawLogs.length === 0) return null;
    const clickData = computeClickAnalytics(rawLogs, {
      preset: datePreset,
      customStart: datePreset === 'custom' ? customStart : null,
      customEnd: datePreset === 'custom' ? customEnd : null
    });
    const khushbooData = computeKhushbooAnalytics(rawChatLogs, {
      preset: datePreset,
      customStart: datePreset === 'custom' ? customStart : null,
      customEnd: datePreset === 'custom' ? customEnd : null
    });
    return { ...clickData, khushboo: khushbooData };
  }, [rawLogs, rawChatLogs, datePreset, customStart, customEnd]);

  // Filtered Ask Khushboo Dialogues
  const filteredKhushbooTurns = useMemo(() => {
    const turns = analytics?.khushboo?.dialogTurns || [];
    return turns.filter(t => {
      if (khushbooFilter === 'with_matches' && t.matchedCount === 0) return false;
      if (khushbooFilter === 'rate_limited' && t.status !== 'rate_limited') return false;
      if (khushbooFilter === 'conversational' && (t.matchedCount > 0 || t.status === 'rate_limited')) return false;

      if (khushbooSearch.trim()) {
        const q = khushbooSearch.toLowerCase();
        const inQuery = (t.query || '').toLowerCase().includes(q);
        const inReply = (t.reply || '').toLowerCase().includes(q);
        const inSummary = (t.tasteSummary || '').toLowerCase().includes(q);
        const inMatches = (t.matchedIds || []).some(id => id.toLowerCase().includes(q));
        if (!inQuery && !inReply && !inSummary && !inMatches) return false;
      }

      return true;
    });
  }, [analytics?.khushboo?.dialogTurns, khushbooFilter, khushbooSearch]);

  // Relative time helper
  const getRelativeTime = (timestamp) => {
    if (!timestamp) return 'Just now';
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  // Sort Handlers
  const handleSortSellers = (key) => {
    if (sellerSortKey === key) {
      setSellerSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSellerSortKey(key);
      setSellerSortOrder('desc');
    }
  };

  const handleSortAi = (key) => {
    if (aiSortKey === key) {
      setAiSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setAiSortKey(key);
      setAiSortOrder('desc');
    }
  };

  const handleSortBottles = (key) => {
    if (bottlesSortKey === key) {
      setBottlesSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setBottlesSortKey(key);
      setBottlesSortOrder('desc');
    }
  };

  const handleSortDecants = (key) => {
    if (decantsSortKey === key) {
      setDecantsSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setDecantsSortKey(key);
      setDecantsSortOrder('desc');
    }
  };

  const handleSortStream = (key) => {
    if (streamSortKey === key) {
      setStreamSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setStreamSortKey(key);
      setStreamSortOrder('desc');
    }
  };

  // Filtered and Sorted Seller Conversions
  const filteredSellers = useMemo(() => {
    if (!analytics?.sellerConversions) return [];
    let list = [...analytics.sellerConversions];

    if (sellerSearch.trim()) {
      const q = sellerSearch.toLowerCase().trim();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.topPerfumes.some(p => p.toLowerCase().includes(q))
      );
    }

    return genericSort(list, sellerSortKey, sellerSortOrder);
  }, [analytics, sellerSearch, sellerSortKey, sellerSortOrder]);

  // Sorted AI Queries
  const sortedAiQueries = useMemo(() => {
    if (!analytics?.aiInteraction?.topQueries) return [];
    return genericSort(analytics.aiInteraction.topQueries, aiSortKey, aiSortOrder);
  }, [analytics, aiSortKey, aiSortOrder]);

  // Sorted Top Bottles
  const sortedTopBottles = useMemo(() => {
    if (!analytics?.decantVsRetail?.topBottles) return [];
    return genericSort(analytics.decantVsRetail.topBottles, bottlesSortKey, bottlesSortOrder);
  }, [analytics, bottlesSortKey, bottlesSortOrder]);

  // Sorted Top Decants
  const sortedTopDecants = useMemo(() => {
    if (!analytics?.decantVsRetail?.topDecants) return [];
    return genericSort(analytics.decantVsRetail.topDecants, decantsSortKey, decantsSortOrder);
  }, [analytics, decantsSortKey, decantsSortOrder]);

  // Sorted Live Stream
  const sortedLiveStream = useMemo(() => {
    if (!analytics?.liveClickStream) return [];
    return genericSort(analytics.liveClickStream, streamSortKey, streamSortOrder);
  }, [analytics, streamSortKey, streamSortOrder]);

  const kpis = analytics?.kpis;
  const ai = analytics?.aiInteraction;
  const funnel = analytics?.userFunnel;
  const dvr = analytics?.decantVsRetail;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-300">
      
      {/* 1. Executive Operations Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-black text-xl">
              FA
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  FragAdmin Clicks & Conversion Telemetry
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Live Telemetry
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-400">
                Interactive Date Range Filtering &bull; Multi-Column Sortable &bull; Real-time Telemetry
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            <button
              onClick={() => loadLogs(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition shadow-sm disabled:opacity-50"
              title="Refresh live telemetry stream"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
              {refreshing ? 'Syncing...' : 'Sync Live Logs'}
            </button>

            <button
              onClick={onOpenSellerPortal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition shadow-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Seller Portal
            </button>
          </div>
        </div>
      </header>

      {/* 2. Global Interactive Date Range Filter Controller */}
      <section className="bg-slate-900 border-b border-slate-800 px-4 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          
          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold mr-1">
              <Calendar className="w-4 h-4 text-indigo-400" />
              <span>Date Filter:</span>
            </div>

            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: '7d', label: 'Last 7 Days' },
              { id: '14d', label: 'Last 14 Days' },
              { id: '30d', label: 'Last 30 Days' },
              { id: 'all', label: 'All Time' },
              { id: 'custom', label: 'Custom Range' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setDatePreset(tab.id)}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
                  datePreset === tab.id
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers (Shown if 'custom' is active) */}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
              <span className="text-slate-400 font-semibold">From:</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <span className="text-slate-400 font-semibold">To:</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {/* Active Range Summary Pill */}
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>Window: <b className="text-slate-200">{analytics?.timeframe?.label || 'Last 7 Days'}</b></span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-indigo-400 font-bold">{analytics?.timeframe?.eventsCount?.toLocaleString() || 0} events analyzed</span>
          </div>

        </div>
      </section>

      {/* 3. Core Executive Telemetry KPIs (Filtered by Date) */}
      <section className="border-b border-slate-800/80 bg-slate-900/40 px-4 lg:px-8 py-5">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          
          {/* Total Interactivity Clicks */}
          <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase">Total Clicks</span>
              <MousePointer className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-black text-white">
              {(kpis?.totalClicks || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {kpis?.totalSearches || 0} searches &bull; {kpis?.totalCardClicks || 0} cards
            </div>
          </div>

          {/* WhatsApp Buy Converts */}
          <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase">WhatsApp Converts</span>
              <MessageCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400">
              {kpis?.totalWhatsAppConverts || 0}
            </div>
            <div className="text-[11px] text-emerald-400/90 mt-0.5 font-medium">
              {kpis?.sessionConversionRate || 0}% of visitor sessions
            </div>
          </div>

          {/* Bottle vs Decant Split */}
          <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase">Bottle vs Decant</span>
              <Layers className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-black text-white">
              <span className="text-emerald-400">{kpis?.totalBottleConverts || 0}B</span>
              <span className="text-slate-600 text-lg mx-1">/</span>
              <span className="text-purple-400">{kpis?.totalDecantConverts || 0}D</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {kpis?.bottleConvertShare || 0}% Bottles &bull; {kpis?.decantConvertShare || 0}% Decants
            </div>
          </div>

          {/* AI Queries Per Engaged Session */}
          <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase">Queries / Session</span>
              <Bot className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-black text-indigo-400">
              {ai?.avgQueriesPerEngagedSession || 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Across {ai?.engagedSessionsCount || 0} engaged sessions
            </div>
          </div>

          {/* Inquired Pipeline GMV */}
          <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase">Inquired Pipeline</span>
              <DollarSign className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-400">
              ₹{((kpis?.inquiredGmv || 0) / 1000).toFixed(1)}k
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              AOV: ₹{(kpis?.avgAov || 0).toLocaleString()}
            </div>
          </div>

          {/* Top Converting Seller */}
          <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase">Top Converting</span>
              <Award className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-lg font-black text-indigo-300 truncate">
              {analytics?.sellerConversions?.[0]?.name || 'N/A'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {analytics?.sellerConversions?.[0]?.totalConverts || 0} leads ({analytics?.sellerConversions?.[0]?.platformShare || 0}%)
            </div>
          </div>

        </div>
      </section>

      {/* 4. Tab Navigation Bar */}
      <nav className="border-b border-slate-800 bg-slate-950 sticky top-[61px] z-30 px-4 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center gap-1 overflow-x-auto no-scrollbar py-2">
          
          <button
            onClick={() => setActiveTab('sellers')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
              activeTab === 'sellers'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            Seller WhatsApp Converts
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'sellers' ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-300'
            }`}>
              {analytics?.sellerConversions?.length || 0} Active
            </span>
          </button>

          <button
            onClick={() => setActiveTab('khushboo')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
              activeTab === 'khushboo'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Sparkles className={`w-4 h-4 ${activeTab === 'khushboo' ? 'text-slate-950 fill-slate-950/20' : 'text-amber-400'}`} />
            Ask Khushboo Queries
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'khushboo' ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-slate-300'
            }`}>
              {analytics?.khushboo?.totalUserQueries || 0} Queries
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ai_interaction')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
              activeTab === 'ai_interaction'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Bot className="w-4 h-4" />
            AI Search & Session Journeys
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'ai_interaction' ? 'bg-purple-700 text-white' : 'bg-slate-800 text-slate-300'
            }`}>
              {ai?.avgQueriesPerEngagedSession || 0} q/sess
            </span>
          </button>

          <button
            onClick={() => setActiveTab('decant_vs_retail')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
              activeTab === 'decant_vs_retail'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            Decant vs. Retail Converts
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'decant_vs_retail' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300'
            }`}>
              {kpis?.totalWhatsAppConverts || 0} total
            </span>
          </button>

          <button
            onClick={() => setActiveTab('live_stream')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
              activeTab === 'live_stream'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Activity className="w-4 h-4" />
            Chronological Live Click Stream
          </button>

        </div>
      </nav>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6">
        
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
            <p className="text-sm font-medium">Aggregating live clicks, AI queries, and WhatsApp conversions...</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Failed to fetch telemetry</p>
              <p className="text-xs text-rose-400 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && analytics && (
          <>
            {/* ============================================================== */}
            {/* TAB 1: SELLER WHATSAPP CONVERTS (BY DATE)                     */}
            {/* ============================================================== */}
            {activeTab === 'sellers' && (
              <div className="space-y-6">
                
                {/* Search & Overview Banner */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-emerald-400" />
                      WhatsApp Buyer Converts for {analytics.timeframe.label}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Click any column header to sort ascending or descending
                    </p>
                  </div>

                  <div className="relative w-full md:w-64">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter seller or perfume..."
                      value={sellerSearch}
                      onChange={(e) => setSellerSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Seller Conversion Table (100% Sortable on Every Column) */}
                <div className="bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden shadow-lg">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950/80 border-b border-slate-800">
                          <SortableTh
                            label="Seller Name"
                            sortKey="name"
                            currentKey={sellerSortKey}
                            order={sellerSortOrder}
                            onSort={handleSortSellers}
                          />
                          <SortableTh
                            label="WhatsApp Converts"
                            sortKey="totalConverts"
                            currentKey={sellerSortKey}
                            order={sellerSortOrder}
                            onSort={handleSortSellers}
                          />
                          <SortableTh
                            label="Bottle Converts"
                            sortKey="bottleConverts"
                            currentKey={sellerSortKey}
                            order={sellerSortOrder}
                            onSort={handleSortSellers}
                          />
                          <SortableTh
                            label="Decant Converts"
                            sortKey="decantConverts"
                            currentKey={sellerSortKey}
                            order={sellerSortOrder}
                            onSort={handleSortSellers}
                          />
                          <SortableTh
                            label="Conversion Share"
                            sortKey="platformShare"
                            currentKey={sellerSortKey}
                            order={sellerSortOrder}
                            onSort={handleSortSellers}
                          />
                          <SortableTh
                            label="Inquired Pipeline GMV"
                            sortKey="inquiredGmv"
                            currentKey={sellerSortKey}
                            order={sellerSortOrder}
                            onSort={handleSortSellers}
                          />
                          <SortableTh
                            label="Average Order Value"
                            sortKey="avgAov"
                            currentKey={sellerSortKey}
                            order={sellerSortOrder}
                            onSort={handleSortSellers}
                          />
                          <SortableTh
                            label="Top Converted Fragrances"
                            sortKey="topPerfumes"
                            currentKey={sellerSortKey}
                            order={sellerSortOrder}
                            onSort={handleSortSellers}
                          />
                          <SortableTh
                            label="Last Convert"
                            sortKey="lastConvertAt"
                            currentKey={sellerSortKey}
                            order={sellerSortOrder}
                            onSort={handleSortSellers}
                            align="right"
                          />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-medium">
                        {filteredSellers.map((s, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40 transition">
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-sm">
                                  {s.name}
                                </span>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              </div>
                            </td>

                            <td className="py-3.5 px-3">
                              <div className="text-base font-black text-emerald-400">
                                {s.totalConverts}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                leads generated
                              </div>
                            </td>

                            <td className="py-3.5 px-3">
                              <div className="text-xs font-bold text-emerald-400">
                                {s.bottleConverts}
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {s.bottleShare}% of leads
                              </div>
                            </td>

                            <td className="py-3.5 px-3">
                              <div className="text-xs font-bold text-purple-400">
                                {s.decantConverts}
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                {s.decantShare}% of leads
                              </div>
                            </td>

                            <td className="py-3.5 px-3">
                              <div className="text-xs font-bold text-slate-200">
                                {s.platformShare}%
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                of total leads
                              </div>
                            </td>

                            <td className="py-3.5 px-3">
                              <div className="text-xs font-bold text-amber-300">
                                {s.inquiredGmv > 0 ? `₹${s.inquiredGmv.toLocaleString()}` : '—'}
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                purchase intent
                              </div>
                            </td>

                            <td className="py-3.5 px-3 text-slate-300 font-semibold">
                              {s.avgAov ? `₹${s.avgAov.toLocaleString()}` : '—'}
                            </td>

                            <td className="py-3.5 px-3 text-[11px] text-slate-300 max-w-xs">
                              {s.topPerfumes && s.topPerfumes.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {s.topPerfumes.map((p, pIdx) => (
                                    <span key={pIdx} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px]">
                                      {p}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-right text-slate-400 text-[11px]">
                              {getRelativeTime(s.lastConvertAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* ============================================================== */}
            {/* TAB: ASK KHUSHBOO INTELLIGENCE & CONVERSATIONAL QUERIES       */}
            {/* ============================================================== */}
            {activeTab === 'khushboo' && (
              <div className="space-y-6">
                
                {/* 4 Summary KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  
                  {/* 1. Total User Prompts */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-amber-950/40 to-slate-900 border border-amber-500/20">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
                      <span>Total Prompts Asked</span>
                      <Sparkles className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-3xl font-black text-white">{analytics?.khushboo?.totalUserQueries || 0}</div>
                    <p className="text-xs text-slate-400 mt-1">
                      Questions asked to Khushboo in {analytics?.timeframe?.label}.
                    </p>
                  </div>

                  {/* 2. Avg Recommendations Returned */}
                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">
                      <span>Avg Recs Returned</span>
                      <Package className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-3xl font-black text-white">{analytics?.khushboo?.avgMatchesPerQuery || 0}</div>
                    <p className="text-xs text-slate-400 mt-1">
                      Perfumes returned per query ({analytics?.khushboo?.queriesWithMatchesCount || 0} queries gave recs)
                    </p>
                  </div>

                  {/* 3. Unique Shopper Sessions */}
                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                    <div className="flex items-center justify-between text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">
                      <span>Unique Shoppers</span>
                      <Users className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="text-3xl font-black text-white">{analytics?.khushboo?.uniqueSessions || 0}</div>
                    <p className="text-xs text-slate-400 mt-1">
                      Distinct user sessions querying the AI Sommelier
                    </p>
                  </div>

                  {/* 4. Success vs Rate Limit */}
                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                    <div className="flex items-center justify-between text-xs font-bold text-purple-400 uppercase tracking-wider mb-2">
                      <span>Success Delivery Rate</span>
                      <CheckCircle2 className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="text-3xl font-black text-purple-400">{analytics?.khushboo?.successRate || 100}%</div>
                    <p className="text-xs text-slate-400 mt-1">
                      {analytics?.khushboo?.rateLimitedCount || 0} queries hit Gemini daily quota
                    </p>
                  </div>

                </div>

                {/* Top Topics & Fragrance Terms Asked */}
                {(analytics?.khushboo?.topTopics?.length || 0) > 0 && (
                  <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-amber-400" />
                      <span>Most Common Fragrance Names, Notes & Vibes Shoppers Ask For:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analytics.khushboo.topTopics.map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => setKhushbooSearch(item.word)}
                          className={`text-xs font-mono px-2.5 py-1 rounded-lg border transition flex items-center gap-1.5 ${
                            khushbooSearch.toLowerCase() === item.word.toLowerCase()
                              ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                          }`}
                        >
                          <span className="capitalize">{item.word}</span>
                          <span className="text-[10px] text-amber-400 font-bold bg-amber-950/80 px-1.5 py-0.2 rounded">
                            {item.count}
                          </span>
                        </button>
                      ))}
                      {khushbooSearch && (
                        <button
                          onClick={() => setKhushbooSearch('')}
                          className="text-xs font-mono px-2 py-1 rounded-lg bg-rose-950 text-rose-300 border border-rose-800 hover:bg-rose-900"
                        >
                          Clear Filter &times;
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Filter & Search Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={khushbooSearch}
                      onChange={(e) => setKhushbooSearch(e.target.value)}
                      placeholder="Search prompts (e.g. Hawas, summer, mint, BDC, Ajmal)..."
                      className="w-full pl-9 pr-8 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                    />
                    {khushbooSearch && (
                      <button
                        onClick={() => setKhushbooSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-mono">
                    {[
                      { id: 'all', label: 'All Prompts' },
                      { id: 'with_matches', label: 'With Recs' },
                      { id: 'conversational', label: 'Chat Only' },
                      { id: 'rate_limited', label: 'Quota Limit' }
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setKhushbooFilter(f.id)}
                        className={`px-3 py-1.5 rounded-lg border font-semibold transition whitespace-nowrap ${
                          khushbooFilter === f.id
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dialog Turns List */}
                <div className="space-y-3">
                  <div className="text-xs font-mono text-slate-400 flex items-center justify-between px-1">
                    <span>Showing {filteredKhushbooTurns.length} user queries in {analytics?.timeframe?.label}</span>
                    <span>Click any query to view full conversation & returned perfumes</span>
                  </div>

                  {filteredKhushbooTurns.length === 0 ? (
                    <div className="text-center py-12 bg-slate-900/40 rounded-xl border border-slate-800 p-6 text-slate-400 text-xs font-mono">
                      No Ask Khushboo queries match your filters for this timeframe.
                    </div>
                  ) : (
                    filteredKhushbooTurns.map((turn) => {
                      const isExpanded = expandedTurnId === turn.id;
                      return (
                        <div
                          key={turn.id}
                          className={`rounded-xl border transition-all overflow-hidden ${
                            isExpanded
                              ? 'bg-slate-900 border-amber-500/50 shadow-xl'
                              : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {/* Row Header */}
                          <div
                            onClick={() => setExpandedTurnId(isExpanded ? null : turn.id)}
                            className="p-4 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 select-none"
                          >
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-500/40 flex items-center justify-center shrink-0 mt-0.5">
                                <Users className="w-4 h-4 text-indigo-400" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-[11px] font-mono text-slate-400">
                                    {new Date(turn.timestamp).toLocaleString(undefined, {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                                    {turn.sessionId.slice(0, 16)}...
                                  </span>
                                  {turn.status === 'rate_limited' ? (
                                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800">
                                      Quota Limit Hit
                                    </span>
                                  ) : turn.matchedCount > 0 ? (
                                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700">
                                      {turn.matchedCount} Perfumes Returned
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                                      Conversational
                                    </span>
                                  )}
                                  {turn.intent && turn.intent !== 'chat' && (
                                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                                      {turn.intent.replace('_', ' ')}
                                    </span>
                                  )}
                                </div>

                                <h4 className="text-sm font-bold text-white leading-snug">
                                  &ldquo;{turn.query}&rdquo;
                                </h4>

                                {turn.tasteSummary && (
                                  <p className="text-xs text-amber-300/80 mt-1 line-clamp-1 font-mono">
                                    Diagnosis: {turn.tasteSummary}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                              <span className="text-xs font-mono font-semibold text-amber-400 hover:underline flex items-center gap-1">
                                <span>{isExpanded ? 'Hide Details' : 'View Dialogue & Matches'}</span>
                                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                              </span>
                            </div>
                          </div>

                          {/* Expanded Details: Reply & Matched Perfumes */}
                          {isExpanded && (
                            <div className="p-4 pt-2 border-t border-slate-800/80 space-y-4 bg-slate-950/40">
                              {/* Assistant Text Response */}
                              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-start gap-3">
                                <div className="w-7 h-7 rounded-lg bg-amber-950/80 border border-amber-500/40 flex items-center justify-center shrink-0 mt-0.5">
                                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                </div>
                                <div className="space-y-1 flex-1">
                                  <div className="text-xs font-bold text-amber-400">Khushboo's Response:</div>
                                  <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                                    {turn.reply || '(No assistant text reply logged)'}
                                  </p>
                                </div>
                              </div>

                              {/* Matched Fragrances Delivered */}
                              {turn.matchedCards && turn.matchedCards.length > 0 ? (
                                <div className="space-y-2">
                                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
                                    <span>{turn.matchedCards.length} Recommendations Delivered to Shopper:</span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                    {turn.matchedCards.map((c, cIdx) => (
                                      <div
                                        key={c.id || cIdx}
                                        className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex flex-col justify-between"
                                      >
                                        <div>
                                          <div className="flex items-center justify-between text-[11px] mb-1">
                                            <span className="font-bold text-slate-400">{c.brand}</span>
                                            {c.match_score && (
                                              <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.2 rounded">
                                                {c.match_score}% Match
                                              </span>
                                            )}
                                          </div>
                                          <h5 className="font-bold text-xs text-white truncate">{c.name}</h5>
                                          {c.why && (
                                            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 italic">
                                              "{c.why}"
                                            </p>
                                          )}
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-slate-900 flex items-center justify-between text-xs font-mono">
                                          <span className="text-emerald-400 font-bold">
                                            {c.community_price ? `₹${Number(c.community_price).toLocaleString()}` : 'Check Rates'}
                                          </span>
                                          <span className="text-[10px] text-slate-500">
                                            {c.best_seller || 'Verified Sellers'}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : turn.matchedIds && turn.matchedIds.length > 0 ? (
                                <div className="space-y-2">
                                  <div className="text-xs font-bold text-emerald-400">
                                    {turn.matchedIds.length} Perfume IDs Returned:
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {turn.matchedIds.map((id, idx) => (
                                      <span
                                        key={idx}
                                        className="text-xs font-mono px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300"
                                      >
                                        {id}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* TAB 2: AI INTERACTION & USER JOURNEYS (BY DATE)               */}
            {/* ============================================================== */}
            {activeTab === 'ai_interaction' && (
              <div className="space-y-6">
                
                {/* AI Interaction KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  
                  <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-500/20">
                    <div className="flex items-center justify-between text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">
                      <span>Queries / Session</span>
                      <Bot className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="text-3xl font-black text-white">{ai?.avgQueriesPerEngagedSession || 0}</div>
                    <p className="text-xs text-slate-400 mt-1">
                      Average search & discovery interactions per engaged session in {analytics.timeframe.label}.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                    <div className="flex items-center justify-between text-xs font-bold text-purple-400 uppercase tracking-wider mb-2">
                      <span>Total AI Queries</span>
                      <Search className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="text-3xl font-black text-white">{(ai?.totalQueries || 0).toLocaleString()}</div>
                    <p className="text-xs text-slate-400 mt-1">
                      Zero-result rate: <span className="text-slate-200 font-bold">{ai?.zeroResultRate || 0}%</span> ({ai?.totalZeroResults || 0} misses)
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">
                      <span>Engaged Sessions</span>
                      <Users className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-3xl font-black text-white">{ai?.engagedSessionsCount || 0}</div>
                    <p className="text-xs text-slate-400 mt-1">
                      Out of <span className="text-slate-200 font-bold">{kpis?.totalSessions || 0}</span> total visitor sessions ({kpis?.totalSessions > 0 ? ((ai?.engagedSessionsCount / kpis?.totalSessions) * 100).toFixed(1) : 0}%)
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
                      <span>Session-to-Buy Rate</span>
                      <Sparkles className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-3xl font-black text-amber-400">{kpis?.sessionConversionRate || 0}%</div>
                    <p className="text-xs text-slate-400 mt-1">
                      {kpis?.totalWhatsAppConverts || 0} direct leads from {kpis?.totalSessions || 0} sessions
                    </p>
                  </div>

                </div>

                {/* Query Depth Distribution */}
                <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-5">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                    <BarChart2 className="w-4 h-4 text-indigo-400" />
                    AI Query Depth Distribution (Number of Queries Per Session)
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    How deeply shoppers query the AI search & recommendation engine during their sessions
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    
                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
                        <span>Single-Shot (1 Query)</span>
                        <span className="text-indigo-400 font-bold">{ai?.queryDepthPercent?.single || 0}%</span>
                      </div>
                      <div className="text-xl font-bold text-white mt-1">{ai?.queryDepth?.single || 0} sessions</div>
                      <div className="w-full h-1.5 bg-slate-900 rounded-full mt-2 overflow-hidden">
                        <div className="bg-indigo-500 h-full" style={{ width: `${ai?.queryDepthPercent?.single || 0}%` }} />
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">Targeted lookups (e.g. "Hawas")</div>
                    </div>

                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
                        <span>Light (2-3 Queries)</span>
                        <span className="text-indigo-400 font-bold">{ai?.queryDepthPercent?.light || 0}%</span>
                      </div>
                      <div className="text-xl font-bold text-white mt-1">{ai?.queryDepth?.light || 0} sessions</div>
                      <div className="w-full h-1.5 bg-slate-900 rounded-full mt-2 overflow-hidden">
                        <div className="bg-indigo-500 h-full" style={{ width: `${ai?.queryDepthPercent?.light || 0}%` }} />
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">Brand or flanker comparisons</div>
                    </div>

                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
                        <span>Deep (4-6 Queries)</span>
                        <span className="text-indigo-400 font-bold">{ai?.queryDepthPercent?.deep || 0}%</span>
                      </div>
                      <div className="text-xl font-bold text-white mt-1">{ai?.queryDepth?.deep || 0} sessions</div>
                      <div className="w-full h-1.5 bg-slate-900 rounded-full mt-2 overflow-hidden">
                        <div className="bg-indigo-500 h-full" style={{ width: `${ai?.queryDepthPercent?.deep || 0}%` }} />
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">Multi-note and DNA exploration</div>
                    </div>

                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-1">
                        <span>Power Search (7+ Queries)</span>
                        <span className="text-indigo-400 font-bold">{ai?.queryDepthPercent?.power || 0}%</span>
                      </div>
                      <div className="text-xl font-bold text-white mt-1">{ai?.queryDepth?.power || 0} sessions</div>
                      <div className="w-full h-1.5 bg-slate-900 rounded-full mt-2 overflow-hidden">
                        <div className="bg-indigo-500 h-full" style={{ width: `${ai?.queryDepthPercent?.power || 0}%` }} />
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">High purchase intent power buyers</div>
                    </div>

                  </div>
                </div>

                {/* User Interaction Conversion Funnel */}
                <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-5">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    End-to-End User Interaction Funnel ({analytics.timeframe.label})
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    Conversion journey from initial site visit to search interactivity, card exploration, and WhatsApp purchase
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-xs text-slate-400 font-semibold">1. Visitor Sessions</div>
                      <div className="text-2xl font-black text-white mt-1">{funnel?.visitorSessions || 0}</div>
                      <div className="text-[11px] text-slate-500 mt-1">100% Top of Funnel</div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-xs text-slate-400 font-semibold">2. AI-Engaged Sessions</div>
                      <div className="text-2xl font-black text-indigo-400 mt-1">{funnel?.aiEngagedSessions || 0}</div>
                      <div className="text-[11px] text-indigo-400 mt-1 font-semibold">
                        {funnel?.visitorSessions > 0 ? ((funnel?.aiEngagedSessions / funnel?.visitorSessions) * 100).toFixed(1) : 0}% Engagement
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-xs text-slate-400 font-semibold">3. Card Detail Opens</div>
                      <div className="text-2xl font-black text-purple-400 mt-1">{funnel?.cardOpens || 0}</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        High Intent Inspection
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/20 bg-emerald-950/10">
                      <div className="text-xs text-emerald-400 font-semibold">4. WhatsApp Buy Converts</div>
                      <div className="text-2xl font-black text-emerald-400 mt-1">{funnel?.whatsAppConverts || 0}</div>
                      <div className="text-[11px] text-emerald-400 font-bold mt-1">
                        {funnel?.visitorToBuyRate || 0}% End Conversion
                      </div>
                    </div>

                  </div>
                </div>

                {/* Top AI Search Queries in this Date Range (Sortable on Every Column) */}
                <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Search className="w-4 h-4 text-indigo-400" />
                        Top AI Search Queries for {analytics.timeframe.label}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Click column headers to sort by search volume, unique sessions, or zero-result misses
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950/80 border-b border-slate-800">
                          <SortableTh
                            label="Search Query"
                            sortKey="query"
                            currentKey={aiSortKey}
                            order={aiSortOrder}
                            onSort={handleSortAi}
                          />
                          <SortableTh
                            label="Total Searches"
                            sortKey="count"
                            currentKey={aiSortKey}
                            order={aiSortOrder}
                            onSort={handleSortAi}
                          />
                          <SortableTh
                            label="Unique Sessions"
                            sortKey="uniqueSessions"
                            currentKey={aiSortKey}
                            order={aiSortOrder}
                            onSort={handleSortAi}
                          />
                          <SortableTh
                            label="Result Status"
                            sortKey="zeroResults"
                            currentKey={aiSortKey}
                            order={aiSortOrder}
                            onSort={handleSortAi}
                            align="right"
                          />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-medium">
                        {sortedAiQueries.map((sq, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40 transition">
                            <td className="py-3 px-4 font-bold text-white capitalize">
                              "{sq.query}"
                            </td>
                            <td className="py-3 px-3 font-semibold text-slate-200">
                              {sq.count} searches
                            </td>
                            <td className="py-3 px-3 text-slate-400">
                              {sq.uniqueSessions} sessions
                            </td>
                            <td className="py-3 px-4 text-right">
                              {sq.zeroResults > 0 ? (
                                <span className="text-rose-400 font-semibold">Misses ({sq.zeroResults})</span>
                              ) : (
                                <span className="text-emerald-400 font-semibold">Fulfilled</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* ============================================================== */}
            {/* TAB 3: DECANT VS RETAIL CONVERTS (BY DATE)                    */}
            {/* ============================================================== */}
            {activeTab === 'decant_vs_retail' && (
              <div className="space-y-6">
                
                {/* Head-to-Head Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Retail Bottles Card */}
                  <div className="p-5 rounded-xl bg-slate-900/80 border border-emerald-500/20 shadow-md">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-sm font-bold text-white">Full Retail Bottles</h3>
                      </div>
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {kpis?.bottleConvertShare || 0}% of Converts
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 my-4">
                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[11px] text-slate-400">Converts in Window</div>
                        <div className="text-2xl font-bold text-emerald-400 mt-0.5">
                          {dvr?.bottleConverts || 0}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[11px] text-slate-400">Inquired GMV</div>
                        <div className="text-2xl font-bold text-amber-400 mt-0.5">
                          ₹{((dvr?.bottleGmv || 0) / 1000).toFixed(1)}k
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 col-span-2">
                        <div className="text-[11px] text-slate-400">Average Inquired Bottle Value</div>
                        <div className="text-xl font-bold text-white mt-0.5">
                          ₹{(dvr?.avgBottleAov || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Top Converted Bottles Sortable Table */}
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Top Converted Full Bottles ({analytics.timeframe.label}):
                      </h4>
                      <div className="bg-slate-950 rounded-lg border border-slate-800/80 overflow-hidden">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-900 border-b border-slate-800">
                              <SortableTh
                                label="Fragrance Name"
                                sortKey="name"
                                currentKey={bottlesSortKey}
                                order={bottlesSortOrder}
                                onSort={handleSortBottles}
                              />
                              <SortableTh
                                label="Converts"
                                sortKey="count"
                                currentKey={bottlesSortKey}
                                order={bottlesSortOrder}
                                onSort={handleSortBottles}
                              />
                              <SortableTh
                                label="Share %"
                                sortKey="share"
                                currentKey={bottlesSortKey}
                                order={bottlesSortOrder}
                                onSort={handleSortBottles}
                                align="right"
                              />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {sortedTopBottles.map((b, idx) => (
                              <tr key={idx} className="hover:bg-slate-900/50">
                                <td className="py-2.5 px-3 font-semibold text-slate-200">{b.name}</td>
                                <td className="py-2.5 px-3 font-bold text-emerald-400">{b.count}</td>
                                <td className="py-2.5 px-3 text-right font-medium text-slate-400">{b.share}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Decants Card */}
                  <div className="p-5 rounded-xl bg-slate-900/80 border border-purple-500/20 shadow-md">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-purple-400" />
                        <h3 className="text-sm font-bold text-white">Decants & Samples</h3>
                      </div>
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        {kpis?.decantConvertShare || 0}% of Converts
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 my-4">
                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[11px] text-slate-400">Converts in Window</div>
                        <div className="text-2xl font-bold text-purple-400 mt-0.5">
                          {dvr?.decantConverts || 0}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[11px] text-slate-400">Inquired GMV</div>
                        <div className="text-2xl font-bold text-amber-400 mt-0.5">
                          ₹{((dvr?.decantGmv || 0) / 1000).toFixed(1)}k
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 col-span-2">
                        <div className="text-[11px] text-slate-400">Average Starting Decant Price</div>
                        <div className="text-xl font-bold text-white mt-0.5">
                          ₹{(dvr?.avgDecantAov || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Top Converted Decants Sortable Table */}
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Top Converted Decants ({analytics.timeframe.label}):
                      </h4>
                      <div className="bg-slate-950 rounded-lg border border-slate-800/80 overflow-hidden">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-900 border-b border-slate-800">
                              <SortableTh
                                label="Fragrance Name"
                                sortKey="name"
                                currentKey={decantsSortKey}
                                order={decantsSortOrder}
                                onSort={handleSortDecants}
                              />
                              <SortableTh
                                label="Converts"
                                sortKey="count"
                                currentKey={decantsSortKey}
                                order={decantsSortOrder}
                                onSort={handleSortDecants}
                              />
                              <SortableTh
                                label="Share %"
                                sortKey="share"
                                currentKey={decantsSortKey}
                                order={decantsSortOrder}
                                onSort={handleSortDecants}
                                align="right"
                              />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {sortedTopDecants.map((d, idx) => (
                              <tr key={idx} className="hover:bg-slate-900/50">
                                <td className="py-2.5 px-3 font-semibold text-slate-200">{d.name}</td>
                                <td className="py-2.5 px-3 font-bold text-purple-400">{d.count}</td>
                                <td className="py-2.5 px-3 text-right font-medium text-slate-400">{d.share}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* ============================================================== */}
            {/* TAB 4: CHRONOLOGICAL LIVE CLICK STREAM                         */}
            {/* ============================================================== */}
            {activeTab === 'live_stream' && (
              <div className="space-y-4">
                
                <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        Live Click & Convert Stream ({analytics.timeframe.label})
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Click column headers to sort by event type, price, seller, traffic source, or timestamp
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950/80 border-b border-slate-800">
                          <SortableTh
                            label="Event Type"
                            sortKey="type"
                            currentKey={streamSortKey}
                            order={streamSortOrder}
                            onSort={handleSortStream}
                          />
                          <SortableTh
                            label="Fragrance"
                            sortKey="name"
                            currentKey={streamSortKey}
                            order={streamSortOrder}
                            onSort={handleSortStream}
                          />
                          <SortableTh
                            label="Format"
                            sortKey="format"
                            currentKey={streamSortKey}
                            order={streamSortOrder}
                            onSort={handleSortStream}
                          />
                          <SortableTh
                            label="Quoted Price"
                            sortKey="price"
                            currentKey={streamSortKey}
                            order={streamSortOrder}
                            onSort={handleSortStream}
                          />
                          <SortableTh
                            label="Attributed Seller"
                            sortKey="seller"
                            currentKey={streamSortKey}
                            order={streamSortOrder}
                            onSort={handleSortStream}
                          />
                          <SortableTh
                            label="Source / Referrer"
                            sortKey="source"
                            currentKey={streamSortKey}
                            order={streamSortOrder}
                            onSort={handleSortStream}
                          />
                          <SortableTh
                            label="Timestamp"
                            sortKey="timestamp"
                            currentKey={streamSortKey}
                            order={streamSortOrder}
                            onSort={handleSortStream}
                            align="right"
                          />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-medium">
                        {sortedLiveStream.map((ev) => (
                          <tr key={ev.id} className="hover:bg-slate-800/40 transition">
                            <td className="py-3 px-4">
                              {ev.type === 'whatsapp_convert' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                                  <MessageCircle className="w-3 h-3" />
                                  WHATSAPP BUY
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px]">
                                  <Eye className="w-3 h-3" />
                                  CARD OPEN
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              <div className="font-bold text-white">{ev.name}</div>
                              {ev.brand && <div className="text-[10px] text-slate-400">{ev.brand}</div>}
                            </td>

                            <td className="py-3 px-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${
                                ev.format === 'decant'
                                  ? 'bg-purple-500/10 text-purple-400'
                                  : 'bg-emerald-500/10 text-emerald-400'
                              }`}>
                                {ev.format || 'bottle'}
                              </span>
                            </td>

                            <td className="py-3 px-3 font-semibold text-slate-200">
                              {ev.price ? `₹${ev.price.toLocaleString()}` : '—'}
                            </td>

                            <td className="py-3 px-3 text-slate-300">
                              {ev.seller || <span className="text-slate-500">—</span>}
                            </td>

                            <td className="py-3 px-3 text-slate-400 text-[11px]">
                              {ev.source || 'direct'}
                            </td>

                            <td className="py-3 px-4 text-right text-slate-400 text-[11px]">
                              {getRelativeTime(ev.timestamp)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}
          </>
        )}

      </main>

    </div>
  );
}
