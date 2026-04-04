/**
 * Vehicle Detail Page
 * 
 * Детальна сторінка авто
 */

import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useLang } from '../../i18n';
import { 
  ArrowLeft, 
  Calendar, 
  MapPin, 
  Gauge, 
  CurrencyDollar,
  Images,
  Phone,
  CheckCircle,
  Warning,
  Fire,
  Share,
  Heart,
  Calculator
} from '@phosphor-icons/react';
import AuctionTimer from '../../components/public/AuctionTimer';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const VehicleDetailPage = () => {
  const { t } = useLang();
  const { id, slug } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);

  // SEO - Update title and meta when vehicle loads
  useEffect(() => {
    if (vehicle) {
      const title = vehicle.title || `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim();
      document.title = `${title} - Купити з США | BIBI Cars`;
      
      const meta = document.querySelector("meta[name='description']");
      if (meta) {
        meta.setAttribute('content', 
          `Купити ${title} з аукціону США. VIN: ${vehicle.vin}. Ціна: $${(vehicle.price || 0).toLocaleString()}. Повний розрахунок доставки.`
        );
      }
    }
  }, [vehicle]);

  useEffect(() => {
    fetchVehicle();
  }, [id, slug]);

  const fetchVehicle = async () => {
    try {
      const lookupId = slug || id;
      
      // Try public vehicles API first
      try {
        const res = await axios.get(`${API_URL}/api/public/vehicles/${lookupId}`);
        if (res.data) {
          setVehicle(res.data);
          setLoading(false);
          return;
        }
      } catch (pubErr) {
        console.log('Public vehicles lookup failed, trying publishing...');
      }

      // Try publishing API
      try {
        const res = await axios.get(`${API_URL}/api/publishing/public/listings/${lookupId}`);
        if (res.data) {
          setVehicle(res.data);
          setLoading(false);
          return;
        }
      } catch (pubErr) {
        console.log('Publishing lookup failed, trying auction-ranking...');
      }
      
      // Fallback to auction-ranking
      const res = await axios.get(`${API_URL}/api/auction-ranking/vehicle/${lookupId}`);
      if (res.data && res.data.length > 0) {
        setVehicle(res.data[0]);
      }
    } catch (err) {
      console.error('Error fetching vehicle:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <Warning size={48} className="mx-auto text-amber-500 mb-4" />
          <h2 className="text-xl font-semibold text-zinc-900 mb-2">
            Авто не знайдено
          </h2>
          <Link
            to="/vehicles"
            className="text-blue-600 hover:underline"
          >
            Повернутись до каталогу
          </Link>
        </div>
      </div>
    );
  }

  const displayTitle = vehicle.title || 
    `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 
    'Автомобіль';

  return (
    <div className="min-h-screen bg-zinc-50" data-testid="vehicle-detail-page">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-zinc-200">
        <div className="container mx-auto px-4 py-4">
          <Link 
            to="/vehicles" 
            className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors text-sm"
          >
            <ArrowLeft size={16} />
            Назад до каталогу
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Images */}
            <div className="bg-white rounded-xl overflow-hidden border border-zinc-200">
              <div className="aspect-video relative bg-zinc-100">
                {vehicle.images?.length > 0 ? (
                  <img
                    src={vehicle.images[selectedImage]}
                    alt={displayTitle}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.src = '/images/car-placeholder.jpg'; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-400">
                    <Images size={64} />
                  </div>
                )}

                {/* Badges */}
                <div className="absolute top-4 left-4 flex gap-2">
                  {vehicle.rankingScore >= 0.65 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
                      <Fire size={14} weight="fill" />
                      HOT
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="absolute top-4 right-4 flex gap-2">
                  <button className="bg-white/90 p-2 rounded-full hover:bg-white transition-colors">
                    <Heart size={20} className="text-zinc-600" />
                  </button>
                  <button className="bg-white/90 p-2 rounded-full hover:bg-white transition-colors">
                    <Share size={20} className="text-zinc-600" />
                  </button>
                </div>
              </div>

              {/* Thumbnails */}
              {vehicle.images?.length > 1 && (
                <div className="p-4 flex gap-2 overflow-x-auto">
                  {vehicle.images.slice(0, 10).map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedImage(i)}
                      className={`flex-shrink-0 w-24 h-18 rounded-lg overflow-hidden border-2 transition-colors ${
                        selectedImage === i ? 'border-zinc-900' : 'border-transparent hover:border-zinc-300'
                      }`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Vehicle Info */}
            <div className="bg-white rounded-xl border border-zinc-200 p-6">
              <h1 className="text-2xl lg:text-3xl font-bold text-zinc-900 mb-2">
                {displayTitle}
              </h1>
              
              <p className="text-sm text-zinc-400 font-mono mb-6">
                VIN: {vehicle.vin}
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {vehicle.year && (
                  <div className="p-4 bg-zinc-50 rounded-lg">
                    <div className="flex items-center gap-2 text-zinc-400 mb-1">
                      <Calendar size={16} />
                      <span className="text-xs">Рік</span>
                    </div>
                    <p className="font-semibold text-zinc-900">{vehicle.year}</p>
                  </div>
                )}
                {vehicle.mileage && (
                  <div className="p-4 bg-zinc-50 rounded-lg">
                    <div className="flex items-center gap-2 text-zinc-400 mb-1">
                      <Gauge size={16} />
                      <span className="text-xs">Пробіг</span>
                    </div>
                    <p className="font-semibold text-zinc-900">{vehicle.mileage.toLocaleString()} mi</p>
                  </div>
                )}
                {vehicle.location && (
                  <div className="p-4 bg-zinc-50 rounded-lg">
                    <div className="flex items-center gap-2 text-zinc-400 mb-1">
                      <MapPin size={16} />
                      <span className="text-xs">Локація</span>
                    </div>
                    <p className="font-semibold text-zinc-900">{vehicle.location}</p>
                  </div>
                )}
                {vehicle.lotNumber && (
                  <div className="p-4 bg-zinc-50 rounded-lg">
                    <div className="flex items-center gap-2 text-zinc-400 mb-1">
                      <span className="text-xs">#</span>
                      <span className="text-xs">Лот</span>
                    </div>
                    <p className="font-semibold text-zinc-900">{vehicle.lotNumber}</p>
                  </div>
                )}
              </div>

              {vehicle.damageType && (
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-amber-800 font-medium">
                    <Warning size={18} className="inline mr-2" />
                    Тип пошкодження: {vehicle.damageType}
                  </p>
                </div>
              )}
            </div>

            {/* Source Info */}
            {vehicle.source && (
              <div className="bg-white rounded-xl border border-zinc-200 p-6">
                <h3 className="font-semibold text-zinc-900 mb-4">Джерело</h3>
                <div className="flex items-center gap-2">
                  <CheckCircle size={18} className="text-green-500" />
                  <span className="text-zinc-600">{vehicle.source}</span>
                </div>
              </div>
            )}

            {/* AI Description */}
            {vehicle.aiDescription && (
              <div className="bg-white rounded-xl border border-zinc-200 p-6">
                <h3 className="font-semibold text-zinc-900 mb-4">Про автомобіль</h3>
                <p className="text-zinc-600 leading-relaxed whitespace-pre-line">
                  {vehicle.aiDescription}
                </p>
              </div>
            )}

            {/* AI FAQ */}
            {vehicle.aiFaq && vehicle.aiFaq.length > 0 && (
              <div className="bg-white rounded-xl border border-zinc-200 p-6">
                <h3 className="font-semibold text-zinc-900 mb-4">Часті питання</h3>
                <div className="space-y-3">
                  {vehicle.aiFaq.map((faq, idx) => (
                    <div key={idx} className="p-3 bg-zinc-50 rounded-lg">
                      <p className="text-zinc-700">{faq}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Price Card */}
            <div className="bg-white rounded-xl border border-zinc-200 p-6 sticky top-24">
              {vehicle.price && (
                <div className="text-center mb-6">
                  <p className="text-sm text-zinc-500">Ціна на аукціоні</p>
                  <p className="text-4xl font-bold text-zinc-900">
                    ${vehicle.price.toLocaleString()}
                  </p>
                </div>
              )}

              {vehicle.auctionDate && new Date(vehicle.auctionDate) > new Date() && (
                <div className="text-center pb-6 border-b border-zinc-100">
                  <p className="text-sm text-zinc-500 mb-2">До аукціону залишилось</p>
                  <AuctionTimer date={vehicle.auctionDate} />
                </div>
              )}

              <button
                onClick={() => setShowLeadForm(true)}
                className="w-full mt-6 bg-zinc-900 text-white py-4 rounded-lg font-semibold hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                data-testid="buy-btn"
              >
                <Phone size={20} />
                Хочу купити
              </button>

              <button
                onClick={() => setShowCalculator(true)}
                className="w-full mt-3 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                data-testid="calculate-btn"
              >
                <Calculator size={20} />
                Розрахувати вартість
              </button>

              <Link
                to={`/vin-check/${vehicle.vin}`}
                className="w-full mt-3 border border-zinc-200 text-zinc-700 py-3 rounded-lg font-semibold hover:bg-zinc-50 transition-colors flex items-center justify-center gap-2"
              >
                Перевірити VIN
              </Link>

              <p className="text-center text-xs text-zinc-400 mt-4">
                Ми зв'яжемось з вами протягом 15 хвилин
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Lead Form Modal */}
      {showLeadForm && (
        <LeadFormModal 
          vehicle={vehicle} 
          onClose={() => setShowLeadForm(false)} 
        />
      )}

      {/* Calculator Modal */}
      {showCalculator && (
        <CalculatorModal 
          vehicle={vehicle} 
          onClose={() => setShowCalculator(false)}
          onBuy={() => {
            setShowCalculator(false);
            setShowLeadForm(true);
          }}
        />
      )}
    </div>
  );
};

// Lead Form Modal Component
const LeadFormModal = ({ vehicle, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
      
      // Get UTM params from URL
      const urlParams = new URLSearchParams(window.location.search);
      const utm = {
        source: urlParams.get('utm_source') || 'direct',
        campaign: urlParams.get('utm_campaign') || 'none',
        medium: urlParams.get('utm_medium') || 'organic'
      };

      const leadData = {
        firstName: formData.name.split(' ')[0] || formData.name,
        lastName: formData.name.split(' ').slice(1).join(' ') || '',
        phone: formData.phone,
        email: formData.email || undefined,
        vin: vehicle.vin,
        source: 'website',
        price: vehicle.price,
        vehicleTitle: vehicle.title || `${vehicle.make} ${vehicle.model}`,
        comment: `Авто: ${vehicle.title || vehicle.make + ' ' + vehicle.model}
VIN: ${vehicle.vin}
Ціна: $${vehicle.price?.toLocaleString()}
UTM: ${utm.source}/${utm.campaign}
Повідомлення: ${formData.message || 'Немає'}`
      };

      // Use /api/public/leads/quick endpoint
      await axios.post(`${API_URL}/api/public/leads/quick`, leadData);
      setSuccess(true);
      
      // Track analytics event
      if (window.trackEvent) {
        window.trackEvent('lead_created', {
          vin: vehicle.vin,
          price: vehicle.price,
          source: utm.source,
          campaign: utm.campaign
        });
      }
    } catch (err) {
      console.error('Error creating lead:', err);
      setError('Виникла помилка. Спробуйте ще раз або зателефонуйте нам.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
          <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
          <h3 className="text-2xl font-bold text-zinc-900 mb-2">Дякуємо!</h3>
          <p className="text-zinc-600 mb-6">
            Ваша заявка прийнята. Наш менеджер зв'яжеться з вами протягом 15 хвилин.
          </p>
          <button
            onClick={onClose}
            className="w-full bg-zinc-900 text-white py-3 rounded-lg font-semibold hover:bg-zinc-800"
          >
            Закрити
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-zinc-900 mb-2">Залишити заявку</h3>
        <p className="text-zinc-500 text-sm mb-6">
          {vehicle.title || `${vehicle.make} ${vehicle.model}`} - ${vehicle.price?.toLocaleString()}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Ім'я *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
              placeholder="Ваше ім'я"
              data-testid="lead-name-input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Телефон *</label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={e => setFormData({...formData, phone: e.target.value})}
              className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
              placeholder="+380 XX XXX XX XX"
              data-testid="lead-phone-input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
              className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
              placeholder="email@example.com"
              data-testid="lead-email-input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Повідомлення</label>
            <textarea
              value={formData.message}
              onChange={e => setFormData({...formData, message: e.target.value})}
              className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent resize-none"
              rows={3}
              placeholder="Ваше повідомлення..."
              data-testid="lead-message-input"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-zinc-900 text-white py-4 rounded-lg font-semibold hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            data-testid="lead-submit-btn"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Відправка...
              </>
            ) : (
              <>
                <Phone size={20} />
                Відправити заявку
              </>
            )}
          </button>
        </form>

        <button
          onClick={onClose}
          className="w-full mt-3 text-zinc-500 hover:text-zinc-900 text-sm"
        >
          Скасувати
        </button>
      </div>
    </div>
  );
};

// Calculator Modal Component
const CalculatorModal = ({ vehicle, onClose, onBuy }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState({
    port: 'NJ',
    vehicleType: 'sedan'
  });
  const [ports, setPorts] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);

  useEffect(() => {
    fetchPorts();
  }, []);

  const fetchPorts = async () => {
    try {
      const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
      const res = await axios.get(`${API_URL}/api/calculator/ports`);
      setPorts(res.data.ports || []);
      setVehicleTypes(res.data.vehicleTypes || []);
    } catch (err) {
      console.error('Error fetching ports:', err);
      // Fallback defaults
      setPorts([
        { code: 'NJ', name: 'New Jersey' },
        { code: 'GA', name: 'Georgia (Savannah)' },
        { code: 'TX', name: 'Texas (Houston)' },
        { code: 'CA', name: 'California (Long Beach)' }
      ]);
      setVehicleTypes([
        { code: 'sedan', name: 'Седан' },
        { code: 'suv', name: 'SUV' },
        { code: 'bigSUV', name: 'Великий SUV' },
        { code: 'pickup', name: 'Пікап' }
      ]);
    }
  };

  const handleCalculate = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
      const res = await axios.post(`${API_URL}/api/calculator/calculate`, {
        vin: vehicle.vin,
        price: vehicle.price || 10000,
        port: settings.port,
        vehicleType: settings.vehicleType,
        vehicleTitle: vehicle.title || `${vehicle.make} ${vehicle.model}`
      });
      
      setResult(res.data);
      
      // Track analytics
      if (window.trackEvent) {
        window.trackEvent('calculator_used', {
          vin: vehicle.vin,
          price: vehicle.price,
          result: res.data.finalPrice || res.data.recommended?.finalPrice
        });
      }
    } catch (err) {
      console.error('Calculator error:', err);
      setError('Помилка розрахунку. Спробуйте ще раз.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-zinc-900">Калькулятор доставки</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-900">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-3 bg-zinc-100 rounded-lg mb-6">
          <p className="text-sm text-zinc-600">{vehicle.title || `${vehicle.make} ${vehicle.model}`}</p>
          <p className="text-xs text-zinc-400 font-mono">VIN: {vehicle.vin}</p>
          {vehicle.price && (
            <p className="text-lg font-bold text-zinc-900 mt-1">Ціна аукціону: ${vehicle.price.toLocaleString()}</p>
          )}
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">Порт відправки (США)</label>
            <select
              value={settings.port}
              onChange={e => setSettings({...settings, port: e.target.value})}
              className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              data-testid="port-select"
            >
              {ports.map(port => (
                <option key={port.code} value={port.code}>{port.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">Тип авто</label>
            <select
              value={settings.vehicleType}
              onChange={e => setSettings({...settings, vehicleType: e.target.value})}
              className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              data-testid="vehicle-type-select"
            >
              {vehicleTypes.map(type => (
                <option key={type.code} value={type.code}>{type.name}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleCalculate}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 mb-4"
          data-testid="calculate-submit-btn"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Розраховую...
            </>
          ) : (
            <>
              <Calculator size={20} />
              Розрахувати
            </>
          )}
        </button>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        {result && (
          <div className="border border-zinc-200 rounded-lg overflow-hidden" data-testid="calculator-result">
            <div className="bg-zinc-50 p-4 border-b border-zinc-200">
              <p className="text-sm text-zinc-500">Загальна вартість під ключ</p>
              <p className="text-3xl font-bold text-green-600">
                ${(result.totals?.visible || result.finalPrice || 0).toLocaleString()}
              </p>
            </div>
            
            <div className="p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Ціна авто</span>
                <span className="font-medium">${(result.breakdown?.carPrice || vehicle.price || 0).toLocaleString()}</span>
              </div>
              {result.breakdown?.auctionFee && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Аукціонний збір</span>
                  <span className="font-medium">${result.breakdown.auctionFee.toLocaleString()}</span>
                </div>
              )}
              {(result.breakdown?.usaInland || result.breakdown?.ocean) && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Доставка (США + море)</span>
                  <span className="font-medium">${((result.breakdown?.usaInland || 0) + (result.breakdown?.ocean || 0)).toLocaleString()}</span>
                </div>
              )}
              {result.breakdown?.euDelivery && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Доставка в Європу</span>
                  <span className="font-medium">${result.breakdown.euDelivery.toLocaleString()}</span>
                </div>
              )}
              {result.breakdown?.customs && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Митні платежі</span>
                  <span className="font-medium">${result.breakdown.customs.toLocaleString()}</span>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-zinc-200">
              <button
                onClick={onBuy}
                className="w-full bg-zinc-900 text-white py-3 rounded-lg font-semibold hover:bg-zinc-800 flex items-center justify-center gap-2"
                data-testid="buy-after-calc-btn"
              >
                <Phone size={18} />
                Хочу купити це авто
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VehicleDetailPage;
