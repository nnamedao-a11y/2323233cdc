/**
 * Viber Bot - Button Templates
 * 
 * Simple keyboard templates for Viber (not complex like Telegram)
 */

export type Language = 'bg' | 'en';

export function mainButtons(lang: Language) {
  return [
    {
      Columns: 3,
      Rows: 1,
      BgColor: '#2196F3',
      Text: `<font color="#FFFFFF">${lang === 'bg' ? '🚗 Авто' : '🚗 Cars'}</font>`,
      TextSize: 'medium',
      TextHAlign: 'center',
      TextVAlign: 'middle',
      ActionType: 'reply',
      ActionBody: 'MY_CARS',
    },
    {
      Columns: 3,
      Rows: 1,
      BgColor: '#4CAF50',
      Text: `<font color="#FFFFFF">${lang === 'bg' ? '📦 Поръчки' : '📦 Orders'}</font>`,
      TextSize: 'medium',
      TextHAlign: 'center',
      TextVAlign: 'middle',
      ActionType: 'reply',
      ActionBody: 'ORDERS',
    },
    {
      Columns: 3,
      Rows: 1,
      BgColor: '#FF9800',
      Text: `<font color="#FFFFFF">${lang === 'bg' ? '📊 Статус' : '📊 Status'}</font>`,
      TextSize: 'medium',
      TextHAlign: 'center',
      TextVAlign: 'middle',
      ActionType: 'reply',
      ActionBody: 'STATUS',
    },
    {
      Columns: 3,
      Rows: 1,
      BgColor: '#9C27B0',
      Text: `<font color="#FFFFFF">${lang === 'bg' ? '👤 Мениджър' : '👤 Manager'}</font>`,
      TextSize: 'medium',
      TextHAlign: 'center',
      TextVAlign: 'middle',
      ActionType: 'reply',
      ActionBody: 'MANAGER',
    },
  ];
}

export function languageButtons() {
  return [
    {
      Columns: 3,
      Rows: 1,
      BgColor: '#E91E63',
      Text: '<font color="#FFFFFF">🇧🇬 Български</font>',
      TextSize: 'medium',
      TextHAlign: 'center',
      TextVAlign: 'middle',
      ActionType: 'reply',
      ActionBody: 'LANG_BG',
    },
    {
      Columns: 3,
      Rows: 1,
      BgColor: '#3F51B5',
      Text: '<font color="#FFFFFF">🇬🇧 English</font>',
      TextSize: 'medium',
      TextHAlign: 'center',
      TextVAlign: 'middle',
      ActionType: 'reply',
      ActionBody: 'LANG_EN',
    },
  ];
}

export const VIBER_TEXTS = {
  bg: {
    welcome: '🚗 Добре дошли в BIBI Cars!',
    chooseLanguage: 'Изберете език:',
    chooseOption: 'Изберете опция:',
    noCars: '🚗 Няма запазени автомобили.',
    noOrders: '📦 Няма активни поръчки.',
    noStatus: '📊 Няма статус за показване.',
    manager: '👤 Вашият мениджър:\n📞 +359 XX XXX XXXX\n📧 manager@bibi-cars.com',
    linked: '✅ Акаунтът е свързан успешно!',
    notLinked: '⚠️ Акаунтът не е свързан. Свържете се от сайта.',
    auctionSoon: '⏰ Аукцион скоро',
    priceDropped: '🔻 Цената падна',
    statusUpdated: '📦 Статус обновен',
  },
  en: {
    welcome: '🚗 Welcome to BIBI Cars!',
    chooseLanguage: 'Choose language:',
    chooseOption: 'Choose option:',
    noCars: '🚗 No saved cars.',
    noOrders: '📦 No active orders.',
    noStatus: '📊 No status to show.',
    manager: '👤 Your manager:\n📞 +359 XX XXX XXXX\n📧 manager@bibi-cars.com',
    linked: '✅ Account linked successfully!',
    notLinked: '⚠️ Account not linked. Connect from website.',
    auctionSoon: '⏰ Auction soon',
    priceDropped: '🔻 Price dropped',
    statusUpdated: '📦 Status updated',
  },
};

export function t(lang: Language, key: keyof typeof VIBER_TEXTS.bg): string {
  return VIBER_TEXTS[lang]?.[key] || VIBER_TEXTS.bg[key] || key;
}
