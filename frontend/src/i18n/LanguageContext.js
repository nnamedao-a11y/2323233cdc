/**
 * Language Context
 * 
 * Provides language switching functionality for the app
 * Supported: UK (Ukrainian), EN (English), BG (Bulgarian)
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import translations from './translations';

const LanguageContext = createContext(null);

// Available languages
export const LANGUAGES = [
  { code: 'uk', label: 'UA', flag: '🇺🇦', name: 'Українська' },
  { code: 'en', label: 'EN', flag: '🇬🇧', name: 'English' },
  { code: 'bg', label: 'BG', flag: '🇧🇬', name: 'Български' },
];

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => {
    // Get from localStorage or default to 'uk'
    if (typeof window !== 'undefined') {
      return localStorage.getItem('bibi_lang') || 'uk';
    }
    return 'uk';
  });

  // Save language preference to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bibi_lang', lang);
    }
  }, [lang]);

  // Translation function
  const t = (key) => {
    return translations[lang]?.[key] || translations['en']?.[key] || key;
  };

  // Cycle through languages
  const toggleLang = () => {
    const currentIndex = LANGUAGES.findIndex(l => l.code === lang);
    const nextIndex = (currentIndex + 1) % LANGUAGES.length;
    setLang(LANGUAGES[nextIndex].code);
  };

  // Set specific language
  const changeLang = (newLang) => {
    if (LANGUAGES.some(l => l.code === newLang)) {
      setLang(newLang);
    }
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, toggleLang, changeLang, languages: LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLang = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    // Return fallback if used outside provider
    return {
      lang: 'uk',
      setLang: () => {},
      t: (key) => translations['uk']?.[key] || key,
      toggleLang: () => {},
      changeLang: () => {},
      languages: LANGUAGES,
    };
  }
  return context;
};

export default LanguageContext;
