/**
 * Journey UI - Funnel Visualization Page
 * 
 * Візуалізація воронки продажів з:
 * - Графічним представленням етапів
 * - Drop-off аналітикою
 * - Середніми тривалостями
 * - Bottleneck індикаторами
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLang } from '../../i18n';
import {
  TrendingDown,
  TrendingUp,
  Clock,
  Users,
  Target,
  AlertTriangle,
  RefreshCw,
  ArrowDown,
  ChevronRight,
  BarChart3,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Stage config with colors and icons
const STAGE_CONFIG = {
  NEW_LEAD: { label: 'Новий лід', labelEn: 'New Lead', color: '#3B82F6', icon: Users },
  CONTACT_ATTEMPT: { label: 'Контакт', labelEn: 'Contact', color: '#8B5CF6', icon: Users },
  QUALIFIED: { label: 'Кваліфікований', labelEn: 'Qualified', color: '#6366F1', icon: Target },
  CAR_SELECTED: { label: 'Авто обрано', labelEn: 'Car Selected', color: '#14B8A6', icon: Target },
  NEGOTIATION: { label: 'Переговори', labelEn: 'Negotiation', color: '#F59E0B', icon: Target },
  CONTRACT_SENT: { label: 'Контракт', labelEn: 'Contract Sent', color: '#EAB308', icon: Target },
  CONTRACT_SIGNED: { label: 'Підписано', labelEn: 'Signed', color: '#84CC16', icon: Target },
  PAYMENT_PENDING: { label: 'Очікує оплату', labelEn: 'Payment Pending', color: '#F97316', icon: Target },
  PAYMENT_DONE: { label: 'Оплачено', labelEn: 'Paid', color: '#22C55E', icon: Target },
  SHIPPING: { label: 'Доставка', labelEn: 'Shipping', color: '#06B6D4', icon: Target },
  DELIVERED: { label: 'Доставлено', labelEn: 'Delivered', color: '#10B981', icon: Target },
};

const STAGE_ORDER = Object.keys(STAGE_CONFIG);

const JourneyPage = () => {
  const { t, lang } = useLang();
  const [loading, setLoading] = useState(true);
  const [funnelData, setFunnelData] = useState(null);
  const [bottlenecks, setBottlenecks] = useState([]);
  const [durations, setDurations] = useState(null);
  const [period, setPeriod] = useState(30);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [funnelRes, bottlenecksRes, durationsRes] = await Promise.all([
        axios.get(`${API_URL}/api/journey/funnel?days=${period}`, { headers }),
        axios.get(`${API_URL}/api/journey/bottlenecks?days=${period}`, { headers }),
        axios.get(`${API_URL}/api/journey/durations?days=${period}`, { headers }),
      ]);

      setFunnelData(funnelRes.data);
      setBottlenecks(bottlenecksRes.data);
      setDurations(durationsRes.data);
    } catch (err) {
      console.error('Failed to fetch journey data:', err);
      setError('Не вдалось завантажити дані воронки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period]);

  const maxFunnelValue = funnelData 
    ? Math.max(...STAGE_ORDER.map(stage => funnelData.funnel[stage] || 0), 1)
    : 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6" data-testid="journey-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-blue-400" />
            {t('journeyFunnelTitle')}
          </h1>
          <p className="text-slate-400 mt-1">
            {t('journeyFunnelSubtitle')}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Period Selector */}
          <select
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
            className="bg-slate-700 text-white border border-slate-600 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
            data-testid="period-selector"
          >
            <option value={7}>7 {lang === 'uk' ? 'днів' : 'days'}</option>
            <option value={30}>30 {lang === 'uk' ? 'днів' : 'days'}</option>
            <option value={90}>90 {lang === 'uk' ? 'днів' : 'days'}</option>
          </select>
          
          <button
            onClick={fetchData}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            disabled={loading}
            data-testid="refresh-btn"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {lang === 'uk' ? 'Оновити' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 text-red-300 rounded-xl p-4 mb-6">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      {funnelData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-sm">{lang === 'uk' ? 'Всього угод' : 'Total Deals'}</p>
                <p className="text-4xl font-bold mt-1">{funnelData.totalDeals}</p>
              </div>
              <Users className="w-12 h-12 text-blue-300/50" />
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-200 text-sm">{lang === 'uk' ? 'Доставлено' : 'Delivered'}</p>
                <p className="text-4xl font-bold mt-1">{funnelData.delivered}</p>
              </div>
              <Target className="w-12 h-12 text-green-300/50" />
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-200 text-sm">{lang === 'uk' ? 'Конверсія' : 'Conversion'}</p>
                <p className="text-4xl font-bold mt-1">{funnelData.conversionRate}%</p>
              </div>
              <TrendingUp className="w-12 h-12 text-purple-300/50" />
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-amber-600 to-amber-700 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-200 text-sm">{lang === 'uk' ? 'Період' : 'Period'}</p>
                <p className="text-4xl font-bold mt-1">{period}d</p>
              </div>
              <Clock className="w-12 h-12 text-amber-300/50" />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Funnel */}
        <div className="lg:col-span-2 bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
          <h2 className="text-xl font-semibold text-white mb-6">
            {lang === 'uk' ? 'Воронка продажів' : 'Sales Funnel'}
          </h2>
          
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
          ) : funnelData ? (
            <div className="space-y-3" data-testid="funnel-visualization">
              {STAGE_ORDER.map((stage, idx) => {
                const config = STAGE_CONFIG[stage];
                const value = funnelData.funnel[stage] || 0;
                const percentage = (value / maxFunnelValue) * 100;
                const dropOff = funnelData.dropOff?.find(d => d.from === stage);
                
                return (
                  <div key={stage} className="relative">
                    {/* Stage Row */}
                    <div className="flex items-center gap-4">
                      {/* Stage Label */}
                      <div className="w-36 flex-shrink-0">
                        <span className="text-slate-300 text-sm font-medium">
                          {lang === 'uk' ? config.label : config.labelEn}
                        </span>
                      </div>
                      
                      {/* Bar */}
                      <div className="flex-1 h-10 bg-slate-700/50 rounded-lg overflow-hidden relative">
                        <div
                          className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-3"
                          style={{ 
                            width: `${Math.max(percentage, 5)}%`,
                            backgroundColor: config.color,
                          }}
                        >
                          <span className="text-white font-bold text-sm">{value}</span>
                        </div>
                      </div>
                      
                      {/* Drop-off indicator */}
                      {dropOff && dropOff.rate > 0 && (
                        <div className="w-20 flex items-center gap-1 text-red-400 text-sm">
                          <TrendingDown className="w-4 h-4" />
                          <span>{dropOff.rate}%</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Arrow between stages */}
                    {idx < STAGE_ORDER.length - 1 && (
                      <div className="flex justify-center my-1">
                        <ArrowDown className="w-4 h-4 text-slate-600" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-slate-400 py-12">
              {lang === 'uk' ? 'Немає даних' : 'No data available'}
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="space-y-6">
          {/* Bottlenecks */}
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              {lang === 'uk' ? 'Вузькі місця' : 'Bottlenecks'}
            </h3>
            
            {bottlenecks.length > 0 ? (
              <div className="space-y-3" data-testid="bottlenecks-list">
                {bottlenecks.map((bottleneck, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-700/50 rounded-lg p-3 border-l-4 border-amber-500"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-300">
                          {lang === 'uk' 
                            ? STAGE_CONFIG[bottleneck.from]?.label || bottleneck.from 
                            : STAGE_CONFIG[bottleneck.from]?.labelEn || bottleneck.from}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                        <span className="text-slate-300">
                          {lang === 'uk' 
                            ? STAGE_CONFIG[bottleneck.to]?.label || bottleneck.to 
                            : STAGE_CONFIG[bottleneck.to]?.labelEn || bottleneck.to}
                        </span>
                      </div>
                      <span className="text-amber-400 font-bold">{bottleneck.rate}%</span>
                    </div>
                    <p className="text-slate-500 text-xs mt-1">
                      {bottleneck.count} {lang === 'uk' ? 'втрачено' : 'dropped'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">
                {lang === 'uk' ? 'Вузьких місць не виявлено' : 'No bottlenecks detected'}
              </p>
            )}
          </div>

          {/* Durations */}
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-400" />
              {lang === 'uk' ? 'Середні тривалості' : 'Average Durations'}
            </h3>
            
            {durations?.averages ? (
              <div className="space-y-3" data-testid="durations-list">
                {Object.entries(durations.averages)
                  .filter(([key]) => key !== 'totalJourneyDays')
                  .map(([key, value]) => {
                    const labels = {
                      daysToContact: { uk: 'До контакту', en: 'To Contact' },
                      daysToDeal: { uk: 'До угоди', en: 'To Deal' },
                      daysToContract: { uk: 'До контракту', en: 'To Contract' },
                      daysToPayment: { uk: 'До оплати', en: 'To Payment' },
                      daysToDelivery: { uk: 'До доставки', en: 'To Delivery' },
                    };
                    const label = labels[key]?.[lang === 'uk' ? 'uk' : 'en'] || key;
                    
                    return (
                      <div key={key} className="flex items-center justify-between py-2 border-b border-slate-700/50">
                        <span className="text-slate-400 text-sm">{label}</span>
                        <span className="text-white font-medium">
                          {value} {lang === 'uk' ? 'днів' : 'days'}
                        </span>
                      </div>
                    );
                  })}
                
                {/* Total */}
                <div className="flex items-center justify-between py-2 pt-3 border-t-2 border-blue-500/30">
                  <span className="text-blue-400 font-medium">
                    {lang === 'uk' ? 'Загальний шлях' : 'Total Journey'}
                  </span>
                  <span className="text-blue-400 font-bold text-lg">
                    {durations.averages.totalJourneyDays} {lang === 'uk' ? 'днів' : 'days'}
                  </span>
                </div>
                
                <p className="text-slate-500 text-xs mt-2">
                  {lang === 'uk' ? 'На основі' : 'Based on'} {durations.count} {lang === 'uk' ? 'завершених угод' : 'completed deals'}
                </p>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">
                {lang === 'uk' ? 'Недостатньо даних' : 'Not enough data'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JourneyPage;
