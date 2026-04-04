/**
 * VIN Search Page - Admin Panel
 * 
 * VIN Intelligence Engine з auto-optimization
 */

import React, { useState, useEffect } from 'react';
import { 
  MagnifyingGlass, 
  Car, 
  Tag, 
  Calendar, 
  MapPin, 
  SpinnerGap, 
  CheckCircle, 
  XCircle, 
  Images,
  Database,
  Globe,
  Lightning,
  Gauge,
  ArrowsClockwise,
  Sliders,
  Power,
  CaretRight,
  Clock,
  ChartBar,
  Heart,
  Warning,
  Pulse
} from '@phosphor-icons/react';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth, API_URL } from '../App';
import { useLang } from '../i18n';

// Health badge
const HealthBadge = ({ health }) => {
  const config = {
    excellent: { color: 'bg-green-100 text-green-700', icon: Heart },
    good: { color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
    fair: { color: 'bg-yellow-100 text-yellow-700', icon: Pulse },
    poor: { color: 'bg-orange-100 text-orange-700', icon: Warning },
    critical: { color: 'bg-red-100 text-red-700', icon: XCircle },
  };
  const cfg = config[health] || config.fair;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
      <Icon size={12} weight="fill" />
      {health.toUpperCase()}
    </span>
  );
};

// Source type badge
const SourceTypeBadge = ({ type }) => {
  const config = {
    database: { color: 'bg-blue-100 text-blue-700', label: 'База' },
    aggregator: { color: 'bg-green-100 text-green-700', label: 'Агрегатор' },
    competitor: { color: 'bg-yellow-100 text-yellow-700', label: 'Конкурент' },
    web_search: { color: 'bg-purple-100 text-purple-700', label: 'Web' },
  };
  const cfg = config[type] || { color: 'bg-gray-100 text-gray-600', label: type };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
};

// Status badge
const StatusBadge = ({ enabled, autoDisabled }) => {
  if (autoDisabled) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <Warning size={12} weight="bold" />
        AUTO-OFF
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
      enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      <Power size={12} weight="bold" />
      {enabled ? 'ON' : 'OFF'}
    </span>
  );
};

const VinSearch = () => {
  const { t } = useLang();
  const { user } = useAuth();
  const isMasterAdmin = ['master_admin', 'owner'].includes(user?.role);
  
  const [vin, setVin] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  
  // Sources state
  const [sources, setSources] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [showSources, setShowSources] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    setSourcesLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/admin/sources`);
      setSources(response.data.sources || []);
      setStats(response.data.stats || null);
    } catch (err) {
      console.error('Failed to fetch sources:', err);
    } finally {
      setSourcesLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    
    if (!vin || vin.length < 11) {
      setError(t('invalidVin'));
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await axios.get(`${API_URL}/api/vin/search?vin=${vin.toUpperCase()}`);
      setResult(response.data);
      // Refresh sources to see updated stats
      fetchSources();
    } catch (err) {
      setError(err.response?.data?.message || 'Помилка пошуку');
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = async (name, enabled) => {
    try {
      await axios.patch(`${API_URL}/api/admin/sources/${name}/toggle`, { enabled: !enabled });
      toast.success(`Джерело ${name} ${!enabled ? 'увімкнено' : 'вимкнено'}`);
      fetchSources();
    } catch (err) {
      toast.error('Помилка оновлення');
    }
  };

  const updateWeight = async (name, weight) => {
    try {
      await axios.patch(`${API_URL}/api/admin/sources/${name}/weight`, { weight });
      fetchSources();
    } catch (err) {
      toast.error('Помилка оновлення');
    }
  };

  const resetStats = async (name) => {
    try {
      await axios.post(`${API_URL}/api/admin/sources/${name}/reset-stats`);
      toast.success(`Статистика ${name} скинута`);
      fetchSources();
    } catch (err) {
      toast.error('Помилка скидання');
    }
  };

  const forceRecompute = async () => {
    setRecomputing(true);
    try {
      const response = await axios.post(`${API_URL}/api/admin/sources/recompute`);
      toast.success(`Оптимізація: ${response.data.updated} оновлено`);
      fetchSources();
    } catch (err) {
      toast.error('Помилка оптимізації');
    } finally {
      setRecomputing(false);
    }
  };

  const autoEnableSource = async (name) => {
    try {
      await axios.post(`${API_URL}/api/admin/sources/${name}/auto-enable`);
      toast.success(`Джерело ${name} примусово увімкнено`);
      fetchSources();
    } catch (err) {
      toast.error('Помилка увімкнення');
    }
  };

  const formatPrice = (price) => {
    if (!price) return 'Н/Д';
    return new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'USD' }).format(price);
  };

  const formatDate = (date) => {
    if (!date) return 'Н/Д';
    return new Date(date).toLocaleDateString('uk-UA');
  };

  // Calculate health from source data
  const getSourceHealth = (source) => {
    const total = source.totalSearches || 0;
    if (total < 5) return 'fair';
    const successRate = total > 0 ? (source.successCount || 0) / total : 0;
    const exactMatchRate = total > 0 ? (source.exactMatchCount || 0) / total : 0;
    
    if (successRate >= 0.8 && exactMatchRate >= 0.6) return 'excellent';
    if (successRate >= 0.6 && exactMatchRate >= 0.4) return 'good';
    if (successRate >= 0.4 && exactMatchRate >= 0.2) return 'fair';
    if (successRate >= 0.2) return 'poor';
    return 'critical';
  };

  return (
    <div data-testid="vin-search-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#18181B]" style={{ fontFamily: 'Cabinet Grotesk, sans-serif' }}>
            VIN Intelligence
          </h1>
          <p className="text-sm text-[#71717A] mt-1">
            Пошук інформації • Auto-Optimization
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isMasterAdmin && (
            <button
              onClick={forceRecompute}
              disabled={recomputing}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-[#18181B] text-white rounded-xl hover:bg-[#27272A] disabled:opacity-50 transition-all text-sm"
              data-testid="recompute-btn"
            >
              <Lightning size={16} className={recomputing ? 'animate-pulse' : ''} />
              <span className="hidden sm:inline">{recomputing ? 'Оптимізація...' : 'Оптимізувати'}</span>
            </button>
          )}
          <button
            onClick={() => setShowSources(!showSources)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-white border border-[#E4E4E7] rounded-xl text-[#18181B] hover:bg-[#F4F4F5] transition-all text-sm"
            data-testid="toggle-sources-btn"
          >
            <Sliders size={16} />
            <span className="hidden sm:inline">Джерела</span>
            <CaretRight size={14} className={`transition-transform ${showSources ? 'rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sources Panel */}
      {showSources && (
        <div className="mb-6 bg-white rounded-2xl border border-[#E4E4E7] p-6" data-testid="sources-panel">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#18181B] flex items-center gap-2">
              <Database size={20} />
              Джерела даних (Auto-Optimization)
            </h2>
            {stats && (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-[#71717A]">Всього: <b className="text-[#18181B]">{stats.total}</b></span>
                <span className="text-green-600">Активних: <b>{stats.enabled}</b></span>
                {stats.autoDisabled > 0 && (
                  <span className="text-red-600">Auto-OFF: <b>{stats.autoDisabled}</b></span>
                )}
              </div>
            )}
          </div>

          {sourcesLoading ? (
            <div className="flex items-center justify-center py-8">
              <SpinnerGap size={24} className="animate-spin text-[#71717A]" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#E4E4E7]">
                    <th className="text-left py-3 px-3 text-xs font-semibold text-[#71717A] uppercase tracking-wider">Джерело</th>
                    <th className="text-left py-3 px-3 text-xs font-semibold text-[#71717A] uppercase tracking-wider">Тип</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-[#71717A] uppercase tracking-wider">Health</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-[#71717A] uppercase tracking-wider">Статус</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-[#71717A] uppercase tracking-wider w-28">
                      <span className="flex items-center justify-center gap-1">
                        Manual
                        <span className="text-[10px] text-[#A1A1AA]">(адмін)</span>
                      </span>
                    </th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-[#71717A] uppercase tracking-wider">
                      <span className="flex items-center justify-center gap-1">
                        System
                        <span className="text-[10px] text-[#A1A1AA]">(авто)</span>
                      </span>
                    </th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-[#71717A] uppercase tracking-wider">Effective</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-[#71717A] uppercase tracking-wider">Searches</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-[#71717A] uppercase tracking-wider">Success</th>
                    <th className="text-center py-3 px-3 text-xs font-semibold text-[#71717A] uppercase tracking-wider">Exact</th>
                    {isMasterAdmin && (
                      <th className="text-right py-3 px-3 text-xs font-semibold text-[#71717A] uppercase tracking-wider">Дії</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sources.map((source) => {
                    const total = source.totalSearches || 0;
                    const successRate = total > 0 ? ((source.successCount || 0) / total * 100).toFixed(0) : '-';
                    const exactRate = total > 0 ? ((source.exactMatchCount || 0) / total * 100).toFixed(0) : '-';
                    const health = getSourceHealth(source);

                    return (
                      <tr key={source.name} className="border-b border-[#F4F4F5] hover:bg-[#FAFAFA] transition-colors" data-testid={`source-row-${source.name}`}>
                        <td className="py-3 px-3">
                          <div>
                            <p className="font-medium text-[#18181B]">{source.displayName || source.name}</p>
                            {source.autoDisabledReason && (
                              <p className="text-xs text-red-500 mt-0.5 max-w-[200px] truncate" title={source.autoDisabledReason}>
                                {source.autoDisabledReason}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <SourceTypeBadge type={source.type} />
                        </td>
                        <td className="py-3 px-3 text-center">
                          <HealthBadge health={health} />
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => source.autoDisabled 
                              ? autoEnableSource(source.name) 
                              : (isMasterAdmin && toggleSource(source.name, source.enabled))
                            }
                            disabled={!isMasterAdmin && !source.autoDisabled}
                            className="cursor-pointer disabled:cursor-default"
                            data-testid={`toggle-${source.name}`}
                          >
                            <StatusBadge enabled={source.enabled} autoDisabled={source.autoDisabled} />
                          </button>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {isMasterAdmin ? (
                            <div className="flex items-center justify-center gap-2">
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={Math.round((source.manualWeight || 0.7) * 100)}
                                onChange={(e) => updateWeight(source.name, e.target.value / 100)}
                                className="w-14 h-1 accent-[#18181B]"
                                data-testid={`weight-${source.name}`}
                              />
                              <span className="text-sm font-mono text-[#18181B] w-10">
                                {Math.round((source.manualWeight || 0.7) * 100)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm font-mono text-[#18181B]">
                              {Math.round((source.manualWeight || 0.7) * 100)}%
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`text-sm font-mono ${
                            (source.systemScore || 1) >= 0.8 ? 'text-green-600' :
                            (source.systemScore || 1) >= 0.5 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {Math.round((source.systemScore || 1) * 100)}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="text-sm font-bold text-[#18181B]">
                            {Math.round((source.effectiveWeight || 0.7) * 100)}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center text-sm text-[#71717A]">
                          {total}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`text-sm font-semibold ${
                            successRate === '-' ? 'text-[#71717A]' :
                            parseInt(successRate) >= 70 ? 'text-green-600' :
                            parseInt(successRate) >= 40 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {successRate}{successRate !== '-' && '%'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`text-sm font-semibold ${
                            exactRate === '-' ? 'text-[#71717A]' :
                            parseInt(exactRate) >= 50 ? 'text-green-600' :
                            parseInt(exactRate) >= 25 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {exactRate}{exactRate !== '-' && '%'}
                          </span>
                        </td>
                        {isMasterAdmin && (
                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => resetStats(source.name)}
                              className="p-1.5 text-[#71717A] hover:text-[#18181B] hover:bg-[#F4F4F5] rounded-lg transition-colors"
                              title="Скинути статистику"
                              data-testid={`reset-${source.name}`}
                            >
                              <ArrowsClockwise size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 pt-4 border-t border-[#E4E4E7] text-xs text-[#71717A]">
            <p><b>Manual</b> — вага, встановлена адміном | <b>System</b> — автоматично вирахувана система | <b>Effective</b> = Manual × System</p>
            <p className="mt-1">Система автоматично перераховує ваги кожні 15 хв на основі success rate, exact match rate, response time.</p>
          </div>
        </div>
      )}

      {/* Search Form */}
      <div className="bg-white rounded-2xl border border-[#E4E4E7] p-4 sm:p-6 mb-6">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlass size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#71717A]" />
            <input
              type="text"
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''))}
              placeholder="Введіть VIN код"
              className="w-full pl-12 pr-16 py-3 sm:py-3.5 bg-[#F4F4F5] border border-transparent rounded-xl text-[#18181B] text-base sm:text-lg font-mono tracking-wider placeholder:text-[#A1A1AA] focus:bg-white focus:border-[#18181B] focus:outline-none transition-all"
              maxLength={17}
              data-testid="vin-search-input"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A1A1AA] text-sm font-mono">
              {vin.length}/17
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || vin.length < 11}
            className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-3.5 bg-[#18181B] text-white font-semibold rounded-xl hover:bg-[#27272A] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            data-testid="vin-search-button"
          >
            {loading ? (
              <SpinnerGap size={20} className="animate-spin" />
            ) : (
              <MagnifyingGlass size={20} weight="bold" />
            )}
            {loading ? 'Пошук...' : 'Знайти'}
          </button>
        </form>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700" data-testid="search-error">
          <XCircle size={20} weight="fill" />
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden" data-testid="search-result">
          {/* Status Banner */}
          <div className={`px-6 py-4 flex items-center justify-between ${
            result.success ? 'bg-green-50 border-b border-green-200' : 'bg-yellow-50 border-b border-yellow-200'
          }`}>
            <div className="flex items-center gap-3">
              {result.success ? (
                <CheckCircle size={24} weight="fill" className="text-green-600" />
              ) : (
                <XCircle size={24} weight="fill" className="text-yellow-600" />
              )}
              <div>
                <p className={`font-semibold ${result.success ? 'text-green-700' : 'text-yellow-700'}`}>
                  {result.message}
                </p>
                <p className="text-sm text-[#71717A]">
                  Джерело: <span className="font-mono">{result.source}</span> • 
                  Час: {result.searchDurationMs}ms
                </p>
              </div>
            </div>
            <div className="px-3 py-1.5 bg-white/80 rounded-lg border border-[#E4E4E7]">
              <span className="font-mono text-sm text-[#18181B]">{result.vin}</span>
            </div>
          </div>

          {/* Vehicle Details */}
          {result.vehicle && (
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Image */}
                <div className="lg:col-span-1">
                  {result.vehicle.images?.length > 0 || result.vehicle.primaryImage ? (
                    <img
                      src={result.vehicle.primaryImage || result.vehicle.images[0]}
                      alt={result.vehicle.title}
                      className="w-full h-56 object-cover rounded-xl"
                    />
                  ) : (
                    <div className="w-full h-56 bg-[#F4F4F5] rounded-xl flex items-center justify-center">
                      <Car size={64} className="text-[#D4D4D8]" />
                    </div>
                  )}
                  
                  {result.vehicle.images?.length > 1 && (
                    <div className="mt-3 flex items-center gap-2 text-[#71717A] text-sm">
                      <Images size={16} />
                      {result.vehicle.images.length} фото
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="lg:col-span-2 space-y-4">
                  {/* Title & Price */}
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-xl font-bold text-[#18181B]">
                        {result.vehicle.title || `${result.vehicle.year || ''} ${result.vehicle.make || ''} ${result.vehicle.vehicleModel || result.vehicle.model || ''}`}
                      </h2>
                      <p className="text-[#71717A] font-mono text-sm mt-1">
                        VIN: {result.vehicle.vin}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-[#18181B]">
                        {formatPrice(result.vehicle.price)}
                      </p>
                      {result.vehicle.score && (
                        <p className="text-sm text-[#71717A] flex items-center gap-1 justify-end">
                          <Gauge size={14} />
                          Якість: {Math.round(result.vehicle.score * 100)}%
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Specs Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="p-3 bg-[#F4F4F5] rounded-xl">
                      <p className="text-[#71717A] text-xs uppercase tracking-wider mb-0.5">Рік</p>
                      <p className="text-[#18181B] font-semibold">{result.vehicle.year || 'Н/Д'}</p>
                    </div>
                    <div className="p-3 bg-[#F4F4F5] rounded-xl">
                      <p className="text-[#71717A] text-xs uppercase tracking-wider mb-0.5">Пробіг</p>
                      <p className="text-[#18181B] font-semibold">
                        {result.vehicle.mileage ? `${result.vehicle.mileage.toLocaleString()} mi` : 'Н/Д'}
                      </p>
                    </div>
                    <div className="p-3 bg-[#F4F4F5] rounded-xl">
                      <p className="text-[#71717A] text-xs uppercase tracking-wider mb-0.5">Пошкодження</p>
                      <p className="text-[#18181B] font-semibold capitalize">
                        {result.vehicle.damageType || 'Н/Д'}
                      </p>
                    </div>
                    <div className="p-3 bg-[#F4F4F5] rounded-xl flex items-start gap-2">
                      <Calendar size={16} className="text-[#71717A] mt-0.5" />
                      <div>
                        <p className="text-[#71717A] text-xs uppercase tracking-wider mb-0.5">Дата аукціону</p>
                        <p className="text-[#18181B] font-semibold">
                          {formatDate(result.vehicle.auctionDate || result.vehicle.saleDate)}
                        </p>
                      </div>
                    </div>
                    <div className="p-3 bg-[#F4F4F5] rounded-xl flex items-start gap-2">
                      <MapPin size={16} className="text-[#71717A] mt-0.5" />
                      <div>
                        <p className="text-[#71717A] text-xs uppercase tracking-wider mb-0.5">Локація</p>
                        <p className="text-[#18181B] font-semibold">
                          {result.vehicle.auctionLocation || result.vehicle.location || 'Н/Д'}
                        </p>
                      </div>
                    </div>
                    <div className="p-3 bg-[#F4F4F5] rounded-xl flex items-start gap-2">
                      <Tag size={16} className="text-[#71717A] mt-0.5" />
                      <div>
                        <p className="text-[#71717A] text-xs uppercase tracking-wider mb-0.5">Lot #</p>
                        <p className="text-[#18181B] font-semibold font-mono">
                          {result.vehicle.lotNumber || 'Н/Д'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Source URL */}
                  {result.vehicle.sourceUrl && (
                    <a
                      href={result.vehicle.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#18181B] hover:underline text-sm font-medium"
                    >
                      <Globe size={14} />
                      Переглянути на джерелі →
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Not Found State */}
          {!result.success && !result.vehicle && (
            <div className="p-12 text-center">
              <Car size={64} className="mx-auto text-[#D4D4D8] mb-4" />
              <h3 className="text-xl text-[#18181B] font-semibold mb-2">
                Інформацію не знайдено
              </h3>
              <p className="text-[#71717A] max-w-md mx-auto">
                Система перевірила {sources.filter(s => s.enabled && !s.autoDisabled).length} джерел, але не знайшла інформацію про цей VIN.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Info Cards */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white border border-[#E4E4E7] rounded-xl">
          <div className="flex items-center gap-3 mb-2">
            <Database size={24} weight="duotone" className="text-blue-600" />
            <h3 className="font-semibold text-[#18181B]">Multi-Source</h3>
          </div>
          <p className="text-[#71717A] text-sm">
            Пошук через {sources.filter(s => s.enabled && !s.autoDisabled).length} активних джерел
          </p>
        </div>
        <div className="p-4 bg-white border border-[#E4E4E7] rounded-xl">
          <div className="flex items-center gap-3 mb-2">
            <Lightning size={24} weight="duotone" className="text-purple-600" />
            <h3 className="font-semibold text-[#18181B]">Auto-Optimization</h3>
          </div>
          <p className="text-[#71717A] text-sm">
            Автоматичне ранжування джерел за продуктивністю
          </p>
        </div>
        <div className="p-4 bg-white border border-[#E4E4E7] rounded-xl">
          <div className="flex items-center gap-3 mb-2">
            <Heart size={24} weight="duotone" className="text-green-600" />
            <h3 className="font-semibold text-[#18181B]">Self-Healing</h3>
          </div>
          <p className="text-[#71717A] text-sm">
            Автоматичне вимкнення слабких джерел
          </p>
        </div>
      </div>
    </div>
  );
};

export default VinSearch;
