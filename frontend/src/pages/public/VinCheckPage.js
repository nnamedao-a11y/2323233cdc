/**
 * VIN Check Page with Calculator & Lead Conversion
 * 
 * Flow: VIN → Vehicle Data → Calculator → Quote → Lead
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useLang } from '../../i18n';
import { 
  MagnifyingGlass, 
  ArrowRight, 
  CheckCircle, 
  Warning, 
  Car, 
  Calendar, 
  MapPin, 
  Gauge, 
  CurrencyDollar,
  Images,
  Shield,
  Phone,
  Envelope,
  Calculator,
  Truck,
  Anchor,
  Receipt,
  User,
  ChatCircle,
  SpinnerGap,
  Check
} from '@phosphor-icons/react';
import AuctionTimer from '../../components/public/AuctionTimer';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const VinCheckPage = () => {
  const { t } = useLang();
  const { vin: urlVin } = useParams();
  const navigate = useNavigate();
  
  const [vin, setVin] = useState(urlVin || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  
  // Calculator state
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [port, setPort] = useState('NJ');
  const [vehicleType, setVehicleType] = useState('sedan');
  const [calcLoading, setCalcLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [selectedScenario, setSelectedScenario] = useState('recommended');
  
  // Lead form state
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadSuccess, setLeadSuccess] = useState(false);
  const [leadForm, setLeadForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    comment: ''
  });

  // Auto-search if VIN in URL
  useEffect(() => {
    if (urlVin && urlVin.length === 17) {
      handleSearch(urlVin);
    }
  }, [urlVin]);

  const handleSearch = async (searchVin = vin) => {
    if (!searchVin || searchVin.length !== 17) {
      setError('VIN код повинен містити 17 символів');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setQuote(null);
    setLeadSuccess(false);

    try {
      // Use VIN Unified endpoint
      const res = await axios.get(`${API_URL}/api/vin-unified/resolve?vin=${searchVin.toUpperCase()}`);
      
      // Transform V2 response to expected format
      const data = res.data;
      const transformed = {
        vin: data.vin,
        status: data.status,
        confidence: data.confidence,
        title: data.vehicle?.title,
        year: data.vehicle?.year,
        make: data.vehicle?.make,
        model: data.vehicle?.model,
        price: data.vehicle?.price || data.pricing?.marketPrice,
        images: data.vehicle?.images || [],
        location: data.vehicle?.location,
        saleDate: data.vehicle?.saleDate,
        lotNumber: data.vehicle?.lotNumber,
        damageType: data.vehicle?.damageType,
        mileage: data.vehicle?.mileage,
        // Pricing from V2
        pricing: data.pricing,
        sourcesUsed: data.sourcesUsed,
        sourceCount: data.sourceCount,
        message: data.message,
      };
      
      setResult(transformed);
      
      // Update URL
      if (searchVin !== urlVin) {
        navigate(`/vin-check/${searchVin.toUpperCase()}`, { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Помилка пошуку. Спробуйте ще раз.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSearch();
  };

  // Calculate delivery cost
  const handleCalculate = async () => {
    if (!result?.price) {
      setError('Немає ціни для розрахунку');
      return;
    }

    setCalcLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/calculator/quote`, {
        price: result.price,
        port,
        vehicleType,
        vin: result.vin,
        vehicleTitle: result.title
      });
      setQuote(res.data);
      setCalculatorOpen(true);
    } catch (err) {
      setError('Помилка розрахунку. Спробуйте ще раз.');
    } finally {
      setCalcLoading(false);
    }
  };

  // Submit lead
  const handleLeadSubmit = async (e) => {
    e.preventDefault();
    
    if (!leadForm.firstName || !leadForm.phone) {
      setError('Вкажіть ім\'я та телефон');
      return;
    }

    setLeadLoading(true);
    try {
      // First update scenario if quote exists
      if (quote?.quote?.id) {
        await axios.patch(`${API_URL}/api/calculator/quote/${quote.quote.id}/scenario`, {
          selectedScenario
        });
      }

      await axios.post(`${API_URL}/api/public/leads/from-quote`, {
        quoteId: quote?.quote?.id || quote?._id,
        firstName: leadForm.firstName,
        lastName: leadForm.lastName,
        phone: leadForm.phone,
        email: leadForm.email,
        comment: leadForm.comment
      });
      setLeadSuccess(true);
      setShowLeadForm(false);
    } catch (err) {
      setError('Помилка створення заявки. Спробуйте ще раз.');
    } finally {
      setLeadLoading(false);
    }
  };

  // Quick lead without quote
  const handleQuickLead = async (e) => {
    e.preventDefault();
    
    if (!leadForm.firstName || !leadForm.phone) {
      setError('Вкажіть ім\'я та телефон');
      return;
    }

    setLeadLoading(true);
    try {
      await axios.post(`${API_URL}/api/public/leads/quick`, {
        vin: result?.vin || vin,
        firstName: leadForm.firstName,
        lastName: leadForm.lastName || 'VIN-пошук',
        phone: leadForm.phone,
        email: leadForm.email,
        comment: leadForm.comment,
        price: result?.price,
        vehicleTitle: result?.title,
        source: 'vin_page_quick'
      });
      setLeadSuccess(true);
      setShowLeadForm(false);
    } catch (err) {
      setError('Помилка створення заявки. Спробуйте ще раз.');
    } finally {
      setLeadLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50" data-testid="vin-check-page">
      {/* Search Section */}
      <section className="bg-white border-b border-zinc-200 py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-3xl font-bold text-zinc-900 mb-3">
              Перевірка VIN коду
            </h1>
            <p className="text-zinc-500 mb-8">
              Введіть VIN код авто для отримання інформації з аукціонів
            </p>

            <form onSubmit={handleSubmit} className="relative">
              <div className="flex items-center bg-zinc-100 rounded-xl p-2">
                <MagnifyingGlass size={24} className="text-zinc-400 ml-4" />
                <input
                  type="text"
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  placeholder="Введіть VIN код (17 символів)"
                  maxLength={17}
                  className="flex-1 bg-transparent border-none outline-none px-4 py-3 text-lg font-mono"
                  data-testid="vin-search-input"
                />
                <button
                  type="submit"
                  disabled={loading || vin.length !== 17}
                  className="bg-zinc-900 text-white px-8 py-3 rounded-lg font-semibold flex items-center gap-2 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                  data-testid="vin-search-btn"
                >
                  {loading ? (
                    <SpinnerGap size={20} className="animate-spin" />
                  ) : (
                    <>
                      Перевірити
                      <ArrowRight size={20} />
                    </>
                  )}
                </button>
              </div>
              <div className="text-right text-xs text-zinc-400 mt-2">
                {vin.length}/17
              </div>
            </form>

            {error && (
              <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-lg">
                {error}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Results */}
      {result && result.vin && result.status !== 'NOT_FOUND' && (
        <section className="py-12">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Main Info */}
              <div className="lg:col-span-2 space-y-6">
                {/* Images */}
                {result.images?.length > 0 && (
                  <div className="bg-white rounded-xl overflow-hidden border border-zinc-200">
                    <div className="aspect-video relative bg-zinc-100">
                      <img
                        src={result.images[0]}
                        alt="Vehicle"
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.src = '/images/car-placeholder.jpg'; }}
                      />
                    </div>
                    {result.images.length > 1 && (
                      <div className="p-4 flex gap-2 overflow-x-auto">
                        {result.images.slice(0, 10).map((img, i) => (
                          <img
                            key={i}
                            src={img}
                            alt=""
                            className="flex-shrink-0 w-20 h-16 rounded object-cover border-2 border-transparent hover:border-zinc-900 cursor-pointer"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Vehicle Info */}
                <div className="bg-white rounded-xl border border-zinc-200 p-6">
                  <h2 className="text-2xl font-bold text-zinc-900 mb-2">
                    {result.title || `${result.year || ''} ${result.make || ''} ${result.model || ''}`.trim() || 'Автомобіль'}
                  </h2>
                  
                  <p className="text-sm text-zinc-400 font-mono mb-6">
                    VIN: {result.vin}
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {result.year && (
                      <InfoCard icon={Calendar} label="Рік" value={result.year} />
                    )}
                    {result.mileage && (
                      <InfoCard icon={Gauge} label="Пробіг" value={`${Number(result.mileage).toLocaleString()} mi`} />
                    )}
                    {result.location && (
                      <InfoCard icon={MapPin} label="Локація" value={result.location} />
                    )}
                    {result.images?.length > 0 && (
                      <InfoCard icon={Images} label="Фото" value={result.images.length} />
                    )}
                  </div>

                  {result.damageType && (
                    <div className="mt-6 p-4 bg-amber-50 rounded-lg">
                      <p className="text-amber-800 font-medium">
                        Тип пошкодження: {result.damageType}
                      </p>
                    </div>
                  )}
                </div>

                {/* V2 Pricing Decision */}
                {result.pricing && (
                  <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 rounded-xl border border-zinc-700 p-6 text-white">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-emerald-500/20 rounded-lg">
                        <CurrencyDollar size={24} className="text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Рекомендація по ставці</h3>
                        <p className="text-sm text-zinc-400">{result.message || 'На основі аналізу ринку'}</p>
                      </div>
                      <div className="ml-auto">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          result.pricing.dealStatus === 'EXCELLENT_DEAL' ? 'bg-emerald-500/20 text-emerald-300' :
                          result.pricing.dealStatus === 'GOOD_DEAL' ? 'bg-green-500/20 text-green-300' :
                          result.pricing.dealStatus === 'FAIR_DEAL' ? 'bg-yellow-500/20 text-yellow-300' :
                          result.pricing.dealStatus === 'RISKY' ? 'bg-orange-500/20 text-orange-300' :
                          result.pricing.dealStatus === 'OVERPRICED' ? 'bg-red-500/20 text-red-300' :
                          'bg-zinc-500/20 text-zinc-300'
                        }`}>
                          {result.pricing.dealStatus === 'EXCELLENT_DEAL' && 'Відмінна угода'}
                          {result.pricing.dealStatus === 'GOOD_DEAL' && 'Хороша угода'}
                          {result.pricing.dealStatus === 'FAIR_DEAL' && 'Нормальна угода'}
                          {result.pricing.dealStatus === 'RISKY' && 'Ризикова угода'}
                          {result.pricing.dealStatus === 'OVERPRICED' && 'Переплата'}
                          {result.pricing.dealStatus === 'UNKNOWN' && 'Невизначено'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="bg-white/5 rounded-lg p-4">
                        <p className="text-sm text-zinc-400 mb-1">Ринкова ціна</p>
                        <p className="text-2xl font-bold text-white">${result.pricing.marketPrice?.toLocaleString()}</p>
                      </div>
                      <div className="bg-emerald-500/10 rounded-lg p-4 border border-emerald-500/30">
                        <p className="text-sm text-emerald-300 mb-1">Max Bid</p>
                        <p className="text-2xl font-bold text-emerald-400">${result.pricing.maxBid?.toLocaleString()}</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-4">
                        <p className="text-sm text-zinc-400 mb-1">Safe Bid</p>
                        <p className="text-2xl font-bold text-white">${result.pricing.safeBid?.toLocaleString()}</p>
                      </div>
                      <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/30">
                        <p className="text-sm text-blue-300 mb-1">Під ключ</p>
                        <p className="text-2xl font-bold text-blue-400">${result.pricing.finalAllInPrice?.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 pt-4 border-t border-zinc-700">
                      <div className="text-center">
                        <p className="text-xs text-zinc-500">Доставка</p>
                        <p className="font-medium">${result.pricing.deliveryCost?.toLocaleString()}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-zinc-500">Ремонт (est)</p>
                        <p className="font-medium">${result.pricing.repairEstimate?.toLocaleString()}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-zinc-500">Маржа</p>
                        <p className="font-medium">${result.pricing.platformMargin?.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="mt-6 flex items-center gap-2 text-xs text-zinc-400">
                      <Shield size={14} />
                      <span>Confidence: {Math.round((result.confidence || 0) * 100)}% • {result.sourceCount} джерел: {(result.sourcesUsed || []).join(', ')}</span>
                    </div>
                  </div>
                )}

                {/* Calculator Section */}
                {result.price && (
                  <div className="bg-white rounded-xl border border-zinc-200 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Calculator size={24} className="text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-900">Калькулятор вартості</h3>
                        <p className="text-sm text-zinc-500">Розрахунок повної вартості доставки</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div>
                        <label className="block text-sm text-zinc-600 mb-2">Порт відправки</label>
                        <select
                          value={port}
                          onChange={(e) => setPort(e.target.value)}
                          className="w-full border border-zinc-200 rounded-lg px-4 py-3"
                          data-testid="port-select"
                        >
                          <option value="NJ">New Jersey</option>
                          <option value="GA">Georgia (Savannah)</option>
                          <option value="TX">Texas (Houston)</option>
                          <option value="CA">California (Long Beach)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-zinc-600 mb-2">Тип авто</label>
                        <select
                          value={vehicleType}
                          onChange={(e) => setVehicleType(e.target.value)}
                          className="w-full border border-zinc-200 rounded-lg px-4 py-3"
                          data-testid="vehicle-type-select"
                        >
                          <option value="sedan">Седан</option>
                          <option value="suv">SUV</option>
                          <option value="bigSUV">Великий SUV / Позашляховик</option>
                          <option value="pickup">Пікап</option>
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={handleCalculate}
                      disabled={calcLoading}
                      className="w-full bg-blue-600 text-white py-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                      data-testid="calculate-btn"
                    >
                      {calcLoading ? (
                        <SpinnerGap size={20} className="animate-spin" />
                      ) : (
                        <>
                          <Calculator size={20} />
                          Розрахувати вартість доставки
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Quote Result */}
                {quote && (
                  <div className="bg-white rounded-xl border-2 border-green-500 p-6" data-testid="quote-result">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <Receipt size={24} className="text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-900">Розрахунок #{quote.quote?.quoteNumber || 'N/A'}</h3>
                        <p className="text-sm text-zinc-500">Повна вартість авто з доставкою</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <BreakdownRow label="Ціна авто" value={quote.breakdown?.carPrice} icon={Car} />
                      <BreakdownRow label="Аукціонний збір" value={quote.breakdown?.auctionFee} />
                      <BreakdownRow label="Страхування" value={quote.breakdown?.insurance} />
                      <BreakdownRow label="Доставка по США" value={quote.breakdown?.usaInland} icon={Truck} />
                      <BreakdownRow label="Морська доставка" value={quote.breakdown?.ocean} icon={Anchor} />
                      <BreakdownRow label="Обробка в США" value={quote.breakdown?.usaHandlingFee} />
                      <BreakdownRow label="Банківська комісія" value={quote.breakdown?.bankFee} />
                      <BreakdownRow label="Обробка в порту ЄС" value={quote.breakdown?.euPortHandlingFee} />
                      <BreakdownRow label="Доставка в Болгарію" value={quote.breakdown?.euDelivery} icon={Truck} />
                      <BreakdownRow label="Митні платежі" value={quote.breakdown?.customs} />
                      <BreakdownRow label="Документація" value={quote.breakdown?.documentationFee} />
                      <BreakdownRow label="Оформлення титулу" value={quote.breakdown?.titleFee} />
                      <BreakdownRow label="Сервісний збір" value={quote.breakdown?.companyFee} />
                    </div>

                    <div className="mt-6 pt-6 border-t-2 border-zinc-200">
                      {/* Scenario Pricing */}
                      {quote?.scenarios && (
                        <div className="mb-6">
                          <p className="text-sm text-zinc-500 mb-3">Оберіть сценарій ціни:</p>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { key: 'minimum', label: 'Мінімум', desc: '-5%' },
                              { key: 'recommended', label: 'Рекомендовано', desc: 'Базова' },
                              { key: 'aggressive', label: 'Максимум', desc: '+10%' }
                            ].map(scenario => (
                              <button
                                key={scenario.key}
                                onClick={() => setSelectedScenario(scenario.key)}
                                className={`p-3 rounded-lg border-2 transition-all ${
                                  selectedScenario === scenario.key
                                    ? 'border-zinc-900 bg-zinc-900 text-white'
                                    : 'border-zinc-200 hover:border-zinc-400'
                                }`}
                                data-testid={`scenario-${scenario.key}`}
                              >
                                <div className="text-xs opacity-70">{scenario.label}</div>
                                <div className="font-bold">
                                  ${quote.scenarios[scenario.key]?.toLocaleString() || 'N/A'}
                                </div>
                                <div className="text-xs opacity-50">{scenario.desc}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between items-center">
                        <span className="text-xl font-semibold text-zinc-900">Обрана ціна</span>
                        <span className="text-3xl font-bold text-green-600" data-testid="total-price">
                          ${quote?.scenarios?.[selectedScenario]?.toLocaleString() || quote?.totals?.visible?.toLocaleString() || '—'}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-500 mt-2">
                        * Фінальна ціна може відрізнятись залежно від курсу та умов аукціону
                      </p>
                    </div>

                    {!leadSuccess && (
                      <button
                        onClick={() => setShowLeadForm(true)}
                        className="w-full mt-6 bg-red-600 text-white py-4 rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                        data-testid="buy-btn"
                      >
                        <Car size={20} />
                        Хочу купити це авто
                      </button>
                    )}

                    {leadSuccess && (
                      <div className="mt-6 p-4 bg-green-50 rounded-lg flex items-center gap-3">
                        <Check size={24} className="text-green-600" />
                        <div>
                          <p className="font-semibold text-green-800">Заявка успішно створена!</p>
                          <p className="text-sm text-green-600">Менеджер зв'яжеться з вами найближчим часом</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sources */}
                {result.sources?.length > 0 && (
                  <div className="bg-white rounded-xl border border-zinc-200 p-6">
                    <h3 className="font-semibold text-zinc-900 mb-4">
                      Знайдено в {result.sources.length} джерелах
                    </h3>
                    <div className="space-y-2">
                      {result.sources.map((sourceName, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-zinc-600">{sourceName}</span>
                          <div className="flex items-center gap-2">
                            <CheckCircle size={16} className="text-green-500" />
                            <span className="text-zinc-400">Знайдено</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Price & Auction */}
                <div className="bg-white rounded-xl border border-zinc-200 p-6 sticky top-6">
                  {result.price && (
                    <div className="text-center mb-6">
                      <p className="text-sm text-zinc-500">Ціна на аукціоні</p>
                      <p className="text-4xl font-bold text-zinc-900">
                        ${result.price.toLocaleString()}
                      </p>
                    </div>
                  )}

                  {result.saleDate && new Date(result.saleDate) > new Date() && (
                    <div className="text-center pb-6 border-b border-zinc-100">
                      <p className="text-sm text-zinc-500 mb-2">До аукціону</p>
                      <AuctionTimer date={result.saleDate} />
                    </div>
                  )}

                  <button
                    onClick={() => setShowLeadForm(true)}
                    className="w-full mt-6 bg-zinc-900 text-white py-4 rounded-lg font-semibold hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                    data-testid="request-call-btn"
                  >
                    <Phone size={20} />
                    Замовити дзвінок
                  </button>

                  <p className="text-center text-xs text-zinc-400 mt-4">
                    Ми зв'яжемось з вами протягом 15 хвилин
                  </p>
                </div>

                {/* Trust */}
                <div className="bg-zinc-100 rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Shield size={24} className="text-green-600" />
                    <span className="font-semibold text-zinc-900">Гарантії</span>
                  </div>
                  <ul className="space-y-2 text-sm text-zinc-600">
                    <li className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-green-500" />
                      Перевірка історії авто
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-green-500" />
                      Юридична чистота
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-green-500" />
                      Допомога з доставкою
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Not Found */}
      {result && (result.status === 'NOT_FOUND' || !result.vin) && (
        <section className="py-12">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center py-12">
              <Warning size={48} className="mx-auto text-amber-500 mb-4" />
              <h2 className="text-xl font-semibold text-zinc-900 mb-2">
                Інформація не знайдена
              </h2>
              <p className="text-zinc-500 mb-6">
                На жаль, ми не знайшли даних по цьому VIN коду в базах аукціонів
              </p>
              <button
                onClick={() => setShowLeadForm(true)}
                className="bg-zinc-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-zinc-800 transition-colors"
              >
                Залишити заявку на підбір
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Lead Form Modal */}
      {showLeadForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-zinc-900 mb-2">
              {quote ? 'Оформити заявку' : 'Замовити дзвінок'}
            </h3>
            <p className="text-zinc-500 mb-6">
              Залиште контакти і ми зв'яжемось з вами
            </p>

            <form onSubmit={quote ? handleLeadSubmit : handleQuickLead} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-600 mb-1">Ім'я *</label>
                  <input
                    type="text"
                    value={leadForm.firstName}
                    onChange={(e) => setLeadForm(f => ({ ...f, firstName: e.target.value }))}
                    className="w-full border border-zinc-200 rounded-lg px-4 py-3"
                    required
                    data-testid="lead-firstname"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-600 mb-1">Прізвище</label>
                  <input
                    type="text"
                    value={leadForm.lastName}
                    onChange={(e) => setLeadForm(f => ({ ...f, lastName: e.target.value }))}
                    className="w-full border border-zinc-200 rounded-lg px-4 py-3"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-zinc-600 mb-1">Телефон *</label>
                <input
                  type="tel"
                  value={leadForm.phone}
                  onChange={(e) => setLeadForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-lg px-4 py-3"
                  placeholder="+380..."
                  required
                  data-testid="lead-phone"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-600 mb-1">Email</label>
                <input
                  type="email"
                  value={leadForm.email}
                  onChange={(e) => setLeadForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-lg px-4 py-3"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-600 mb-1">Коментар</label>
                <textarea
                  value={leadForm.comment}
                  onChange={(e) => setLeadForm(f => ({ ...f, comment: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-lg px-4 py-3 min-h-[100px]"
                  placeholder="Додаткова інформація..."
                />
              </div>

              {quote && (
                <div className="p-4 bg-zinc-50 rounded-lg">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-zinc-500">VIN:</span>
                    <span className="font-mono">{result?.vin}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Орієнтовна вартість:</span>
                    <span className="font-semibold">${quote.totals?.visible?.toLocaleString()}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowLeadForm(false)}
                  className="flex-1 border border-zinc-200 text-zinc-700 py-3 rounded-lg font-semibold hover:bg-zinc-50"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={leadLoading}
                  className="flex-1 bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                  data-testid="submit-lead-btn"
                >
                  {leadLoading ? (
                    <SpinnerGap size={20} className="animate-spin" />
                  ) : (
                    <>
                      <Check size={20} />
                      Відправити
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Info Card
const InfoCard = ({ icon: Icon, label, value }) => (
  <div className="p-4 bg-zinc-50 rounded-lg">
    <div className="flex items-center gap-2 text-zinc-400 mb-1">
      <Icon size={16} />
      <span className="text-xs">{label}</span>
    </div>
    <p className="font-semibold text-zinc-900">{value}</p>
  </div>
);

// Breakdown Row
const BreakdownRow = ({ label, value, icon: Icon }) => {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between items-center py-2 border-b border-zinc-100">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={16} className="text-zinc-400" />}
        <span className="text-sm text-zinc-600">{label}</span>
      </div>
      <span className="font-medium text-zinc-900">${Number(value).toLocaleString()}</span>
    </div>
  );
};

export default VinCheckPage;
