/**
 * Hero Component
 * 
 * Головний банер з VIN пошуком
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlass, ArrowRight, CheckCircle } from '@phosphor-icons/react';
import { useLang } from '../../i18n';

const Hero = () => {
  const { t } = useLang();
  const [vin, setVin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSearch = async (e) => {
    e.preventDefault();
    
    if (!vin || vin.length !== 17) {
      setError(t('vinMustBe17'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Navigate to VIN check page with the VIN
      navigate(`/vin-check/${vin.toUpperCase()}`);
    } catch (err) {
      setError(t('searchErrorRetry'));
      setLoading(false);
    }
  };

  const features = [
    t('heroFeature1'),
    t('heroFeature2'),
    t('heroFeature3'),
  ];

  return (
    <section className="relative bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 text-white py-20 lg:py-32 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      <div className="container mx-auto px-4 relative">
        <div className="max-w-3xl mx-auto text-center">
          {/* Title */}
          <h1 className="text-4xl lg:text-6xl font-bold mb-6 leading-tight">
            {t('heroTitle')}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
              {' '}{t('heroTitleHighlight')}
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg lg:text-xl text-zinc-300 mb-10">
            {t('heroSubtitle')}
          </p>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="max-w-xl mx-auto" data-testid="hero-search-form">
            <div className="relative">
              <div className="flex bg-white rounded-xl overflow-hidden shadow-2xl">
                <div className="flex-1 relative">
                  <MagnifyingGlass 
                    size={20} 
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" 
                  />
                  <input
                    type="text"
                    value={vin}
                    onChange={(e) => {
                      setVin(e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''));
                      setError('');
                    }}
                    placeholder={t('heroPlaceholder')}
                    maxLength={17}
                    className="w-full pl-12 pr-4 py-4 text-zinc-900 text-lg placeholder:text-zinc-400 focus:outline-none"
                    data-testid="hero-vin-input"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || vin.length !== 17}
                  className="bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white px-8 font-semibold flex items-center gap-2 transition-colors"
                  data-testid="hero-search-btn"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      {t('heroButton')}
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
              
              {/* Character count */}
              <div className="absolute -bottom-6 right-0 text-xs text-zinc-400">
                {vin.length}/17
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm mt-3">{error}</p>
            )}
          </form>

          {/* Features */}
          <div className="flex flex-wrap justify-center gap-6 mt-12">
            {features.map((feature, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-zinc-300">
                <CheckCircle size={18} weight="fill" className="text-green-400" />
                {feature}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
