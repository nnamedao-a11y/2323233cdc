/**
 * Public Footer Component
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Phone, Envelope, MapPin } from '@phosphor-icons/react';
import { useLang } from '../../i18n';

const PublicFooter = () => {
  const { t } = useLang();
  
  return (
    <footer className="bg-zinc-900 text-zinc-400 py-12 mt-auto">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Company */}
          <div>
            <img 
              src="/images/logo.svg" 
              alt="BIBI Cars" 
              className="h-8 w-auto mb-4 brightness-0 invert"
            />
            <p className="text-sm">
              {t('footerDescription')}
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-white font-semibold mb-4">{t('navigation')}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/" className="hover:text-white transition-colors">{t('home')}</Link></li>
              <li><Link to="/cars" className="hover:text-white transition-colors">{t('carCatalog')}</Link></li>
              <li><Link to="/vin-check" className="hover:text-white transition-colors">{t('vinCheck')}</Link></li>
              <li><Link to="/calculator" className="hover:text-white transition-colors">{t('calculator')}</Link></li>
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-white font-semibold mb-4">{t('services')}</h4>
            <ul className="space-y-2 text-sm">
              <li>{t('serviceCarSelection')}</li>
              <li>{t('serviceDelivery')}</li>
              <li>{t('serviceCustoms')}</li>
              <li>{t('serviceInsurance')}</li>
            </ul>
          </div>

          {/* Contacts */}
          <div>
            <h4 className="text-white font-semibold mb-4">{t('contacts')}</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2">
                <Phone size={16} />
                <span>+380 (XX) XXX-XX-XX</span>
              </li>
              <li className="flex items-center gap-2">
                <Envelope size={16} />
                <span>info@bibicars.com</span>
              </li>
              <li className="flex items-center gap-2">
                <MapPin size={16} />
                <span>{t('locationKyiv')}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-zinc-800 mt-8 pt-8 text-center text-sm">
          <p>© {new Date().getFullYear()} BIBI Cars. {t('allRightsReserved')}</p>
        </div>
      </div>
    </footer>
  );
};

export default PublicFooter;
