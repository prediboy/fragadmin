import React, { useState } from 'react';
import {
  TrendingUp, Activity, MessageCircle, Globe, Smartphone,
  DollarSign, Layers, ArrowUpRight, Calendar
} from 'lucide-react';

export default function DailyTrendChart({ dailyVelocity = [], timeframeLabel = 'Last 7 Days' }) {
  const [activeMetric, setActiveMetric] = useState('combined'); // 'combined' | 'conversions' | 'traffic'
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (!dailyVelocity || dailyVelocity.length === 0) {
    return (
      <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-6 text-center text-slate-400 text-xs">
        <Activity className="w-6 h-6 mx-auto mb-2 text-slate-600 animate-pulse" />
        No daily velocity data available for this timeframe.
      </div>
    );
  }

  // Calculate scales and max values
  const maxVisits = Math.max(...dailyVelocity.map(d => d.visits || 0), 10);
  const maxConverts = Math.max(...dailyVelocity.map(d => d.converts || 0), 5);
  const maxGmv = Math.max(...dailyVelocity.map(d => d.gmv || 0), 1000);

  // Peak days
  const peakVisitDay = [...dailyVelocity].sort((a, b) => (b.visits || 0) - (a.visits || 0))[0];
  const peakConvertDay = [...dailyVelocity].sort((a, b) => (b.converts || 0) - (a.converts || 0))[0];
  const totalPeriodVisits = dailyVelocity.reduce((sum, d) => sum + (d.visits || 0), 0);
  const totalPeriodConverts = dailyVelocity.reduce((sum, d) => sum + (d.converts || 0), 0);
  const totalPeriodGmv = dailyVelocity.reduce((sum, d) => sum + (d.gmv || 0), 0);
  const avgDailyVisits = Math.round(totalPeriodVisits / dailyVelocity.length);
  const avgDailyConverts = Number((totalPeriodConverts / dailyVelocity.length).toFixed(1));

  // Chart dimensions (SVG coordinates)
  const chartWidth = 800;
  const chartHeight = 220;
  const paddingLeft = 45;
  const paddingRight = 45;
  const paddingTop = 25;
  const paddingBottom = 35;
  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  const numDays = dailyVelocity.length;
  const stepX = numDays > 1 ? plotWidth / (numDays - 1) : plotWidth;
  const barWidth = Math.max(8, Math.min(28, (plotWidth / numDays) * 0.45));

  // Generate coordinate points for curves/lines
  const points = dailyVelocity.map((d, i) => {
    const x = paddingLeft + (numDays > 1 ? i * stepX : plotWidth / 2);
    const yVisits = paddingTop + plotHeight - ((d.visits || 0) / maxVisits) * plotHeight;
    const yConverts = paddingTop + plotHeight - ((d.converts || 0) / maxConverts) * plotHeight;
    return { x, yVisits, yConverts, data: d, index: i };
  });

  // SVG path generator for smooth or straight line
  const createLinePath = (yKey) => {
    if (points.length === 0) return '';
    return points.reduce((path, pt, i) => {
      return i === 0 ? `M ${pt.x} ${pt[yKey]}` : `${path} L ${pt.x} ${pt[yKey]}`;
    }, '');
  };

  const createAreaPath = (yKey) => {
    if (points.length === 0) return '';
    const line = createLinePath(yKey);
    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    const bottomY = paddingTop + plotHeight;
    return `${line} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  const hoveredItem = hoveredIndex !== null && dailyVelocity[hoveredIndex] ? dailyVelocity[hoveredIndex] : null;

  return (
    <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-xl space-y-4">
      
      {/* Top Header & View Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <TrendingUp className="w-4 h-4" />
            </span>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              Daily Velocity Trend & Volume ({timeframeLabel})
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Day-by-day telemetry analyzing visitor traffic velocity against downstream WhatsApp buyer conversions
          </p>
        </div>

        {/* View Mode Toggle Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start lg:self-auto">
          <button
            onClick={() => setActiveMetric('combined')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              activeMetric === 'combined'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Traffic vs Leads</span>
          </button>

          <button
            onClick={() => setActiveMetric('conversions')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              activeMetric === 'conversions'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>WhatsApp & GMV</span>
          </button>

          <button
            onClick={() => setActiveMetric('traffic')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              activeMetric === 'traffic'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Traffic by Channel</span>
          </button>
        </div>
      </div>

      {/* KPI Micro Highlights Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
        <div>
          <div className="text-[10px] uppercase font-bold text-slate-400">Avg Daily Visits</div>
          <div className="text-lg font-black text-blue-400 font-mono mt-0.5">
            {avgDailyVisits.toLocaleString()} <span className="text-[11px] font-normal text-slate-500">/ day</span>
          </div>
          <div className="text-[10px] text-slate-500 truncate">
            Peak: {peakVisitDay?.date || '—'} ({peakVisitDay?.visits || 0})
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase font-bold text-slate-400">Avg WhatsApp Leads</div>
          <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
            {avgDailyConverts} <span className="text-[11px] font-normal text-slate-500">/ day</span>
          </div>
          <div className="text-[10px] text-slate-500 truncate">
            Peak: {peakConvertDay?.date || '—'} ({peakConvertDay?.converts || 0} leads)
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase font-bold text-slate-400">Period Total GMV</div>
          <div className="text-lg font-black text-amber-300 font-mono mt-0.5">
            ₹{totalPeriodGmv.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500">
            {totalPeriodConverts} buyer chats initiated
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase font-bold text-slate-400">Conversion Rate</div>
          <div className="text-lg font-black text-purple-300 font-mono mt-0.5">
            {totalPeriodVisits > 0 ? ((totalPeriodConverts / totalPeriodVisits) * 100).toFixed(1) : 0}%
          </div>
          <div className="text-[10px] text-slate-500">
            Session to lead velocity
          </div>
        </div>
      </div>

      {/* Interactive SVG Chart Container */}
      <div className="relative w-full bg-slate-950/80 rounded-xl border border-slate-800/80 p-3 overflow-hidden select-none">
        
        {/* Floating Tooltip Display */}
        {hoveredItem && (
          <div className="absolute top-4 right-4 z-20 bg-slate-900/95 border border-slate-700/80 backdrop-blur-md rounded-xl p-3 shadow-2xl text-xs space-y-1.5 pointer-events-none min-w-[200px] animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-slate-200 font-bold">
              <span className="flex items-center gap-1.5 text-indigo-400">
                <Calendar className="w-3.5 h-3.5" />
                {hoveredItem.date}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                {hoveredItem.conversionRate}% Conv
              </span>
            </div>
            
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 text-blue-400">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Total Visits:
              </span>
              <span className="font-bold font-mono text-white">
                {hoveredItem.visits} <span className="text-[10px] text-slate-400 font-normal">({hoveredItem.uniqueVisitors} unique)</span>
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                WhatsApp Leads:
              </span>
              <span className="font-bold font-mono text-white">
                {hoveredItem.converts} <span className="text-[10px] text-slate-400 font-normal">({hoveredItem.bottles} bot / {hoveredItem.decants} dec)</span>
              </span>
            </div>

            {hoveredItem.gmv > 0 && (
              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Inquired GMV:
                </span>
                <span className="font-bold font-mono text-amber-300">
                  ₹{hoveredItem.gmv.toLocaleString()}
                </span>
              </div>
            )}

            {(hoveredItem.redditVisits > 0 || hoveredItem.directVisits > 0) && (
              <div className="pt-1 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                <span>Reddit: <strong className="text-orange-400">{hoveredItem.redditVisits}</strong></span>
                <span>Direct: <strong className="text-blue-400">{hoveredItem.directVisits}</strong></span>
                {hoveredItem.googleVisits > 0 && <span>Google: <strong className="text-emerald-400">{hoveredItem.googleVisits}</strong></span>}
              </div>
            )}
          </div>
        )}

        {/* SVG Drawing */}
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-56 md:h-64 overflow-visible"
        >
          <defs>
            {/* Gradients */}
            <linearGradient id="visitsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
            </linearGradient>

            <linearGradient id="convertsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
            </linearGradient>

            <linearGradient id="barGradientBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60A5FA" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>

            <linearGradient id="barGradientEmerald" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>

            <linearGradient id="barGradientAmber" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>
          </defs>

          {/* Dotted Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const y = paddingTop + plotHeight * (1 - pct);
            const val = Math.round(maxVisits * pct);
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="#334155"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  opacity="0.35"
                />
                {/* Left Y Axis Label (Visits) */}
                <text
                  x={paddingLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="#64748B"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Right Y Axis Label (Conversions) */}
          {[0, 0.5, 1].map((pct, idx) => {
            const y = paddingTop + plotHeight * (1 - pct);
            const cVal = Math.round(maxConverts * pct);
            return (
              <text
                key={idx}
                x={chartWidth - paddingRight + 8}
                y={y + 3}
                textAnchor="start"
                fill="#10B981"
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {cVal}
              </text>
            );
          })}

          {/* Metric View 1: COMBINED (Visits Bars + WhatsApp Curve Line) */}
          {activeMetric === 'combined' && (
            <>
              {/* Traffic Visits Area Background */}
              <path
                d={createAreaPath('yVisits')}
                fill="url(#visitsGradient)"
              />

              {/* Visits Smooth Line */}
              <path
                d={createLinePath('yVisits')}
                fill="none"
                stroke="#3B82F6"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* WhatsApp Conversions Area Background */}
              <path
                d={createAreaPath('yConverts')}
                fill="url(#convertsGradient)"
              />

              {/* WhatsApp Conversions Line */}
              <path
                d={createLinePath('yConverts')}
                fill="none"
                stroke="#10B981"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Interactive Data Points and Columns */}
              {points.map((pt, i) => {
                const isHovered = hoveredIndex === i;
                return (
                  <g key={i}>
                    {/* Vertical Highlight Beam on Hover */}
                    {isHovered && (
                      <line
                        x1={pt.x}
                        y1={paddingTop}
                        x2={pt.x}
                        y2={paddingTop + plotHeight}
                        stroke="#818CF8"
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                      />
                    )}

                    {/* Visits Point Dot */}
                    <circle
                      cx={pt.x}
                      cy={pt.yVisits}
                      r={isHovered ? 5 : 3}
                      fill="#3B82F6"
                      stroke="#0F172A"
                      strokeWidth="2"
                    />

                    {/* WhatsApp Convert Dot */}
                    <circle
                      cx={pt.x}
                      cy={pt.yConverts}
                      r={isHovered ? 6 : 4}
                      fill="#10B981"
                      stroke="#0F172A"
                      strokeWidth="2"
                      className="transition-all"
                    />
                  </g>
                );
              })}
            </>
          )}

          {/* Metric View 2: CONVERSIONS & GMV */}
          {activeMetric === 'conversions' && (
            <>
              {/* WhatsApp Conversions Area */}
              <path
                d={createAreaPath('yConverts')}
                fill="url(#convertsGradient)"
              />

              {/* Grouped/Stacked Bars for Bottles and Decants */}
              {points.map((pt, i) => {
                const d = pt.data;
                const totalC = (d.converts || 0);
                const bCount = (d.bottles || 0);
                const decCount = (d.decants || 0);

                const barH = totalC > 0 ? (totalC / maxConverts) * plotHeight : 0;
                const bH = totalC > 0 ? (bCount / totalC) * barH : 0;
                const decH = barH - bH;

                const barY = paddingTop + plotHeight - barH;
                const isHovered = hoveredIndex === i;

                return (
                  <g key={i}>
                    {/* Bottle segment (emerald) */}
                    {bH > 0 && (
                      <rect
                        x={pt.x - barWidth / 2}
                        y={barY + decH}
                        width={barWidth}
                        height={bH}
                        fill="url(#barGradientEmerald)"
                        rx="2"
                        opacity={isHovered ? 1 : 0.85}
                      />
                    )}
                    {/* Decant segment (cyan) */}
                    {decH > 0 && (
                      <rect
                        x={pt.x - barWidth / 2}
                        y={barY}
                        width={barWidth}
                        height={decH}
                        fill="#06B6D4"
                        rx="2"
                        opacity={isHovered ? 1 : 0.85}
                      />
                    )}

                    {/* Value label on top of bar if > 0 */}
                    {totalC > 0 && (
                      <text
                        x={pt.x}
                        y={barY - 5}
                        textAnchor="middle"
                        fill="#34D399"
                        fontSize="9"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {totalC}
                      </text>
                    )}
                  </g>
                );
              })}
            </>
          )}

          {/* Metric View 3: TRAFFIC BY CHANNEL */}
          {activeMetric === 'traffic' && (
            <>
              {/* Traffic Visits Bars */}
              {points.map((pt, i) => {
                const d = pt.data;
                const totalV = (d.visits || 0);
                const rV = (d.redditVisits || 0);
                const gV = (d.googleVisits || 0);
                const dV = Math.max(0, totalV - rV - gV);

                const totalBarH = totalV > 0 ? (totalV / maxVisits) * plotHeight : 0;
                const rH = totalV > 0 ? (rV / totalV) * totalBarH : 0;
                const gH = totalV > 0 ? (gV / totalV) * totalBarH : 0;
                const dH = Math.max(0, totalBarH - rH - gH);

                const barY = paddingTop + plotHeight - totalBarH;
                const isHovered = hoveredIndex === i;

                return (
                  <g key={i}>
                    {/* Direct segment (blue) */}
                    {dH > 0 && (
                      <rect
                        x={pt.x - barWidth / 2}
                        y={barY + rH + gH}
                        width={barWidth}
                        height={dH}
                        fill="url(#barGradientBlue)"
                        rx="2"
                        opacity={isHovered ? 1 : 0.85}
                      />
                    )}

                    {/* Reddit segment (orange) */}
                    {rH > 0 && (
                      <rect
                        x={pt.x - barWidth / 2}
                        y={barY + gH}
                        width={barWidth}
                        height={rH}
                        fill="#F97316"
                        rx="2"
                        opacity={isHovered ? 1 : 0.85}
                      />
                    )}

                    {/* Google segment (emerald) */}
                    {gH > 0 && (
                      <rect
                        x={pt.x - barWidth / 2}
                        y={barY}
                        width={barWidth}
                        height={gH}
                        fill="#10B981"
                        rx="2"
                        opacity={isHovered ? 1 : 0.85}
                      />
                    )}
                  </g>
                );
              })}
            </>
          )}

          {/* X Axis Date Labels & Invisible Hover Hitboxes */}
          {points.map((pt, i) => {
            const d = pt.data;
            const isHovered = hoveredIndex === i;
            // For longer timeframes (e.g. 30 days), display every Nth label and avoid collision with the last label
            const stride = numDays > 20 ? 3 : 2;
            const isLast = i === numDays - 1;
            const tooCloseToLast = (numDays - 1 - i) < stride;
            const skipLabel = numDays > 14 ? (!isLast && (i % stride !== 0 || tooCloseToLast)) : false;

            return (
              <g key={`axis-${i}`}>
                {/* Date Label */}
                {!skipLabel && (
                  <text
                    x={pt.x}
                    y={chartHeight - 12}
                    textAnchor="middle"
                    fill={isHovered ? '#FFFFFF' : '#64748B'}
                    fontSize="9"
                    fontWeight={isHovered ? 'bold' : 'normal'}
                    className="transition-colors"
                  >
                    {d.date}
                  </text>
                )}

                {/* Invisible hover hitbox covering full vertical column */}
                <rect
                  x={pt.x - (numDays > 1 ? stepX / 2 : plotWidth / 2)}
                  y={paddingTop}
                  width={numDays > 1 ? stepX : plotWidth}
                  height={plotHeight + paddingBottom}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              </g>
            );
          })}
        </svg>

        {/* Legend Footer */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 px-3 pt-2 border-t border-slate-800/80 flex-wrap gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            {activeMetric === 'combined' && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm" />
                  <span className="text-slate-300 font-semibold">Total Visits (Blue Line / Scale Left)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm" />
                  <span className="text-emerald-400 font-semibold">WhatsApp Leads (Green Line / Scale Right)</span>
                </div>
              </>
            )}

            {activeMetric === 'conversions' && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-emerald-400 font-semibold">Retail Bottles Leads</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                  <span className="text-cyan-400 font-semibold">Decant Leads</span>
                </div>
              </>
            )}

            {activeMetric === 'traffic' && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span>Direct & Bookmarks</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                  <span className="text-orange-400 font-semibold">Reddit Community</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>Google Search</span>
                </div>
              </>
            )}
          </div>

          <div className="text-[10px] text-slate-500 font-mono">
            Hover over any point/bar to view exact daily breakdown
          </div>
        </div>

      </div>

    </div>
  );
}
