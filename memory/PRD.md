# BIBI Cars VIN Parser - PRD v11 (PRODUCTION)

## Original Problem Statement
Клонувати репозиторій, вивчити архітектуру VIN парсингу, завершити логіку парсингу для Copart/IAAI, додати конкурентів як джерела.

## ✅ СТАТУС: ГОТОВО - 2026-04-05

### Що реалізовано:

#### 1. ПАРСИНГ STAT.VIN (основне джерело)
- Мультимовна підтримка (парсинг за значеннями, не за лейблами)
- Парсинг всіх цін, damage types, title status
- 17+ зображень з CDN

#### 2. COPART/IAAI ПАРСИНГ  
- Спеціалізовані методи extractCopartData(), extractIAAIData()
- Puppeteer + Stealth для обходу Cloudflare

#### 3. BIDMOTORS.BG (НОВИЙ КОНКУРЕНТ)
**Метод**: `extractBidMotorsData()`
- Пошук через каталог: `/catalogue?q={VIN}`
- Перехід на сторінку авто з VIN в URL
- Парсинг болгарською: Търг №, Щета, Пробег, Състояние
- Визначення auction source (Copart/IAAI) з images
- Ціни в USD/EUR
- Без Cloudflare - швидкий парсинг

#### 4. АРХІТЕКТУРА ТІЄРІВ

```
Tier 1 (0ms delay):
  - LocalDecoder
  - Copart
  - IAAI  
  - CopartDirect

Tier 2 (9s delay):
  - StatVin
  - AutoBidMaster
  - SalvageReseller
  - BidMotors ← NEW (competitor)

Tier 3 (22.5s delay):
  - BidFax
  - Poctra
  - VehicleHistory
```

## Тестування

### VIN: 5FRYD7H73HB001950 (2017 Acura MDX)
```
Status: FOUND
Vehicle: 2017 MDX SPORT HYBRID
Auction: IAAI
Price: $6,600
Odometer: 82,828 km
```

### VIN: WA1LXAF71MD017482 (2021 Audi Q7)
```
Status: FOUND  
Vehicle: 2021 Audi Q7
Auction: IAAI
Price: $6,975
Odometer: 117,673 km
Images: 14
```

### VIN: 5NPLS4AGXMH020498 (2021 Hyundai Elantra)
```
Status: FOUND
Auction: IAAI
Price: $1,700
Odometer: 78,360 mi
Damage: Side + Suspension
Title: Non-Repairable (Florida)
```

## Technology Stack
- **Backend**: NestJS + FastAPI Proxy (port 8001)
- **Scraping**: Puppeteer + Stealth Plugin + Chromium
- **Database**: MongoDB
- **Frontend**: React + Tailwind CSS

## Джерела-конкуренти (для масштабування)

| Сайт | Тип | Cloudflare | Статус |
|------|-----|------------|--------|
| bidmotors.bg | competitor | No | ✅ Ready |
| (наступні 50+) | competitor | TBD | Backlog |

## Next Steps (Backlog)

### P1 (High Priority)
- [ ] Додати більше конкурентів (за списком)
- [ ] Lot number extraction з BidMotors
- [ ] Proxy rotation для geo-блокування

### P2 (Medium)
- [ ] Batch VIN processing
- [ ] Моніторинг конкурентів (ціни, наявність)
- [ ] Email notifications

### P3 (Low/Future)
- [ ] Direct Copart/IAAI scraping (auth)
- [ ] Monetization
- [ ] API access for partners
