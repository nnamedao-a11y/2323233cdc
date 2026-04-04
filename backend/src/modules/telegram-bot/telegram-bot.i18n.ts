/**
 * BIBI Cars Telegram Bot - i18n
 * 
 * Multi-language support: Bulgarian + English
 */

export const BOT_TEXT = {
  bg: {
    welcome: '🚗 Добре дошли в BIBI Cars Bot!',
    chooseLang: 'Изберете език / Choose language:',
    linked: '✅ Вашият акаунт е успешно свързан!',
    alreadyLinked: '✅ Вече сте свързани с този акаунт.',
    linkError: '❌ Грешка при свързване. Моля, опитайте отново.',
    mainMenu: '🏠 Главно меню',
    myCars: '🚗 Моите автомобили',
    myOrders: '📦 Моите поръчки',
    notifications: '🔔 Известия',
    website: '🌐 Уебсайт',
    manager: '👤 Моят мениджър',
    calculator: '💰 Калкулатор',
    noOrders: '📭 Все още нямате активни поръчки.',
    noCars: '🚗 Няма налични автомобили.',
    noNotifications: '🔔 Няма нови известия.',
    back: '⬅️ Назад',
    orderStatus: '📦 Статус на поръчката',
    details: '📋 Детайли',
    tracking: '🚚 Проследяване',
    contactManager: '📞 Свържи се с мениджър',
    managerInfo: '👤 Вашият мениджър:',
    orderCreated: '✔️ Поръчка създадена',
    depositPending: '⏳ Очакваме депозит',
    depositPaid: '✅ Депозит платен',
    purchased: '🎉 Авто закупено',
    inDelivery: '🚚 В доставка',
    completed: '✅ Завършено',
    auctionSoon: '⏰ Аукцион скоро',
    priceDropped: '🔻 Цената падна',
    newCar: '🔥 Ново авто за вас',
    settings: '⚙️ Настройки',
    changeLanguage: '🌐 Смени език',
    helpText: `
🚗 <b>BIBI Cars Bot</b>

Този бот ви помага да:
• Следите поръчките си
• Получавате известия за аукциони
• Виждате статуса на доставките
• Свързвате се с мениджъра

Използвайте менюто по-долу.
    `,
    notLinked: '⚠️ Моля, свържете акаунта си първо.',
    linkInstruction: 'Кликнете на бутона в сайта: "Свържи Telegram"',
  },
  en: {
    welcome: '🚗 Welcome to BIBI Cars Bot!',
    chooseLang: 'Choose language / Изберете език:',
    linked: '✅ Your account has been successfully linked!',
    alreadyLinked: '✅ You are already linked to this account.',
    linkError: '❌ Error linking account. Please try again.',
    mainMenu: '🏠 Main Menu',
    myCars: '🚗 My Cars',
    myOrders: '📦 My Orders',
    notifications: '🔔 Notifications',
    website: '🌐 Website',
    manager: '👤 My Manager',
    calculator: '💰 Calculator',
    noOrders: '📭 You have no active orders yet.',
    noCars: '🚗 No cars available.',
    noNotifications: '🔔 No new notifications.',
    back: '⬅️ Back',
    orderStatus: '📦 Order Status',
    details: '📋 Details',
    tracking: '🚚 Tracking',
    contactManager: '📞 Contact Manager',
    managerInfo: '👤 Your Manager:',
    orderCreated: '✔️ Order created',
    depositPending: '⏳ Deposit pending',
    depositPaid: '✅ Deposit paid',
    purchased: '🎉 Car purchased',
    inDelivery: '🚚 In delivery',
    completed: '✅ Completed',
    auctionSoon: '⏰ Auction soon',
    priceDropped: '🔻 Price dropped',
    newCar: '🔥 New car for you',
    settings: '⚙️ Settings',
    changeLanguage: '🌐 Change Language',
    helpText: `
🚗 <b>BIBI Cars Bot</b>

This bot helps you:
• Track your orders
• Get auction notifications
• See delivery status
• Contact your manager

Use the menu below.
    `,
    notLinked: '⚠️ Please link your account first.',
    linkInstruction: 'Click the button on website: "Connect Telegram"',
  },
} as const;

export type Language = 'bg' | 'en';
export type TextKey = keyof typeof BOT_TEXT.bg;

export function t(lang: Language, key: TextKey): string {
  return BOT_TEXT[lang]?.[key] || BOT_TEXT.bg[key] || key;
}

export function getStatusText(lang: Language, status: string): string {
  const statusMap: Record<string, TextKey> = {
    new: 'orderCreated',
    negotiation: 'orderCreated',
    waiting_deposit: 'depositPending',
    deposit_paid: 'depositPaid',
    purchased: 'purchased',
    in_delivery: 'inDelivery',
    completed: 'completed',
  };

  const key = statusMap[status];
  return key ? t(lang, key) : status;
}
