import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck, Database, RefreshCw, TrendingDown, Sparkles, Store, Search,
  Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink,
  ArrowUpDown, ArrowUp, ArrowDown, Activity, Users, ShoppingBag, Eye, Award,
  Clock, Sun, Moon, CheckCircle2, AlertCircle, Zap, Tag, MessageCircle,
  PieChart, BarChart2, Layers, DollarSign, Package, Check, X, Phone, Truck
} from 'lucide-react';
import { fetchAdminDashboardData, fetchAdminCatalogPage } from '../services/adminService.js';

export default function FragAdminDashboard({ isDark, onToggleTheme, onOpenSellerPortal }) {
  // Global Admin State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [daysWindow, setDaysWindow] = useState(30);
  const [adminData, setAdminData] = useState(null);

  // Active Tab: 'sellers' | 'battleground' | 'catalog' | 'drops' | 'arrivals' | 'telemetry'
  const [activeTab, setActiveTab] = useState('sellers');

  // Seller Matrix Controls
  const [sellerArchetypeFilter, setSellerArchetypeFilter] = useState('all');
  const [sellerSearchQuery, setSellerSearchQuery] = useState('');
  const [sellerSortKey, setSellerSortKey] = useState('totalLeads'); // 'totalLeads' | 'totalInventory' | 'leadVelocityPer100' | 'grossPipeline' | 'lowestBottleWins'
  const [sellerSortOrder, setSellerSortOrder] = useState('desc');
  const [selectedSellerDossier, setSelectedSellerDossier] = useState(null);

  // Catalog Explorer State
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogPageSize, setCatalogPageSize] = useState(25);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogSeller, setCatalogSeller] = useState('all');
  const [catalogStockStatus, setCatalogStockStatus] = useState('in_stock');
  const [catalogSortBy, setCatalogSortBy] = useState('name_asc');
  const [catalogData, setCatalogData] = useState({ items: [], totalCount: 0, totalPages: 1 });
  const [catalogLoading, setCatalogLoading] = useState(false);

  // Price Drops Pagination
  const [dropsPage, setDropsPage] = useState(1);
  const dropsPageSize = 10;

  // New Arrivals Pagination
  const [arrivalsPage, setArrivalsPage] = useState(1);
  const arrivalsPageSize = 10;

  // Load Dashboard Data
  const loadDashboardData = (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);

    fetchAdminDashboardData(daysWindow, force)
      .then(data => {
        setAdminData(data);
        setLoading(false);
        setRefreshing(false);
      })
      .catch(err => {
        setError(err.message || 'Failed to load executive admin telemetry');
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    loadDashboardData(false);
  }, [daysWindow]);

  // Load catalog page whenever filters or pagination change
  useEffect(() => {
    let active = true;
    setCatalogLoading(true);

    fetchAdminCatalogPage({
      page: catalogPage,
      pageSize: catalogPageSize,
      search: catalogSearch,
      seller: catalogSeller,
      stockStatus: catalogStockStatus,
      sortBy: catalogSortBy
    }).then(res => {
      if (!active) return;
      setCatalogData(res);
      setCatalogLoading(false);
    }).catch(err => {
      if (!active) return;
      console.warn('Catalog fetch error:', err);
      setCatalogLoading(false);
    });

    return () => { active = false; };
  }, [catalogPage, catalogPageSize, catalogSearch, catalogSeller, catalogStockStatus, catalogSortBy]);

  // Format relative time helper
  const getRelativeTime = (timestamp) => {
    if (!timestamp) return 'Just now';
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${Math.max(1, diffMins)}m ago`;
    }
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const syncMeta = adminData?.syncMeta;
  const sellerMatrix = adminData?.sellerMatrix || [];
  const decantVsRetailStats = adminData?.decantVsRetailStats;
  const demandMetrics = adminData?.demandMetrics;
  const summaryKpis = adminData?.summaryKpis;

  // Filtered and Sorted Seller Matrix
  const filteredSellers = useMemo(() => {
    let result = [...sellerMatrix];

    // Search filter
    if (sellerSearchQuery.trim()) {
      const q = sellerSearchQuery.toLowerCase().trim();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.archetype.toLowerCase().includes(q) ||
        (s.dispatch && s.dispatch.toLowerCase().includes(q))
      );
    }

    // Archetype filter
    if (sellerArchetypeFilter !== 'all') {
      if (sellerArchetypeFilter === 'bottle') {
        result = result.filter(s => s.archetype === 'Bottle Specialist' || s.archetype === 'Bottle Dominant');
      } else if (sellerArchetypeFilter === 'decant') {
        result = result.filter(s => s.archetype === 'Decant Specialist' || s.archetype === 'Decant Dominant');
      } else if (sellerArchetypeFilter === 'hybrid') {
        result = result.filter(s => s.archetype === 'Hybrid Seller');
      }
    }

    // Sorting
    result.sort((a, b) => {
      let valA = a[sellerSortKey] ?? 0;
      let valB = b[sellerSortKey] ?? 0;
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return sellerSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sellerSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [sellerMatrix, sellerSearchQuery, sellerArchetypeFilter, sellerSortKey, sellerSortOrder]);

  const handleSortSellers = (key) => {
    if (sellerSortKey === key) {
      setSellerSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSellerSortKey(key);
      setSellerSortOrder('desc');
    }
  };

  const drilldownToSellerCatalog = (sellerName) => {
    setCatalogSeller(sellerName);
    setCatalogPage(1);
    setActiveTab('catalog');
    setSelectedSellerDossier(null);
  };

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
                  FragAdmin Operations & Intelligence
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Live Cluster
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-400">
                Synced {syncMeta?.lastSync ? getRelativeTime(syncMeta.lastSync) : 'recently'} &bull; Database: Supabase PostgreSQL 15.8
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            {/* Force Sync Button */}
            <button
              onClick={() => loadDashboardData(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition shadow-sm disabled:opacity-50"
              title="Force live database telemetry refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
              {refreshing ? 'Syncing...' : 'Refresh Live Data'}
            </button>

            {/* External Seller Portal link */}
            <button
              onClick={onOpenSellerPortal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition shadow-sm"
              title="Open the Seller Audience & Demand Portal"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Seller Portal
            </button>

            {/* Theme Toggle */}
            <button
              onClick={onToggleTheme}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-300" />}
            </button>
          </div>
        </div>
      </header>

      {/* 2. Operations KPI Banner */}
      <section className="border-b border-slate-800/80 bg-slate-900/40 px-4 lg:px-8 py-5">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          
          <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase">Active Sellers</span>
              <Store className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-black text-white">{summaryKpis?.totalSellers || sellerMatrix.length || 13}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">100% Community Verified</div>
          </div>

          <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase">Retail Bottles</span>
              <ShoppingBag className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400">
              {(decantVsRetailStats?.totalBottleListings || syncMeta?.inStockCount || 1194).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {decantVsRetailStats?.bottleInventoryShare || 48.5}% of catalog mix
            </div>
          </div>

          <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase">Active Decants</span>
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-black text-purple-400">
              {(decantVsRetailStats?.totalDecantListings || syncMeta?.decantsCount || 1266).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {decantVsRetailStats?.decantInventoryShare || 51.5}% of catalog mix
            </div>
          </div>

          <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase">WhatsApp Inquiries</span>
              <MessageCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-white">
              {decantVsRetailStats?.totalLeads || 323}
            </div>
            <div className="text-[11px] text-emerald-400/90 mt-0.5 font-medium">
              {decantVsRetailStats?.totalBottleLeads || 250} Bottles &bull; {decantVsRetailStats?.totalDecantLeads || 73} Decants
            </div>
          </div>

          <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase">Inquired GMV</span>
              <DollarSign className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-400">
              ₹{((decantVsRetailStats?.totalGrossPipeline || 693245) / 100000).toFixed(2)}L
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Tracked purchase intent
            </div>
          </div>

          <div className="bg-slate-900/80 rounded-xl p-3.5 border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase">Price Leader</span>
              <Award className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-lg font-black text-indigo-300 truncate">
              {summaryKpis?.topPriceLeader || 'FragFever'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              22 Lowest Price Wins
            </div>
          </div>

        </div>
      </section>

      {/* 3. Primary Tab Navigation */}
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
            <Store className="w-4 h-4" />
            Seller Intelligence & Matrix
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'sellers' ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-300'
            }`}>
              {sellerMatrix.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('battleground')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
              activeTab === 'battleground'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            Decant vs Retail Battleground
          </button>

          <button
            onClick={() => setActiveTab('catalog')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
              activeTab === 'catalog'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Database className="w-4 h-4" />
            Catalog Explorer
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'catalog' ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-300'
            }`}>
              {syncMeta?.catalogTotal || 2460}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('drops')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
              activeTab === 'drops'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            Arbitrage Drops
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'drops' ? 'bg-rose-700 text-white' : 'bg-slate-800 text-rose-400'
            }`}>
              {syncMeta?.priceDropsCount || 6}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('arrivals')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
              activeTab === 'arrivals'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            New Arrivals
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === 'arrivals' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-emerald-400'
            }`}>
              {syncMeta?.newArrivalsCount || 9}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('telemetry')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
              activeTab === 'telemetry'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Activity className="w-4 h-4" />
            Demand & Telemetry
          </button>

        </div>
      </nav>

      {/* Main Content Body */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6">
        
        {/* Loading / Error States */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
            <p className="text-sm font-medium">Aggregating live seller intelligence, decant splits, and telemetry...</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Failed to load admin cluster data</p>
              <p className="text-xs text-rose-400 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ============================================================== */}
            {/* TAB 1: SELLER INTELLIGENCE & MATRIX                           */}
            {/* ============================================================== */}
            {activeTab === 'sellers' && (
              <div className="space-y-6">
                
                {/* Seller Filter & Search Bar */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">Archetype:</span>
                    {[
                      { id: 'all', label: 'All Sellers' },
                      { id: 'bottle', label: 'Bottle Specialists' },
                      { id: 'decant', label: 'Decant Specialists' },
                      { id: 'hybrid', label: 'Hybrid Powerhouses' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setSellerArchetypeFilter(tab.id)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition ${
                          sellerArchetypeFilter === tab.id
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full md:w-64">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search seller by name..."
                      value={sellerSearchQuery}
                      onChange={(e) => setSellerSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Seller Top Podium Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* #1 Demand Leader */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/40 to-slate-900/90 border border-emerald-500/20 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">
                      <span>#1 Buyer Demand Leader</span>
                      <Award className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-xl font-bold text-white mb-1">FragFever</div>
                    <p className="text-xs text-slate-400 mb-3">
                      Captures <span className="text-emerald-400 font-bold">24.1%</span> of all platform WhatsApp leads (78 inquiries, ₹2.26L GMV).
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold">
                        22 Lowest Price Wins
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                        215 Bottles
                      </span>
                    </div>
                  </div>

                  {/* #1 Decant Specialist */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-purple-950/40 to-slate-900/90 border border-purple-500/20 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between text-xs font-bold text-purple-400 uppercase tracking-wider mb-2">
                      <span>#1 Decant Volume Leader</span>
                      <Sparkles className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="text-xl font-bold text-white mb-1">Sovereign Scents</div>
                    <p className="text-xs text-slate-400 mb-3">
                      Largest decant inventory with <span className="text-purple-400 font-bold">539 decants</span> across 6 size variations (3ml–10ml).
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-semibold">
                        Avg Start: ₹205
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                        583 Total Stock
                      </span>
                    </div>
                  </div>

                  {/* #1 High-Ticket / GMV Efficiency */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/40 to-slate-900/90 border border-indigo-500/20 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">
                      <span>#1 Lead Velocity per 100</span>
                      <Zap className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="text-xl font-bold text-white mb-1">Enigma Perfumes</div>
                    <p className="text-xs text-slate-400 mb-3">
                      Highest conversion density at <span className="text-indigo-400 font-bold">51.9 leads/100 items</span> (41 inquiries across 79 listings).
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-semibold">
                        ₹1.05L Tracked GMV
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                        Avg Bottle ₹4,818
                      </span>
                    </div>
                  </div>
                </div>

                {/* Master Seller Table */}
                <div className="bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden shadow-lg">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                          <th className="py-3 px-4">Seller & Archetype</th>
                          <th 
                            className="py-3 px-3 cursor-pointer hover:text-indigo-400 transition"
                            onClick={() => handleSortSellers('totalInventory')}
                          >
                            <div className="flex items-center gap-1">
                              Inventory Breakdown
                              <ArrowUpDown className="w-3 h-3 text-slate-500" />
                            </div>
                          </th>
                          <th 
                            className="py-3 px-3 cursor-pointer hover:text-indigo-400 transition"
                            onClick={() => handleSortSellers('totalLeads')}
                          >
                            <div className="flex items-center gap-1">
                              WhatsApp Leads
                              <ArrowUpDown className="w-3 h-3 text-slate-500" />
                            </div>
                          </th>
                          <th 
                            className="py-3 px-3 cursor-pointer hover:text-indigo-400 transition"
                            onClick={() => handleSortSellers('leadShare')}
                          >
                            <div className="flex items-center gap-1">
                              Platform Share
                              <ArrowUpDown className="w-3 h-3 text-slate-500" />
                            </div>
                          </th>
                          <th 
                            className="py-3 px-3 cursor-pointer hover:text-indigo-400 transition"
                            onClick={() => handleSortSellers('leadVelocityPer100')}
                          >
                            <div className="flex items-center gap-1">
                              Lead Velocity
                              <ArrowUpDown className="w-3 h-3 text-slate-500" />
                            </div>
                          </th>
                          <th 
                            className="py-3 px-3 cursor-pointer hover:text-indigo-400 transition"
                            onClick={() => handleSortSellers('grossPipeline')}
                          >
                            <div className="flex items-center gap-1">
                              Inquired GMV
                              <ArrowUpDown className="w-3 h-3 text-slate-500" />
                            </div>
                          </th>
                          <th className="py-3 px-3">Price Champions</th>
                          <th className="py-3 px-3">Avg Pricing</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-medium">
                        {filteredSellers.map((s, idx) => (
                          <tr 
                            key={s.id || idx}
                            className="hover:bg-slate-800/40 transition group cursor-pointer"
                            onClick={() => setSelectedSellerDossier(s)}
                          >
                            {/* Seller & Archetype */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-sm group-hover:text-indigo-300 transition">
                                  {s.name}
                                </span>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" title="Verified Community Seller" />
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[10px] px-2 py-0.2 rounded font-bold uppercase tracking-wider ${
                                  s.archetype.includes('Bottle')
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : s.archetype.includes('Decant')
                                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                    : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                }`}>
                                  {s.archetype}
                                </span>
                                {s.whatsapp && (
                                  <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                                    <Phone className="w-2.5 h-2.5" /> +91 {s.whatsapp.slice(0, 5)}...
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Inventory Breakdown Bar */}
                            <td className="py-3.5 px-3 min-w-[170px]">
                              <div className="flex items-center justify-between text-[11px] mb-1 font-semibold">
                                <span className="text-emerald-400">{s.bottleCount} Bottles</span>
                                <span className="text-purple-400">{s.decantCount} Decants</span>
                              </div>
                              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden flex">
                                <div 
                                  className="bg-emerald-500 h-full" 
                                  style={{ width: `${s.bottleRatio}%` }}
                                  title={`${s.bottleCount} retail bottles (${s.bottleRatio}%)`}
                                />
                                <div 
                                  className="bg-purple-500 h-full" 
                                  style={{ width: `${s.decantRatio}%` }}
                                  title={`${s.decantCount} decants (${s.decantRatio}%)`}
                                />
                              </div>
                              <div className="text-[10px] text-slate-500 mt-1 font-normal">
                                Total: {s.totalInventory} items ({s.bottleRatio}% / {s.decantRatio}%)
                              </div>
                            </td>

                            {/* WhatsApp Leads */}
                            <td className="py-3.5 px-3">
                              <div className="text-sm font-black text-white">
                                {s.totalLeads}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <span className="text-emerald-400">{s.bottleLeads}B</span>
                                <span>&bull;</span>
                                <span className="text-purple-400">{s.decantLeads}D</span>
                              </div>
                            </td>

                            {/* Platform Lead Share */}
                            <td className="py-3.5 px-3">
                              <div className="flex items-center gap-1.5">
                                <div className="text-xs font-bold text-slate-200">{s.leadShare}%</div>
                                <div className="w-12 h-1.5 bg-slate-950 rounded-full overflow-hidden">
                                  <div className="bg-indigo-500 h-full" style={{ width: `${Math.min(100, s.leadShare * 4)}%` }} />
                                </div>
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">of total inquiries</div>
                            </td>

                            {/* Lead Velocity per 100 */}
                            <td className="py-3.5 px-3">
                              <div className="text-xs font-bold text-emerald-400">
                                {s.leadVelocityPer100}
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">leads / 100 listings</div>
                            </td>

                            {/* Inquired GMV */}
                            <td className="py-3.5 px-3">
                              <div className="text-xs font-bold text-amber-300">
                                {s.grossPipeline > 0 ? `₹${s.grossPipeline.toLocaleString()}` : '—'}
                              </div>
                              {s.avgInquiryValue && (
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  AOV: ₹{s.avgInquiryValue.toLocaleString()}
                                </div>
                              )}
                            </td>

                            {/* Price Champions */}
                            <td className="py-3.5 px-3">
                              {s.lowestBottleWins > 0 ? (
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold text-[11px]">
                                  <Award className="w-3 h-3 text-amber-400" />
                                  {s.lowestBottleWins} Lowest Wins
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-500">—</span>
                              )}
                            </td>

                            {/* Avg Pricing */}
                            <td className="py-3.5 px-3 text-[11px]">
                              {s.avgBottlePrice && (
                                <div className="text-emerald-400 font-semibold">
                                  B: ₹{s.avgBottlePrice.toLocaleString()}
                                </div>
                              )}
                              {s.avgDecantPrice && (
                                <div className="text-purple-400 font-semibold">
                                  D: ₹{s.avgDecantPrice.toLocaleString()}
                                </div>
                              )}
                              {!s.avgBottlePrice && !s.avgDecantPrice && (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    drilldownToSellerCatalog(s.name);
                                  }}
                                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition border border-slate-700 whitespace-nowrap"
                                  title="Browse this seller's products in the catalog"
                                >
                                  Browse
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedSellerDossier(s);
                                  }}
                                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition whitespace-nowrap"
                                >
                                  Dossier
                                </button>
                              </div>
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
            {/* TAB 2: DECANT VS RETAIL BATTLEGROUND                          */}
            {/* ============================================================== */}
            {activeTab === 'battleground' && (
              <div className="space-y-6">
                
                {/* Battleground Overview Header */}
                <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Layers className="w-5 h-5 text-purple-400" />
                        Decant vs. Retail Bottle Market Intelligence
                      </h2>
                      <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                        Comprehensive analysis of catalog inventory supply vs. buyer search demand, average order values, and size velocity.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Total Purchase Intent</div>
                        <div className="text-lg font-black text-amber-400">
                          ₹{((decantVsRetailStats?.totalGrossPipeline || 693245) / 100000).toFixed(2)} Lakhs
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Head-to-Head Comparison Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Retail Bottles Card */}
                  <div className="p-5 rounded-xl bg-slate-900/80 border border-emerald-500/20 shadow-md">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                          <ShoppingBag className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">Full Retail Bottles</h3>
                          <p className="text-[11px] text-slate-400">High-Ticket Final Purchase Funnel</p>
                        </div>
                      </div>
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {decantVsRetailStats?.bottleLeadShare || 77.4}% of Inquiries
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 my-4">
                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[11px] text-slate-400">Catalog Inventory</div>
                        <div className="text-xl font-bold text-emerald-400 mt-0.5">
                          {(decantVsRetailStats?.totalBottleListings || 1194).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {decantVsRetailStats?.bottleInventoryShare || 48.5}% of catalog
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[11px] text-slate-400">WhatsApp Leads</div>
                        <div className="text-xl font-bold text-white mt-0.5">
                          {decantVsRetailStats?.totalBottleLeads || 250}
                        </div>
                        <div className="text-[10px] text-emerald-400 mt-0.5 font-semibold">
                          Primary Revenue Driver
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[11px] text-slate-400">Average Bottle Price</div>
                        <div className="text-xl font-bold text-slate-200 mt-0.5">
                          ₹{(decantVsRetailStats?.avgPlatformBottlePrice || 3140).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Across all 11 sellers</div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[11px] text-slate-400">Inquired Pipeline (GMV)</div>
                        <div className="text-xl font-bold text-amber-400 mt-0.5">
                          ₹{((decantVsRetailStats?.totalBottlePipeline || 635200) / 100000).toFixed(2)}L
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">91.6% of platform GMV</div>
                      </div>
                    </div>

                    <div className="text-xs text-slate-400 bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
                      <span className="font-bold text-slate-200">Key Observation: </span>
                      Buyers primarily use the community directory to lock in full retail bottle deals directly from trusted sellers where lowest-price arbitrage yields massive savings compared to e-commerce.
                    </div>
                  </div>

                  {/* Decants Card */}
                  <div className="p-5 rounded-xl bg-slate-900/80 border border-purple-500/20 shadow-md">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">Decants & Samples</h3>
                          <p className="text-[11px] text-slate-400">High-Velocity Discovery & Trial Funnel</p>
                        </div>
                      </div>
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        {decantVsRetailStats?.decantLeadShare || 22.6}% of Inquiries
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 my-4">
                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[11px] text-slate-400">Catalog Offerings</div>
                        <div className="text-xl font-bold text-purple-400 mt-0.5">
                          {(decantVsRetailStats?.totalDecantListings || 1266).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {decantVsRetailStats?.decantInventoryShare || 51.5}% of catalog
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[11px] text-slate-400">WhatsApp Leads</div>
                        <div className="text-xl font-bold text-white mt-0.5">
                          {decantVsRetailStats?.totalDecantLeads || 73}
                        </div>
                        <div className="text-[10px] text-purple-400 mt-0.5 font-semibold">
                          Sample Gateway Funnel
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[11px] text-slate-400">Average Starting Price</div>
                        <div className="text-xl font-bold text-slate-200 mt-0.5">
                          ₹{(decantVsRetailStats?.avgPlatformDecantPrice || 215).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Lowest size average</div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[11px] text-slate-400">Inquired Pipeline (GMV)</div>
                        <div className="text-xl font-bold text-amber-400 mt-0.5">
                          ₹{((decantVsRetailStats?.totalDecantPipeline || 58045) / 1000).toFixed(1)}K
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">8.4% of platform GMV</div>
                      </div>
                    </div>

                    <div className="text-xs text-slate-400 bg-slate-950/40 p-3 rounded-lg border border-slate-800/60">
                      <span className="font-bold text-slate-200">Key Observation: </span>
                      Decants represent over half of total catalog listings, serving as low-barrier test-drives for niche, expensive flankers before customers commit to ₹3,000+ full bottles.
                    </div>
                  </div>

                </div>

                {/* Decant Sizing Popularity Matrix */}
                <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-purple-400" />
                        Decant Size Availability & Supply Distribution
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Breakdown of decant sizing options indexed across community sellers
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                    {(decantVsRetailStats?.decantSizePopularity || [
                      { size: '10ml', count: 1215, share: 96.0 },
                      { size: '5ml', count: 1093, share: 86.3 },
                      { size: '8ml', count: 898, share: 70.9 },
                      { size: '30ml', count: 570, share: 45.0 },
                      { size: '3ml', count: 554, share: 43.8 },
                      { size: '20ml', count: 448, share: 35.4 },
                      { size: '2ml', count: 207, share: 16.3 },
                      { size: '4ml', count: 136, share: 10.7 }
                    ]).map((sz, idx) => (
                      <div key={sz.size} className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-center">
                        <span className="text-xs font-bold text-purple-300 px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                          {sz.size}
                        </span>
                        <div className="text-lg font-bold text-white mt-2">{sz.count}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{sz.share}% coverage</div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* ============================================================== */}
            {/* TAB 3: CATALOG INVENTORY EXPLORER (SERVER-SIDE PAGINATION)     */}
            {/* ============================================================== */}
            {activeTab === 'catalog' && (
              <div className="space-y-4">
                
                {/* Search & Multi-Filter Control Bar */}
                <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    
                    {/* Text Search */}
                    <div className="relative md:col-span-2">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search by perfume name, brand, or DNA..."
                        value={catalogSearch}
                        onChange={(e) => {
                          setCatalogSearch(e.target.value);
                          setCatalogPage(1);
                        }}
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Seller Dropdown Filter */}
                    <div>
                      <select
                        value={catalogSeller}
                        onChange={(e) => {
                          setCatalogSeller(e.target.value);
                          setCatalogPage(1);
                        }}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="all">All Community Sellers</option>
                        {sellerMatrix.map(s => (
                          <option key={s.id} value={s.id || s.name}>
                            {s.name} ({s.totalInventory} items)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Stock Status Filter */}
                    <div>
                      <select
                        value={catalogStockStatus}
                        onChange={(e) => {
                          setCatalogStockStatus(e.target.value);
                          setCatalogPage(1);
                        }}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="all">All Catalog Statuses</option>
                        <option value="in_stock">In Stock (Full Bottles)</option>
                        <option value="has_decants">Decants Available</option>
                        <option value="drops">Live Price Drops</option>
                        <option value="new">New Flanker Arrivals</option>
                      </select>
                    </div>

                  </div>

                  {/* Active Filter Badges & Sort Controls */}
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/60">
                    <div className="flex items-center gap-2">
                      <span>Showing <b>{catalogData.totalCount.toLocaleString()}</b> catalog records</span>
                      {catalogSeller !== 'all' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[11px] font-semibold">
                          Seller: {catalogSeller}
                          <X className="w-3 h-3 cursor-pointer" onClick={() => setCatalogSeller('all')} />
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase">Sort:</span>
                      <select
                        value={catalogSortBy}
                        onChange={(e) => {
                          setCatalogSortBy(e.target.value);
                          setCatalogPage(1);
                        }}
                        className="px-2 py-1 text-xs rounded bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none"
                      >
                        <option value="name_asc">Name (A-Z)</option>
                        <option value="price_asc">Price: Low to High</option>
                        <option value="price_desc">Price: High to Low</option>
                        <option value="rating_desc">Highest Rated</option>
                        <option value="newest">Recently Discovered</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Paginated Catalog Table */}
                <div className="bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden shadow-lg relative">
                  {catalogLoading && (
                    <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-10">
                      <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                          <th className="py-3 px-4">Fragrance & House</th>
                          <th className="py-3 px-3">Concentration</th>
                          <th className="py-3 px-3">Retail Lowest</th>
                          <th className="py-3 px-3">Best Bottle Seller</th>
                          <th className="py-3 px-3">Decant Availability</th>
                          <th className="py-3 px-3">Sellers Quoting</th>
                          <th className="py-3 px-4 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-medium">
                        {catalogData.items.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-800/40 transition">
                            <td className="py-3 px-4">
                              <div className="font-bold text-white text-sm">{item.name}</div>
                              <div className="text-[11px] text-slate-400">{item.brand}</div>
                            </td>
                            <td className="py-3 px-3 text-slate-300">
                              {item.concentration || 'EDP'}
                            </td>
                            <td className="py-3 px-3">
                              {item.community_price ? (
                                <span className="font-bold text-emerald-400 text-sm">
                                  ₹{item.community_price.toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              {item.best_bottle_seller ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-semibold text-[11px]">
                                  <Award className="w-3 h-3 text-indigo-400" />
                                  {item.best_bottle_seller}
                                </span>
                              ) : (
                                <span className="text-slate-500 text-[11px]">No active bottle quote</span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              {item.has_decants && item.lowest_decant_price ? (
                                <div>
                                  <span className="font-semibold text-purple-300">
                                    From ₹{item.lowest_decant_price}
                                  </span>
                                  <div className="text-[10px] text-slate-400">
                                    {Array.isArray(item.community_decants) ? item.community_decants.length : 1} decanter(s)
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-500 text-[11px]">None listed</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-[11px] text-slate-400">
                              {(item.community_sellers?.length || 0) + (item.community_decants?.length || 0)} community quotes
                            </td>
                            <td className="py-3 px-4 text-right">
                              {item.is_price_drop && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 mr-1.5">
                                  DROP
                                </span>
                              )}
                              {item.is_new_arrival && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  NEW
                                </span>
                              )}
                              {!item.is_price_drop && !item.is_new_arrival && (
                                <span className="text-slate-500 text-[11px]">Active</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Server-Side Pagination Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-slate-950/80 border-t border-slate-800 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <span>Rows per page:</span>
                      <select
                        value={catalogPageSize}
                        onChange={(e) => {
                          setCatalogPageSize(Number(e.target.value));
                          setCatalogPage(1);
                        }}
                        className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-200"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <span>
                        Page <b>{catalogData.currentPage}</b> of <b>{catalogData.totalPages}</b> ({catalogData.totalCount.toLocaleString()} total)
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCatalogPage(1)}
                        disabled={catalogPage <= 1}
                        className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800"
                      >
                        <ChevronsLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setCatalogPage(prev => Math.max(1, prev - 1))}
                        disabled={catalogPage <= 1}
                        className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="px-3 py-1 rounded bg-slate-900 border border-slate-800 text-slate-200 font-bold">
                        {catalogPage}
                      </span>
                      <button
                        onClick={() => setCatalogPage(prev => Math.min(catalogData.totalPages, prev + 1))}
                        disabled={catalogPage >= catalogData.totalPages}
                        className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setCatalogPage(catalogData.totalPages)}
                        disabled={catalogPage >= catalogData.totalPages}
                        className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800"
                      >
                        <ChevronsRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* ============================================================== */}
            {/* TAB 4: ARBITRAGE PRICE DROPS                                  */}
            {/* ============================================================== */}
            {activeTab === 'drops' && (
              <div className="space-y-4">
                <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-rose-400" />
                        Live Arbitrage Price Drops ({syncMeta?.activePriceDrops?.length || 0})
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Real-time discounts detected across verified community sellers
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                          <th className="py-3 px-4">Fragrance</th>
                          <th className="py-3 px-3">Discounting Seller</th>
                          <th className="py-3 px-3">Previous Price</th>
                          <th className="py-3 px-3">New Price</th>
                          <th className="py-3 px-3">Drop Amount</th>
                          <th className="py-3 px-4 text-right">Discount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-medium">
                        {(syncMeta?.activePriceDrops || [])
                          .slice((dropsPage - 1) * dropsPageSize, dropsPage * dropsPageSize)
                          .map((drop, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/40 transition">
                              <td className="py-3 px-4">
                                <div className="font-bold text-white text-sm">{drop.name}</div>
                                <div className="text-[11px] text-slate-400">{drop.brand}</div>
                              </td>
                              <td className="py-3 px-3 font-semibold text-slate-300">
                                {drop.seller || 'Community Seller'}
                              </td>
                              <td className="py-3 px-3 text-slate-400 line-through">
                                ₹{drop.previous_price?.toLocaleString()}
                              </td>
                              <td className="py-3 px-3 font-bold text-emerald-400 text-sm">
                                ₹{drop.price?.toLocaleString()}
                              </td>
                              <td className="py-3 px-3 font-bold text-rose-400">
                                -₹{drop.drop_amount?.toLocaleString() || (drop.previous_price - drop.price)}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <span className="inline-flex items-center px-2 py-0.5 rounded font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                  {drop.discount_percentage ? `-${drop.discount_percentage}%` : 'PROMO'}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Drops Pagination */}
                  <div className="flex items-center justify-between pt-4 mt-3 border-t border-slate-800 text-xs text-slate-400">
                    <div>
                      Showing {(dropsPage - 1) * dropsPageSize + 1} - {Math.min(dropsPage * dropsPageSize, syncMeta?.activePriceDrops?.length || 0)} of {syncMeta?.activePriceDrops?.length || 0} drops
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setDropsPage(p => Math.max(1, p - 1))}
                        disabled={dropsPage <= 1}
                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <span className="px-2 font-bold">{dropsPage}</span>
                      <button
                        onClick={() => setDropsPage(p => p + 1)}
                        disabled={dropsPage * dropsPageSize >= (syncMeta?.activePriceDrops?.length || 0)}
                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* TAB 5: FRESH STOCK ARRIVALS                                   */}
            {/* ============================================================== */}
            {activeTab === 'arrivals' && (
              <div className="space-y-4">
                <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        Fresh Stock Arrivals ({syncMeta?.activeNewArrivals?.length || 0})
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Newly discovered flankers and sizes indexed into the catalog
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                          <th className="py-3 px-4">Fragrance</th>
                          <th className="py-3 px-3">Sourcing Seller</th>
                          <th className="py-3 px-3">Format / Size</th>
                          <th className="py-3 px-3">Community Price</th>
                          <th className="py-3 px-4 text-right">Discovered</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-medium">
                        {(syncMeta?.activeNewArrivals || [])
                          .slice((arrivalsPage - 1) * arrivalsPageSize, arrivalsPage * arrivalsPageSize)
                          .map((arrival, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/40 transition">
                              <td className="py-3 px-4">
                                <div className="font-bold text-white text-sm">{arrival.name}</div>
                                <div className="text-[11px] text-slate-400">{arrival.brand}</div>
                              </td>
                              <td className="py-3 px-3 font-semibold text-slate-300">
                                {arrival.seller || 'Community Seller'}
                              </td>
                              <td className="py-3 px-3 text-slate-300">
                                {arrival.size || '100ml Retail'}
                              </td>
                              <td className="py-3 px-3 font-bold text-emerald-400 text-sm">
                                {arrival.price ? `₹${arrival.price.toLocaleString()}` : '—'}
                              </td>
                              <td className="py-3 px-4 text-right text-slate-400 text-[11px]">
                                {arrival.date ? getRelativeTime(arrival.date) : 'Recent'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Arrivals Pagination */}
                  <div className="flex items-center justify-between pt-4 mt-3 border-t border-slate-800 text-xs text-slate-400">
                    <div>
                      Showing {(arrivalsPage - 1) * arrivalsPageSize + 1} - {Math.min(arrivalsPage * arrivalsPageSize, syncMeta?.activeNewArrivals?.length || 0)} of {syncMeta?.activeNewArrivals?.length || 0} arrivals
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setArrivalsPage(p => Math.max(1, p - 1))}
                        disabled={arrivalsPage <= 1}
                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <span className="px-2 font-bold">{arrivalsPage}</span>
                      <button
                        onClick={() => setArrivalsPage(p => p + 1)}
                        disabled={arrivalsPage * arrivalsPageSize >= (syncMeta?.activeNewArrivals?.length || 0)}
                        className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* TAB 6: DEMAND & SEARCH TELEMETRY                              */}
            {/* ============================================================== */}
            {activeTab === 'telemetry' && (
              <div className="space-y-6">
                
                {/* Top 10 Most Clicked Cards with Rank Badges */}
                <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Eye className="w-4 h-4 text-indigo-400" />
                        Top 10 Most Clicked Fragrance Cards
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Ranked by shopper detail opens with WhatsApp buy lead conversion rates
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                          <th className="py-3 px-4 w-16">Rank</th>
                          <th className="py-3 px-4">Fragrance</th>
                          <th className="py-3 px-3">Format</th>
                          <th className="py-3 px-3">Card Clicks / Opens</th>
                          <th className="py-3 px-3">WhatsApp Buy Leads</th>
                          <th className="py-3 px-3">Conversion Rate</th>
                          <th className="py-3 px-4 text-right">Avg Quoted Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-medium">
                        {(demandMetrics?.top10Cards || demandMetrics?.topCardClicks?.slice(0, 10) || []).map((card, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40 transition">
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-black text-xs ${
                                idx === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                idx === 1 ? 'bg-slate-400/20 text-slate-300 border border-slate-400/30' :
                                idx === 2 ? 'bg-amber-700/20 text-amber-600 border border-amber-700/30' :
                                'bg-slate-800 text-slate-400'
                              }`}>
                                #{idx + 1}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-bold text-white text-sm">{card.name}</div>
                              <div className="text-[11px] text-slate-400">{card.brand}</div>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                card.format === 'decant'
                                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              }`}>
                                {card.format || 'bottle'}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-bold text-white text-sm">
                              {card.cardViews}
                            </td>
                            <td className="py-3 px-3 font-bold text-emerald-400 text-sm">
                              {card.whatsappClicks}
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-bold text-indigo-300 text-xs">
                                {card.conversionRate}%
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-slate-200">
                              {card.avgPrice ? `₹${card.avgPrice.toLocaleString()}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Top Search Queries Table */}
                <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Search className="w-4 h-4 text-emerald-400" />
                        Top Search Queries & Unfulfilled Demand
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Real keyword searches from shoppers exploring fragrances
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                          <th className="py-3 px-4">Keyword Query</th>
                          <th className="py-3 px-3">Search Frequency</th>
                          <th className="py-3 px-3">Unique Shopper Sessions</th>
                          <th className="py-3 px-4 text-right">Zero-Result Searches</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-medium">
                        {(demandMetrics?.searchInsights?.topSearches || []).slice(0, 10).map((s, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40 transition">
                            <td className="py-3 px-4 font-bold text-white capitalize">
                              "{s.query}"
                            </td>
                            <td className="py-3 px-3 text-slate-300 font-semibold">
                              {s.count} searches
                            </td>
                            <td className="py-3 px-3 text-slate-400">
                              {s.uniqueSessions} sessions
                            </td>
                            <td className="py-3 px-4 text-right">
                              {s.zeroResults ? (
                                <span className="text-rose-400 font-bold">Unfulfilled ({s.zeroResults})</span>
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
          </>
        )}

      </main>

      {/* ============================================================== */}
      {/* SELLER DOSSIER MODAL / INSPECTOR                              */}
      {/* ============================================================== */}
      {selectedSellerDossier && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
            
            {/* Modal Header */}
            <div className="p-6 bg-slate-950 border-b border-slate-800 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black text-white">{selectedSellerDossier.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Verified
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Archetype: <span className="text-indigo-400 font-semibold">{selectedSellerDossier.archetype}</span> &bull; Last lead: {selectedSellerDossier.lastLeadAt ? getRelativeTime(selectedSellerDossier.lastLeadAt) : 'Recent'}
                </p>
              </div>
              <button
                onClick={() => setSelectedSellerDossier(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs max-h-[75vh] overflow-y-auto">
              
              {/* 4 Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-400 text-[11px]">Total Stock</div>
                  <div className="text-lg font-black text-white mt-0.5">{selectedSellerDossier.totalInventory}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{selectedSellerDossier.bottleCount}B / {selectedSellerDossier.decantCount}D</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-400 text-[11px]">WhatsApp Leads</div>
                  <div className="text-lg font-black text-emerald-400 mt-0.5">{selectedSellerDossier.totalLeads}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{selectedSellerDossier.leadShare}% share</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-400 text-[11px]">Inquired GMV</div>
                  <div className="text-lg font-black text-amber-400 mt-0.5">₹{selectedSellerDossier.grossPipeline.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">AOV: ₹{selectedSellerDossier.avgInquiryValue || '—'}</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-slate-400 text-[11px]">Lowest Price Wins</div>
                  <div className="text-lg font-black text-indigo-400 mt-0.5">{selectedSellerDossier.lowestBottleWins}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Price Leader</div>
                </div>
              </div>

              {/* Retail vs Decant Visual Breakdown */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between font-bold mb-2">
                  <span className="text-emerald-400">{selectedSellerDossier.bottleCount} Retail Bottles ({selectedSellerDossier.bottleRatio}%)</span>
                  <span className="text-purple-400">{selectedSellerDossier.decantCount} Decants ({selectedSellerDossier.decantRatio}%)</span>
                </div>
                <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden flex">
                  <div className="bg-emerald-500 h-full" style={{ width: `${selectedSellerDossier.bottleRatio}%` }} />
                  <div className="bg-purple-500 h-full" style={{ width: `${selectedSellerDossier.decantRatio}%` }} />
                </div>
              </div>

              {/* Decant Sizes Offered */}
              {selectedSellerDossier.decantSizes && selectedSellerDossier.decantSizes.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Decant Sizes Offered:</h4>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {selectedSellerDossier.decantSizes.map(sz => (
                      <span key={sz} className="px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20 font-bold text-xs">
                        {sz}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Logistics & Fulfillment Terms */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <Truck className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="font-bold">Dispatch SLA:</span>
                  </div>
                  <div className="text-slate-200 font-semibold">{selectedSellerDossier.dispatch}</div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <Package className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="font-bold">Shipping Policy:</span>
                  </div>
                  <div className="text-slate-200 font-semibold">{selectedSellerDossier.shipping}</div>
                </div>
              </div>

              {/* Direct Actions */}
              <div className="flex items-center justify-between pt-2">
                {selectedSellerDossier.whatsapp && (
                  <a
                    href={`https://wa.me/91${selectedSellerDossier.whatsapp}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 font-semibold transition"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Test WhatsApp Direct (+91 {selectedSellerDossier.whatsapp})
                  </a>
                )}

                <button
                  onClick={() => drilldownToSellerCatalog(selectedSellerDossier.name)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition shadow-lg shadow-indigo-600/20"
                >
                  <Search className="w-4 h-4" />
                  View All {selectedSellerDossier.name} Products in Catalog
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
