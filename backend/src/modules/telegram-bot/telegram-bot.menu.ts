/**
 * BIBI Cars Telegram Bot - Menu Builder
 * 
 * Inline keyboard menus for the bot
 */

import { t, Language } from './telegram-bot.i18n';

const SITE_URL = process.env.PUBLIC_SITE_URL || 'https://vin-core-layer.preview.emergentagent.com';

export function mainMenu(lang: Language) {
  return {
    inline_keyboard: [
      [
        { text: t(lang, 'myCars'), callback_data: 'my_cars' },
        { text: t(lang, 'myOrders'), callback_data: 'my_orders' },
      ],
      [
        { text: t(lang, 'notifications'), callback_data: 'notifications' },
        { text: t(lang, 'calculator'), callback_data: 'calculator' },
      ],
      [
        { text: t(lang, 'manager'), callback_data: 'contact_manager' },
      ],
      [
        { text: t(lang, 'website'), url: SITE_URL },
      ],
      [
        { text: t(lang, 'settings'), callback_data: 'settings' },
      ],
    ],
  };
}

export function languageMenu() {
  return {
    inline_keyboard: [
      [{ text: '🇧🇬 Български', callback_data: 'lang_bg' }],
      [{ text: '🇬🇧 English', callback_data: 'lang_en' }],
    ],
  };
}

export function backMenu(lang: Language) {
  return {
    inline_keyboard: [
      [{ text: t(lang, 'back'), callback_data: 'main_menu' }],
    ],
  };
}

export function settingsMenu(lang: Language) {
  return {
    inline_keyboard: [
      [{ text: t(lang, 'changeLanguage'), callback_data: 'change_language' }],
      [{ text: t(lang, 'back'), callback_data: 'main_menu' }],
    ],
  };
}

export function orderMenu(lang: Language, orderId: string) {
  return {
    inline_keyboard: [
      [
        { text: t(lang, 'details'), callback_data: `order_details_${orderId}` },
        { text: t(lang, 'tracking'), callback_data: `order_tracking_${orderId}` },
      ],
      [{ text: t(lang, 'back'), callback_data: 'my_orders' }],
    ],
  };
}

export function ordersListMenu(lang: Language, orders: any[]) {
  const buttons = orders.slice(0, 10).map((order: any) => {
    const id = order.id || order._id;
    const vin = order.vin ? order.vin.slice(-6) : 'N/A';
    const status = order.status || 'new';
    const statusIcon = getStatusIcon(status);
    
    return [{ 
      text: `${statusIcon} ${vin} - ${order.vehicleTitle || order.title || 'Auto'}`.slice(0, 40),
      callback_data: `order_${id}` 
    }];
  });

  buttons.push([{ text: t(lang, 'back'), callback_data: 'main_menu' }]);

  return { inline_keyboard: buttons };
}

export function carsListMenu(lang: Language, cars: any[]) {
  const buttons = cars.slice(0, 10).map((car: any) => {
    const id = car.vehicleId || car.id || car._id;
    const title = car.vehicleTitle || car.title || 'Auto';
    
    return [{ 
      text: `🚗 ${title}`.slice(0, 40),
      callback_data: `car_${id}` 
    }];
  });

  buttons.push([{ text: t(lang, 'back'), callback_data: 'main_menu' }]);

  return { inline_keyboard: buttons };
}

export function notificationsMenu(lang: Language, notifications: any[]) {
  const buttons = notifications.slice(0, 5).map((n: any) => {
    const icon = getNotificationIcon(n.type);
    const title = n.title || n.type;
    
    return [{ 
      text: `${icon} ${title}`.slice(0, 40),
      callback_data: `notification_${n.id || n._id}` 
    }];
  });

  buttons.push([{ text: t(lang, 'back'), callback_data: 'main_menu' }]);

  return { inline_keyboard: buttons };
}

function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    new: '📝',
    negotiation: '💬',
    waiting_deposit: '⏳',
    deposit_paid: '✅',
    purchased: '🎉',
    in_delivery: '🚚',
    completed: '🏁',
    cancelled: '❌',
  };
  return icons[status] || '📦';
}

function getNotificationIcon(type: string): string {
  const icons: Record<string, string> = {
    auction_soon: '⏰',
    price_drop: '🔻',
    deal_status_changed: '📦',
    listing_sold: '❌',
    recommendation: '🔥',
    new_lead: '🔔',
  };
  return icons[type] || '🔔';
}

export function getDeepLink(botUsername: string, customerId: string): string {
  return `https://t.me/${botUsername}?start=customer_${customerId}`;
}
