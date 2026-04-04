/**
 * Quote Analytics Dashboard
 * 
 * Візуалізація бізнес-метрик:
 * - Overview KPIs
 * - Scenario Performance (конверсія по сценаріях)
 * - Manager Performance (маржа, override, втрати)
 * - Source Performance
 * - Timeline charts
 * - Lost Revenue Analysis
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../App';
import { motion } from 'framer-motion';
import { useLang } from '../i18n';
import { 
  ChartPie,
  CurrencyCircleDollar,
  TrendUp,
  TrendDown,
  Users,
  UserCircle,
  Calculator,
  Target,
  ArrowsLeftRight,
  Warning,
  CheckCircle,
  CaretUp,
  CaretDown,
  Coins,
  ChartLine,
  Percent,
  Receipt,
  ArrowSquareOut
} from '@phosphor-icons/react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const QuoteAnalytics = () => {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/admin/quote-analytics`);
      setData(response.data);
    } catch (err) {
      console.error('Quote Analytics error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="quote-analytics-loading">
        <div className="animate-spin w-8 h-8 border-2 border-[#4F46E5] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const { overview, scenarios, managers, sources, timeline, lostRevenue } = data;

  const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

  const scenarioColors = {
    minimum: '#10B981',
    recommended: '#4F46E5',
    aggressive: '#F59E0B',
  };

  const scenarioLabels = {
    minimum: 'Мінімум',
    recommended: 'Рекомендована',
    aggressive: 'Агресивна',
  };

  return (
    <motion.div 
      data-testid="quote-analytics-page"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#18181B]" style={{ fontFamily: 'Cabinet Grotesk, sans-serif' }}>
            Quote Analytics
          </h1>
          <p className="text-sm text-[#71717A] mt-1">
            Аналітика прорахунків, маржі та ефективності менеджерів
          </p>
        </div>
        <button 
          onClick={fetchAnalytics}
          className="btn-secondary"
          data-testid="refresh-analytics-btn"
        >
          Оновити
        </button>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" data-testid="kpi-summary">
        <KpiCard 
          icon={Receipt} 
          label="Всього Quotes" 
          value={overview.totalQuotes} 
          color="#4F46E5"
        />
        <KpiCard 
          icon={TrendUp} 
          label="Quote → Lead" 
          value={`${overview.conversionRate}%`} 
          color="#10B981"
        />
        <KpiCard 
          icon={Coins} 
          label="Очікувана маржа" 
          value={`$${formatNumber(overview.estimatedMargin)}`} 
          color="#7C3AED"
        />
        <KpiCard 
          icon={CurrencyCircleDollar} 
          label="Visible Revenue" 
          value={`$${formatNumber(overview.totalVisibleRevenue)}`} 
          color="#059669"
        />
        <KpiCard 
          icon={Target} 
          label="Hidden Fee" 
          value={`$${formatNumber(overview.totalHiddenFee)}`} 
          color="#D97706"
        />
        <KpiCard 
          icon={Warning} 
          label="Lost Revenue" 
          value={`$${formatNumber(lostRevenue.totalLostRevenue)}`} 
          color="#DC2626"
          alert={lostRevenue.totalLostRevenue > 0}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scenario Performance */}
        <div className="section-card" data-testid="scenario-performance">
          <div className="section-title-clean">
            <ChartPie size={22} weight="duotone" className="text-[#4F46E5]" />
            <span>Scenario Performance</span>
          </div>
          
          <div className="space-y-4">
            {scenarios.map((item) => (
              <div 
                key={item.scenario}
                className="p-4 rounded-xl border border-[#E4E4E7] hover:border-[#4F46E5]/30 transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ background: scenarioColors[item.scenario] || '#71717A' }}
                    />
                    <span className="font-semibold text-[#18181B]">
                      {scenarioLabels[item.scenario] || item.scenario}
                    </span>
                  </div>
                  <span className="text-2xl font-bold text-[#18181B]">{item.count}</span>
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-[#71717A]">Конверсія</p>
                    <p className="font-semibold text-[#18181B]">{item.conversionRate}%</p>
                  </div>
                  <div>
                    <p className="text-[#71717A]">Avg Price</p>
                    <p className="font-semibold text-[#18181B]">${formatNumber(item.avgVisibleTotal)}</p>
                  </div>
                  <div>
                    <p className="text-[#71717A]">Avg Margin</p>
                    <p className="font-semibold text-[#18181B]">${formatNumber(item.avgHiddenFee)}</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-2 bg-[#F4F4F5] rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all"
                    style={{ 
                      width: `${item.conversionRate}%`,
                      background: scenarioColors[item.scenario] || '#71717A'
                    }}
                  />
                </div>
              </div>
            ))}

            {scenarios.length === 0 && (
              <p className="text-sm text-[#71717A] text-center py-8">Немає даних по сценаріях</p>
            )}
          </div>
        </div>

        {/* Source Performance */}
        <div className="section-card" data-testid="source-performance">
          <div className="section-title-clean">
            <ArrowSquareOut size={22} weight="duotone" className="text-[#7C3AED]" />
            <span>Source Performance</span>
          </div>
          
          <div className="space-y-3">
            {sources.map((item, idx) => (
              <div 
                key={item.source}
                className="p-4 rounded-xl border border-[#E4E4E7] hover:border-[#7C3AED]/30 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                      style={{ background: COLORS[idx % COLORS.length] }}
                    >
                      {item.source?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="font-semibold text-[#18181B] capitalize">{item.source || 'unknown'}</p>
                      <p className="text-xs text-[#71717A]">{item.totalQuotes} quotes</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[#18181B]">{item.conversionRate}%</p>
                    <p className="text-xs text-[#71717A]">conversion</p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-xs text-[#71717A] mt-2 pt-2 border-t border-[#E4E4E7]">
                  <span>Revenue: ${formatNumber(item.totalVisibleRevenue)}</span>
                  <span className="font-semibold text-[#059669]">Margin: ${formatNumber(item.estimatedMargin)}</span>
                </div>
              </div>
            ))}

            {sources.length === 0 && (
              <p className="text-sm text-[#71717A] text-center py-8">Немає даних по джерелах</p>
            )}
          </div>
        </div>
      </div>

      {/* Manager Performance Table */}
      <div className="section-card" data-testid="manager-performance">
        <div className="section-title-clean">
          <Users size={22} weight="duotone" className="text-[#D97706]" />
          <span>Manager Performance</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="manager-table">
            <thead>
              <tr className="border-b border-[#E4E4E7]">
                <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[#71717A]">Менеджер</th>
                <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[#71717A]">Quotes</th>
                <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[#71717A]">Conv %</th>
                <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[#71717A]">Avg Margin</th>
                <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[#71717A]">Total Margin</th>
                <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[#71717A]">Overrides</th>
                <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[#71717A]">Override %</th>
                <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[#71717A]">Lost $</th>
              </tr>
            </thead>
            <tbody>
              {managers.map((item, idx) => (
                <tr 
                  key={item.managerId} 
                  className="border-b border-[#E4E4E7] hover:bg-[#F4F4F5] transition-colors"
                  data-testid={`manager-row-${idx}`}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-[#18181B] to-[#3F3F46] rounded-lg flex items-center justify-center text-xs font-semibold text-white">
                        {item.managerName?.split(' ').map(n => n[0]).join('') || '?'}
                      </div>
                      <div>
                        <p className="font-medium text-[#18181B]">{item.managerName || item.managerId}</p>
                        <p className="text-xs text-[#71717A]">{item.managerEmail}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-[#18181B]">{item.totalQuotes}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-semibold ${item.conversionRate >= 50 ? 'text-[#059669]' : item.conversionRate >= 30 ? 'text-[#D97706]' : 'text-[#DC2626]'}`}>
                      {item.conversionRate}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-[#18181B]">${formatNumber(item.avgMargin)}</td>
                  <td className="py-3 px-4 text-right font-semibold text-[#059669]">${formatNumber(item.totalMargin)}</td>
                  <td className="py-3 px-4 text-right">{item.overridesCount}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-medium ${item.overrideRate > 30 ? 'text-[#DC2626]' : item.overrideRate > 15 ? 'text-[#D97706]' : 'text-[#71717A]'}`}>
                      {item.overrideRate}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-semibold ${item.revenueLostByOverride > 0 ? 'text-[#DC2626]' : 'text-[#71717A]'}`}>
                      ${formatNumber(item.revenueLostByOverride)}
                    </span>
                  </td>
                </tr>
              ))}
              {managers.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#71717A]">
                    Немає даних по менеджерах
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Timeline Chart */}
      <div className="section-card" data-testid="timeline-chart">
        <div className="section-title-clean">
          <ChartLine size={22} weight="duotone" className="text-[#059669]" />
          <span>Timeline (останні 30 днів)</span>
        </div>
        
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeline}>
              <defs>
                <linearGradient id="colorQuotes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorMargin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12, fill: '#71717A' }}
                tickFormatter={(value) => value.slice(5)}
              />
              <YAxis tick={{ fontSize: 12, fill: '#71717A' }} />
              <Tooltip 
                contentStyle={{ 
                  background: '#18181B', 
                  border: 'none', 
                  borderRadius: '12px',
                  color: '#fff'
                }}
                formatter={(value, name) => [
                  name === 'totalQuotes' ? value : `$${formatNumber(value)}`,
                  name === 'totalQuotes' ? 'Quotes' : 'Margin'
                ]}
              />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="totalQuotes" 
                stroke="#4F46E5" 
                fillOpacity={1}
                fill="url(#colorQuotes)"
                name="Quotes"
              />
              <Area 
                type="monotone" 
                dataKey="totalMargin" 
                stroke="#10B981" 
                fillOpacity={1}
                fill="url(#colorMargin)"
                name="Margin"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Lost Revenue Analysis */}
      {lostRevenue.totalLostRevenue > 0 && (
        <div className="section-card border-[#DC2626]/30" data-testid="lost-revenue-analysis">
          <div className="section-title-clean">
            <Warning size={22} weight="duotone" className="text-[#DC2626]" />
            <span>Lost Revenue Analysis</span>
            <span className="ml-auto text-2xl font-bold text-[#DC2626]">
              -${formatNumber(lostRevenue.totalLostRevenue)}
            </span>
          </div>
          
          <p className="text-sm text-[#71717A] mb-4">
            Top {lostRevenue.topLosses.length} price overrides з найбільшими втратами маржі
          </p>
          
          <div className="space-y-2">
            {lostRevenue.topLosses.slice(0, 5).map((item, idx) => (
              <div 
                key={item.quoteNumber || idx}
                className="p-3 rounded-xl bg-[#FEE2E2]/50 border border-[#DC2626]/20 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-[#18181B]">{item.quoteNumber}</p>
                  <p className="text-xs text-[#71717A]">{item.vehicleTitle || item.vin}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-[#DC2626]">-${formatNumber(item.delta)}</p>
                  <p className="text-xs text-[#71717A]">
                    ${formatNumber(item.originalPrice)} → ${formatNumber(item.overridePrice)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};

// Helper Components
const KpiCard = ({ icon: Icon, label, value, color, alert }) => (
  <div 
    className={`kpi-card ${alert ? 'border-[#DC2626]' : ''}`} 
    data-testid={`kpi-${label.toLowerCase().replace(/\s/g, '-')}`}
  >
    <div className="mb-3">
      <Icon size={28} weight="duotone" style={{ color }} />
    </div>
    <div className={`kpi-value ${alert ? 'text-[#DC2626]' : ''}`}>{value}</div>
    <div className="kpi-label">{label}</div>
  </div>
);

// Format number with K/M suffixes
const formatNumber = (num) => {
  if (num === null || num === undefined) return '0';
  if (Math.abs(num) >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (Math.abs(num) >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

export default QuoteAnalytics;
