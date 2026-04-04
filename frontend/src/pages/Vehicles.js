/**
 * Vehicles Page
 * 
 * Перегляд авто з парсера для менеджерів
 * Функціонал: пошук, фільтри, перегляд карток, створення лідів
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { API_URL, useAuth } from '../App';
import { motion, AnimatePresence } from 'framer-motion';
import { useLang } from '../i18n';
import CustomSelect from '../components/ui/CustomSelect';
import {
  MagnifyingGlass,
  Funnel,
  Car,
  CaretLeft,
  CaretRight,
  X,
  User,
  Phone,
  EnvelopeSimple,
  Note,
  CircleNotch,
  CheckCircle,
  Tag,
  Gauge,
  Calendar,
  MapPin,
  CurrencyDollar,
  Images,
  Link as LinkIcon,
  Warning,
  Plus,
  ArrowSquareOut,
} from '@phosphor-icons/react';

// Статистика компонент
const VehicleStats = ({ stats, t }) => {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white rounded-xl border border-[#E4E4E7] p-4">
        <p className="text-3xl font-bold text-[#18181B]">{stats.total || 0}</p>
        <p className="text-sm text-[#71717A]">{t('totalVehicles')}</p>
      </div>
      <div className="bg-white rounded-xl border border-[#E4E4E7] p-4">
        <p className="text-3xl font-bold text-blue-600">{stats.bySource?.copart || 0}</p>
        <p className="text-sm text-[#71717A]">Copart</p>
      </div>
      <div className="bg-white rounded-xl border border-[#E4E4E7] p-4">
        <p className="text-3xl font-bold text-orange-600">{stats.bySource?.iaai || 0}</p>
        <p className="text-sm text-[#71717A]">IAAI</p>
      </div>
      <div className="bg-white rounded-xl border border-[#E4E4E7] p-4">
        <p className="text-3xl font-bold text-green-600">${Math.round(stats.priceRange?.avgPrice || 0).toLocaleString()}</p>
        <p className="text-sm text-[#71717A]">{t('avgPrice')}</p>
      </div>
    </div>
  );
};

// Картка авто
const VehicleCard = ({ vehicle, onClick, t }) => {
  const statusColors = {
    active: 'bg-green-100 text-green-700',
    reserved: 'bg-yellow-100 text-yellow-700',
    sold: 'bg-gray-100 text-gray-600',
    archived: 'bg-red-100 text-red-600',
  };

  const sourceColors = {
    copart: 'bg-blue-100 text-blue-700',
    iaai: 'bg-orange-100 text-orange-700',
  };

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-white rounded-2xl border border-[#E4E4E7] overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
      onClick={() => onClick(vehicle)}
      data-testid={`vehicle-card-${vehicle.id}`}
    >
      {/* Image */}
      <div className="relative h-48 bg-[#F4F4F5]">
        {vehicle.primaryImage || vehicle.images?.[0] ? (
          <img
            src={vehicle.primaryImage || vehicle.images[0]}
            alt={vehicle.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = 'https://via.placeholder.com/400x300?text=No+Image';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Car size={48} className="text-[#D4D4D8]" />
          </div>
        )}
        
        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-2">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${sourceColors[vehicle.source] || 'bg-gray-100 text-gray-700'}`}>
            {vehicle.source?.toUpperCase()}
          </span>
          {vehicle.status === 'reserved' && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
              {t('reserved')}
            </span>
          )}
        </div>

        {/* Price */}
        {vehicle.price && (
          <div className="absolute bottom-3 right-3 px-3 py-1.5 bg-[#18181B] text-white rounded-lg font-bold">
            ${vehicle.price.toLocaleString()}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-[#18181B] mb-1 line-clamp-1">{vehicle.title}</h3>
        <p className="text-sm text-[#71717A] mb-3 font-mono">{vehicle.vin}</p>

        <div className="flex flex-wrap gap-2 text-xs text-[#71717A]">
          {vehicle.year && (
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {vehicle.year}
            </span>
          )}
          {vehicle.mileage && (
            <span className="flex items-center gap-1">
              <Gauge size={12} />
              {vehicle.mileage.toLocaleString()} {vehicle.mileageUnit || 'mi'}
            </span>
          )}
          {vehicle.damageType && (
            <span className="flex items-center gap-1 text-red-500">
              <Warning size={12} />
              {vehicle.damageType}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// Модальне вікно деталей авто
const VehicleModal = ({ vehicle, onClose, onCreateLead }) => {
  const [creating, setCreating] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadData, setLeadData] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    notes: '',
  });
  const [activeImage, setActiveImage] = useState(0);

  const images = vehicle.images?.length > 0 ? vehicle.images : [vehicle.primaryImage].filter(Boolean);

  const handleCreateLead = async () => {
    setCreating(true);
    try {
      const result = await onCreateLead(vehicle.id, leadData);
      if (result.success) {
        toast.success('Лід успішно створено!');
        onClose();
      } else {
        toast.error(result.message || 'Помилка створення');
      }
    } catch (err) {
      toast.error('Помилка створення ліда');
    } finally {
      setCreating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#E4E4E7] p-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-[#18181B]">{vehicle.title}</h2>
            <p className="text-sm text-[#71717A] font-mono">{vehicle.vin}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#F4F4F5] rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left - Images */}
            <div>
              {images.length > 0 ? (
                <>
                  <div className="relative h-72 bg-[#F4F4F5] rounded-xl overflow-hidden mb-3">
                    <img
                      src={images[activeImage]}
                      alt={vehicle.title}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'https://via.placeholder.com/600x400?text=Error';
                      }}
                    />
                    {images.length > 1 && (
                      <>
                        <button
                          onClick={() => setActiveImage((prev) => (prev > 0 ? prev - 1 : images.length - 1))}
                          className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center hover:bg-white"
                        >
                          <CaretLeft size={16} />
                        </button>
                        <button
                          onClick={() => setActiveImage((prev) => (prev < images.length - 1 ? prev + 1 : 0))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center hover:bg-white"
                        >
                          <CaretRight size={16} />
                        </button>
                      </>
                    )}
                  </div>
                  {images.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {images.slice(0, 6).map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveImage(idx)}
                          className={`w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 ${activeImage === idx ? 'border-[#18181B]' : 'border-transparent'}`}
                        >
                          <img src={img} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                      {images.length > 6 && (
                        <div className="w-16 h-16 rounded-lg bg-[#F4F4F5] flex items-center justify-center text-sm text-[#71717A]">
                          +{images.length - 6}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="h-72 bg-[#F4F4F5] rounded-xl flex items-center justify-center">
                  <Car size={64} className="text-[#D4D4D8]" />
                </div>
              )}
            </div>

            {/* Right - Info */}
            <div>
              {/* Price */}
              <div className="mb-6">
                <p className="text-sm text-[#71717A] mb-1">Ціна</p>
                <p className="text-3xl font-bold text-[#18181B]">
                  ${vehicle.price?.toLocaleString() || 'N/A'}
                  <span className="text-sm font-normal text-[#71717A] ml-2">{vehicle.currency || 'USD'}</span>
                </p>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {vehicle.year && (
                  <div>
                    <p className="text-xs text-[#71717A]">Рік</p>
                    <p className="font-medium">{vehicle.year}</p>
                  </div>
                )}
                {vehicle.make && (
                  <div>
                    <p className="text-xs text-[#71717A]">Марка</p>
                    <p className="font-medium">{vehicle.make}</p>
                  </div>
                )}
                {vehicle.vehicleModel && (
                  <div>
                    <p className="text-xs text-[#71717A]">Модель</p>
                    <p className="font-medium">{vehicle.vehicleModel}</p>
                  </div>
                )}
                {vehicle.mileage && (
                  <div>
                    <p className="text-xs text-[#71717A]">Пробіг</p>
                    <p className="font-medium">{vehicle.mileage.toLocaleString()} {vehicle.mileageUnit || 'mi'}</p>
                  </div>
                )}
                {vehicle.color && (
                  <div>
                    <p className="text-xs text-[#71717A]">Колір</p>
                    <p className="font-medium">{vehicle.color}</p>
                  </div>
                )}
                {vehicle.engineType && (
                  <div>
                    <p className="text-xs text-[#71717A]">Двигун</p>
                    <p className="font-medium">{vehicle.engineType}</p>
                  </div>
                )}
                {vehicle.transmission && (
                  <div>
                    <p className="text-xs text-[#71717A]">Коробка</p>
                    <p className="font-medium">{vehicle.transmission}</p>
                  </div>
                )}
                {vehicle.damageType && (
                  <div>
                    <p className="text-xs text-[#71717A]">Пошкодження</p>
                    <p className="font-medium text-red-600">{vehicle.damageType}</p>
                  </div>
                )}
              </div>

              {/* Source Info */}
              <div className="bg-[#F4F4F5] rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[#71717A]">Джерело</span>
                  <span className="font-medium uppercase">{vehicle.source}</span>
                </div>
                {vehicle.lotNumber && (
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-[#71717A]">Lot #</span>
                    <span className="font-mono">{vehicle.lotNumber}</span>
                  </div>
                )}
                {vehicle.auctionLocation && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#71717A]">Локація</span>
                    <span>{vehicle.auctionLocation}</span>
                  </div>
                )}
                {vehicle.sourceUrl && (
                  <a
                    href={vehicle.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 mt-3 text-sm text-blue-600 hover:underline"
                  >
                    <ArrowSquareOut size={14} />
                    Відкрити на сайті
                  </a>
                )}
              </div>

              {/* Status */}
              {vehicle.status === 'reserved' ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 text-yellow-700">
                    <Warning size={18} />
                    <span className="font-medium">Авто зарезервовано</span>
                  </div>
                  {vehicle.linkedLead && (
                    <p className="text-sm text-yellow-600 mt-1">
                      Лід: {vehicle.linkedLead.firstName} {vehicle.linkedLead.lastName}
                    </p>
                  )}
                </div>
              ) : showLeadForm ? (
                /* Lead Form */
                <div className="border border-[#E4E4E7] rounded-xl p-4">
                  <h4 className="font-semibold mb-4">Створити лід</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Ім'я клієнта</label>
                      <div className="relative">
                        <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                        <input
                          type="text"
                          value={leadData.customerName}
                          onChange={(e) => setLeadData({ ...leadData, customerName: e.target.value })}
                          placeholder="Ім'я"
                          className="w-full pl-10 pr-4 py-2.5 bg-[#F4F4F5] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#18181B]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Телефон</label>
                      <div className="relative">
                        <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                        <input
                          type="tel"
                          value={leadData.customerPhone}
                          onChange={(e) => setLeadData({ ...leadData, customerPhone: e.target.value })}
                          placeholder="+380..."
                          className="w-full pl-10 pr-4 py-2.5 bg-[#F4F4F5] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#18181B]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Email</label>
                      <div className="relative">
                        <EnvelopeSimple size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
                        <input
                          type="email"
                          value={leadData.customerEmail}
                          onChange={(e) => setLeadData({ ...leadData, customerEmail: e.target.value })}
                          placeholder="email@example.com"
                          className="w-full pl-10 pr-4 py-2.5 bg-[#F4F4F5] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#18181B]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Нотатки</label>
                      <textarea
                        value={leadData.notes}
                        onChange={(e) => setLeadData({ ...leadData, notes: e.target.value })}
                        placeholder="Додаткова інформація..."
                        rows={2}
                        className="w-full px-4 py-2.5 bg-[#F4F4F5] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#18181B] resize-none"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setShowLeadForm(false)}
                      className="flex-1 px-4 py-2.5 border border-[#E4E4E7] rounded-xl hover:bg-[#F4F4F5]"
                    >
                      Скасувати
                    </button>
                    <button
                      onClick={handleCreateLead}
                      disabled={creating}
                      className="flex-1 px-4 py-2.5 bg-[#18181B] text-white rounded-xl hover:bg-[#27272A] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {creating ? <CircleNotch size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                      Створити
                    </button>
                  </div>
                </div>
              ) : (
                /* CTA Button */
                <button
                  onClick={() => setShowLeadForm(true)}
                  className="w-full py-3 bg-[#18181B] text-white rounded-xl hover:bg-[#27272A] font-medium flex items-center justify-center gap-2"
                  data-testid="create-lead-btn"
                >
                  <Plus size={18} />
                  Створити лід
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// Main Component
const Vehicles = () => {
  const { t } = useLang();
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [stats, setStats] = useState(null);
  const [makes, setMakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({
    search: '',
    source: '',
    make: '',
    minPrice: '',
    maxPrice: '',
    status: 'active',
  });
  const [showFilters, setShowFilters] = useState(false);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (filters.search) params.append('search', filters.search);
      if (filters.source) params.append('source', filters.source);
      if (filters.make) params.append('make', filters.make);
      if (filters.minPrice) params.append('minPrice', filters.minPrice);
      if (filters.maxPrice) params.append('maxPrice', filters.maxPrice);
      if (filters.status) params.append('status', filters.status);

      const res = await axios.get(`${API_URL}/api/vehicles?${params}`);
      setVehicles(res.data.items || []);
      setPagination(prev => ({
        ...prev,
        total: res.data.pagination?.total || 0,
        totalPages: res.data.pagination?.totalPages || 0,
      }));
    } catch (err) {
      console.error('Error fetching vehicles:', err);
      toast.error(t('error'));
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters, t]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/vehicles/stats`);
      setStats(res.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, []);

  const fetchMakes = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/vehicles/makes`);
      setMakes(res.data || []);
    } catch (err) {
      console.error('Error fetching makes:', err);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  useEffect(() => {
    fetchStats();
    fetchMakes();
  }, [fetchStats, fetchMakes]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchVehicles();
  };

  const handleCreateLead = async (vehicleId, leadData) => {
    const res = await axios.post(`${API_URL}/api/vehicles/${vehicleId}/create-lead`, leadData);
    fetchVehicles();
    return res.data;
  };

  const handleVehicleClick = async (vehicle) => {
    try {
      const res = await axios.get(`${API_URL}/api/vehicles/${vehicle.id}`);
      setSelectedVehicle(res.data);
    } catch (err) {
      toast.error('Помилка завантаження деталей');
    }
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      source: '',
      make: '',
      minPrice: '',
      maxPrice: '',
      status: 'active',
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  return (
    <div data-testid="vehicles-page">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#18181B]">База авто</h1>
          <p className="text-[#71717A]">Авто з Copart та IAAI для продажу</p>
        </div>
        
        {/* Search & Filters */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Пошук по VIN, марці..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E4E4E7] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#18181B]"
              data-testid="vehicle-search"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2.5 border rounded-xl flex items-center justify-center gap-2 transition-colors ${showFilters ? 'bg-[#18181B] text-white border-[#18181B]' : 'border-[#E4E4E7] hover:bg-[#F4F4F5]'}`}
          >
            <Funnel size={16} />
            <span className="sm:inline">Фільтри</span>
          </button>
        </form>
      </div>

      {/* Stats */}
      <VehicleStats stats={stats} t={t} />

      {/* Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-xl border border-[#E4E4E7] p-4 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <CustomSelect
                  label="Джерело"
                  value={filters.source}
                  onChange={(val) => {
                    setFilters({ ...filters, source: val });
                    setPagination(prev => ({ ...prev, page: 1 }));
                  }}
                  options={[
                    { value: '', label: 'Всі' },
                    { value: 'copart', label: 'Copart' },
                    { value: 'iaai', label: 'IAAI' },
                  ]}
                  placeholder="Всі"
                  testId="filter-source"
                />
                <CustomSelect
                  label="Марка"
                  value={filters.make}
                  onChange={(val) => {
                    setFilters({ ...filters, make: val });
                    setPagination(prev => ({ ...prev, page: 1 }));
                  }}
                  options={[
                    { value: '', label: 'Всі марки' },
                    ...makes.map(m => ({ value: m.make, label: `${m.make} (${m.count})` }))
                  ]}
                  placeholder="Всі марки"
                  testId="filter-make"
                />
                <div>
                  <label className="block text-xs font-medium text-[#71717A] mb-1">Мін. ціна</label>
                  <input
                    type="number"
                    value={filters.minPrice}
                    onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })}
                    placeholder="$0"
                    className="w-full px-3 py-2 bg-white border border-[#E4E4E7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#18181B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#71717A] mb-1">Макс. ціна</label>
                  <input
                    type="number"
                    value={filters.maxPrice}
                    onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
                    placeholder="$100,000"
                    className="w-full px-3 py-2 bg-white border border-[#E4E4E7] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#18181B]"
                  />
                </div>
                <CustomSelect
                  label="Статус"
                  value={filters.status}
                  onChange={(val) => {
                    setFilters({ ...filters, status: val });
                    setPagination(prev => ({ ...prev, page: 1 }));
                  }}
                  options={[
                    { value: '', label: 'Всі' },
                    { value: 'active', label: 'Активні' },
                    { value: 'reserved', label: 'Зарезервовані' },
                    { value: 'sold', label: 'Продані' },
                  ]}
                  placeholder="Всі"
                  testId="filter-status"
                  dropUp={true}
                />
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={clearFilters}
                  className="text-sm text-[#71717A] hover:text-[#18181B]"
                >
                  Скинути фільтри
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vehicles Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <CircleNotch size={32} className="animate-spin text-[#18181B]" />
        </div>
      ) : vehicles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E4E4E7] p-12 text-center">
          <Car size={64} className="mx-auto mb-4 text-[#D4D4D8]" />
          <h3 className="text-lg font-semibold text-[#18181B] mb-2">Авто не знайдено</h3>
          <p className="text-[#71717A]">Спробуйте змінити фільтри або запустіть парсер</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
          {vehicles.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} onClick={handleVehicleClick} t={t} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-xl border border-[#E4E4E7] p-4">
          <p className="text-sm text-[#71717A]">
            Показано {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} з {pagination.total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page <= 1}
              className="p-2 border border-[#E4E4E7] rounded-lg hover:bg-[#F4F4F5] disabled:opacity-50"
            >
              <CaretLeft size={16} />
            </button>
            <span className="px-4 py-2 text-sm font-medium">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page >= pagination.totalPages}
              className="p-2 border border-[#E4E4E7] rounded-lg hover:bg-[#F4F4F5] disabled:opacity-50"
            >
              <CaretRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Vehicle Detail Modal */}
      <AnimatePresence>
        {selectedVehicle && (
          <VehicleModal
            vehicle={selectedVehicle}
            onClose={() => setSelectedVehicle(null)}
            onCreateLead={handleCreateLead}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Vehicles;
