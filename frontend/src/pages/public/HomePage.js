/**
 * Home Page
 * 
 * Головна сторінка публічного сайту
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Fire, Timer, TrendUp, Car } from '@phosphor-icons/react';
import Hero from '../../components/public/Hero';
import AuctionSection from '../../components/public/AuctionSection';
import { useLang } from '../../i18n';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

const HomePage = () => {
  const { t } = useLang();
  const [hotAuctions, setHotAuctions] = useState([]);
  const [endingSoon, setEndingSoon] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Try auction-ranking API first
        let useAuctionRanking = true;
        let statsData = { total: 0, active: 0, upcoming: 0, hot: 0 };
        
        try {
          const statsRes = await axios.get(`${API_URL}/api/auction-ranking/stats`);
          statsData = statsRes.data || statsData;
          
          // If no auctions, fall back to public vehicles
          if (statsData.total === 0) {
            useAuctionRanking = false;
          }
        } catch {
          useAuctionRanking = false;
        }

        if (useAuctionRanking) {
          // Use auction-ranking API
          const [hotRes, endingRes, upcomingRes] = await Promise.all([
            axios.get(`${API_URL}/api/auction-ranking/hot?limit=8`),
            axios.get(`${API_URL}/api/auction-ranking/ending-soon?limit=8`),
            axios.get(`${API_URL}/api/auction-ranking/upcoming?limit=8`),
          ]);

          setHotAuctions(hotRes.data || []);
          setEndingSoon(endingRes.data || []);
          setUpcoming(upcomingRes.data || []);
          setStats(statsData);
        } else {
          // Fallback to public vehicles API
          const vehiclesRes = await axios.get(`${API_URL}/api/public/vehicles?limit=12`);
          const vehicles = vehiclesRes.data?.data || vehiclesRes.data || [];
          
          // Transform vehicles to auction format for display
          const transformedVehicles = vehicles.map(v => ({
            ...v,
            _id: v.id || v._id,
            auctionDate: v.saleDate || v.auctionDate,
            rankingScore: v.score ? v.score / 100 : 0.7,
          }));

          // Split vehicles into categories
          const now = new Date();
          const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
          
          const ending = transformedVehicles.filter(v => {
            const date = new Date(v.auctionDate);
            return date >= now && date <= in48h;
          });
          
          const future = transformedVehicles.filter(v => {
            const date = new Date(v.auctionDate);
            return date > in48h;
          });
          
          // Show all as "hot" if no auction dates
          const hot = transformedVehicles.filter(v => v.rankingScore >= 0.5).slice(0, 8);

          setHotAuctions(hot.length > 0 ? hot : transformedVehicles.slice(0, 8));
          setEndingSoon(ending);
          setUpcoming(future.length > 0 ? future : transformedVehicles.slice(0, 4));
          
          setStats({
            total: vehicles.length,
            active: vehicles.length,
            upcoming: future.length,
            hot: hot.length || vehicles.length
          });
        }
      } catch (err) {
        console.error('Error fetching auctions:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div data-testid="home-page">
      {/* Hero */}
      <Hero />

      {/* Stats Bar */}
      {stats && (
        <section className="bg-white border-b border-zinc-200 py-8">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <div>
                <p className="text-3xl font-bold text-zinc-900">{stats.total || 0}</p>
                <p className="text-sm text-zinc-500">{t('totalCars')}</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-zinc-900">{stats.active || 0}</p>
                <p className="text-sm text-zinc-500">{t('activeLots')}</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-orange-500">{stats.upcoming || 0}</p>
                <p className="text-sm text-zinc-500">{t('upcomingAuctions')}</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-red-500">{stats.hot || 0}</p>
                <p className="text-sm text-zinc-500">{t('hotLots')}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {loading ? (
        <div className="py-20 text-center">
          <div className="w-12 h-12 border-4 border-zinc-200 border-t-zinc-900 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-500">{t('loading')}</p>
        </div>
      ) : (
        <>
          {/* Hot Auctions */}
          <AuctionSection
            title={t('hotLotsTitle')}
            icon={Fire}
            data={hotAuctions}
            emptyText={t('noHotLots')}
          />

          {/* Ending Soon */}
          <div className="bg-orange-50">
            <AuctionSection
              title={t('endingSoon')}
              icon={Timer}
              data={endingSoon}
              emptyText={t('noEndingSoon')}
            />
          </div>

          {/* Upcoming */}
          <AuctionSection
            title={t('upcomingAuctionsTitle')}
            icon={TrendUp}
            data={upcoming}
            emptyText={t('noUpcoming')}
          />
        </>
      )}

      {/* CTA Section */}
      <section className="bg-zinc-900 text-white py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">
            {t('ctaTitle')}
          </h2>
          <p className="text-zinc-400 mb-8 max-w-xl mx-auto">
            {t('ctaSubtitle')}
          </p>
          <a 
            href="/vin-check"
            className="inline-flex items-center gap-2 bg-white text-zinc-900 px-8 py-4 rounded-xl font-semibold hover:bg-zinc-100 transition-colors"
            data-testid="cta-button"
          >
            <Car size={20} />
            {t('ctaButton')}
          </a>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
