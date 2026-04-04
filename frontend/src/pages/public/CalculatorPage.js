/**
 * Public Calculator Page
 * 
 * Калькулятор вартості доставки авто
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Calculator, Car, Package, CurrencyDollar, ArrowRight } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useLang } from '../../i18n';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const CalculatorPage = () => {
  const { t, lang } = useLang();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [ports, setPorts] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  
  const [formData, setFormData] = useState({
    price: '',
    port: 'NJ',
    vehicleType: 'sedan',
    vin: ''
  });

  // SEO
  useEffect(() => {
    document.title = t('seoCalculatorTitle');
  }, [lang, t]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/calculator/ports`);
      setPorts(res.data.ports || []);
      setVehicleTypes(res.data.vehicleTypes || []);
    } catch (err) {
      // Fallback defaults
      setPorts([
        { code: 'NJ', name: 'New Jersey' },
        { code: 'GA', name: 'Georgia (Savannah)' },
        { code: 'TX', name: 'Texas (Houston)' },
        { code: 'CA', name: 'California (Long Beach)' }
      ]);
      setVehicleTypes([
        { code: 'sedan', name: t('sedan') },
        { code: 'suv', name: t('suv') },
        { code: 'bigSUV', name: t('bigSuv') },
        { code: 'pickup', name: t('pickup') }
      ]);
    }
  };

  const handleCalculate = async (e) => {
    e.preventDefault();
    
    if (!formData.price || parseFloat(formData.price) <= 0) {
      setError(lang === 'bg' ? 'Въведете цена на автомобила' : 'Enter car price');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await axios.post(`${API_URL}/api/calculator/calculate`, {
        price: parseFloat(formData.price),
        port: formData.port,
        vehicleType: formData.vehicleType,
        vin: formData.vin || undefined
      });
      
      setResult(res.data);
    } catch (err) {
      console.error('Calculator error:', err);
      setError('Помилка розрахунку. Спробуйте ще раз.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-12" data-testid="calculator-page">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Calculator size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-zinc-900 mb-2">{t('calculatorTitle')}</h1>
          <p className="text-zinc-500">{t('calculatorSubtitle')}</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Form */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-100">
            <form onSubmit={handleCalculate} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  {t('auctionPriceUsd')} *
                </label>
                <div className="relative">
                  <CurrencyDollar size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="number"
                    value={formData.price}
                    onChange={e => setFormData({...formData, price: e.target.value})}
                    placeholder="15000"
                    className="w-full pl-10 pr-4 py-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
                    data-testid="calc-price-input"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  {t('departurePort')}
                </label>
                <select
                  value={formData.port}
                  onChange={e => setFormData({...formData, port: e.target.value})}
                  className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent bg-white"
                  data-testid="calc-port-select"
                >
                  {ports.map(port => (
                    <option key={port.code} value={port.code}>{port.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  Тип авто
                </label>
                <select
                  value={formData.vehicleType}
                  onChange={e => setFormData({...formData, vehicleType: e.target.value})}
                  className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent bg-white"
                  data-testid="calc-type-select"
                >
                  {vehicleTypes.map(type => (
                    <option key={type.code} value={type.code}>{type.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  VIN код (опціонально)
                </label>
                <input
                  type="text"
                  value={formData.vin}
                  onChange={e => setFormData({...formData, vin: e.target.value.toUpperCase()})}
                  placeholder="WVWZZZ3CZWE123789"
                  maxLength={17}
                  className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:border-transparent font-mono"
                  data-testid="calc-vin-input"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-zinc-900 text-white py-4 rounded-lg font-semibold hover:bg-zinc-800 disabled:opacity-50 flex items-center justify-center gap-2"
                data-testid="calc-submit-btn"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Розраховую...
                  </>
                ) : (
                  <>
                    <Calculator size={20} />
                    Розрахувати вартість
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Result */}
          <div>
            {result ? (
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-zinc-100" data-testid="calc-result">
                <div className="bg-green-50 p-6 border-b border-green-100">
                  <p className="text-sm text-green-600 font-medium mb-1">Загальна вартість під ключ</p>
                  <p className="text-4xl font-bold text-green-700">
                    ${(result.totals?.visible || 0).toLocaleString()}
                  </p>
                </div>

                <div className="p-6 space-y-3">
                  <h3 className="font-semibold text-zinc-900 mb-4">Деталізація</h3>
                  
                  <div className="flex justify-between py-2 border-b border-zinc-100">
                    <span className="text-zinc-500">Ціна авто</span>
                    <span className="font-medium">${(result.breakdown?.carPrice || formData.price).toLocaleString()}</span>
                  </div>
                  
                  {result.breakdown?.auctionFee > 0 && (
                    <div className="flex justify-between py-2 border-b border-zinc-100">
                      <span className="text-zinc-500">Аукціонний збір</span>
                      <span className="font-medium">${result.breakdown.auctionFee.toLocaleString()}</span>
                    </div>
                  )}
                  
                  {(result.breakdown?.usaInland > 0 || result.breakdown?.ocean > 0) && (
                    <div className="flex justify-between py-2 border-b border-zinc-100">
                      <span className="text-zinc-500">Доставка (США + море)</span>
                      <span className="font-medium">${((result.breakdown?.usaInland || 0) + (result.breakdown?.ocean || 0)).toLocaleString()}</span>
                    </div>
                  )}
                  
                  {result.breakdown?.euDelivery > 0 && (
                    <div className="flex justify-between py-2 border-b border-zinc-100">
                      <span className="text-zinc-500">Доставка в Європу</span>
                      <span className="font-medium">${result.breakdown.euDelivery.toLocaleString()}</span>
                    </div>
                  )}
                  
                  {result.breakdown?.customs > 0 && (
                    <div className="flex justify-between py-2 border-b border-zinc-100">
                      <span className="text-zinc-500">Митні платежі</span>
                      <span className="font-medium">${result.breakdown.customs.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-zinc-100">
                  <Link
                    to="/cars"
                    className="w-full bg-zinc-900 text-white py-3 rounded-lg font-medium hover:bg-zinc-800 flex items-center justify-center gap-2"
                  >
                    Переглянути авто
                    <ArrowRight size={18} />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-zinc-100 h-full flex flex-col items-center justify-center text-center">
                <Package size={64} className="text-zinc-200 mb-4" />
                <h3 className="text-lg font-semibold text-zinc-900 mb-2">Введіть дані для розрахунку</h3>
                <p className="text-zinc-500 text-sm">
                  Вкажіть ціну авто на аукціоні, порт відправки та тип авто для отримання повної калькуляції
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Info Block */}
        <div className="mt-10 bg-white rounded-2xl p-6 shadow-sm border border-zinc-100">
          <h3 className="font-semibold text-zinc-900 mb-4 flex items-center gap-2">
            <Car size={20} />
            Що входить у вартість?
          </h3>
          <div className="grid md:grid-cols-3 gap-6 text-sm text-zinc-600">
            <div>
              <p className="font-medium text-zinc-900 mb-2">Аукціонні витрати</p>
              <ul className="space-y-1">
                <li>• Аукціонний збір (buyer fee)</li>
                <li>• Збір за документи</li>
                <li>• Страхування лоту</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-zinc-900 mb-2">Доставка</p>
              <ul className="space-y-1">
                <li>• Внутрішня доставка США</li>
                <li>• Морське перевезення</li>
                <li>• Доставка в Європу</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-zinc-900 mb-2">Митне оформлення</p>
              <ul className="space-y-1">
                <li>• Мито та ПДВ</li>
                <li>• Акцизний збір</li>
                <li>• Брокерські послуги</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalculatorPage;
