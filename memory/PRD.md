# BIBI Cars VIN Parser - PRD v10 (PRODUCTION)

## Original Problem Statement
Клонувати репозиторій, вивчити архітектуру VIN парсингу та завершити логіку парсингу для Copart та IAAI.

## ✅ СТАТУС: ГОТОВО - 2026-04-05

### Що реалізовано:

#### 1. ПАРСИНГ STAT.VIN (основне джерело)
**Покращений метод**: `extractStatVinData()`
- Мультимовна підтримка (парсинг за значеннями, не за лейблами)
- Парсинг всіх цін на сторінці ($)
- Пошук damage types за ключовими словами
- Пошук title status за ключовими словами
- Пошук location за US city pattern
- 17+ зображень з CDN

#### 2. СПЕЦІАЛІЗОВАНИЙ ПАРСИНГ ДЛЯ COPART
**Метод**: `extractCopartData()`
- Lot number, title, year/make/model
- Price, odometer, damage
- Title status, location, sale date
- Зображення з Copart CDN

#### 3. СПЕЦІАЛІЗОВАНИЙ ПАРСИНГ ДЛЯ IAAI
**Метод**: `extractIAAIData()`
- Stock # (IAAI specific)
- Loss Type для типу пошкодження
- Branch Location
- Title/Sale Doc
- IAAI image gallery

#### 4. ПОКРАЩЕНА MERGE ЛОГІКА
- StatVin тепер включено в auction sources
- Використовується auctionSource поле для визначення джерела
- retailValue тепер передається як buyNowPrice

## Тестування VIN: 5NPLS4AGXMH020498

**Результат API:**
```json
{
  "status": "FOUND",
  "vehicle": {
    "year": 2021,
    "make": "Hyundai",
    "model": "ELANTRA"
  },
  "auction": {
    "found": true,
    "source": "IAAI",
    "currentBid": 1700,
    "buyNowPrice": 13313,
    "damageType": "Side",
    "secondaryDamage": "Suspension",
    "odometer": 78360,
    "titleStatus": "Non-Repairable (Florida)",
    "location": "West Palm Beach (FL)",
    "images": 17
  }
}
```

## Architecture

```
VIN Request
    ↓
Cache Check
    ↓
LocalDecoder (VIN → Year/Make/Model)
    ↓
Smart Orchestrator (tiered execution)
    ↓
┌─────────────────────────────────────┐
│ STEALTH ADAPTER (per source)       │
│  1. Navigate to SEARCH page        │
│  2. Find LOT PAGE link             │
│  3. Navigate to LOT PAGE           │
│  4. Domain-specific extraction:    │
│     - extractStatVinData()  ← MAIN │
│     - extractCopartData()          │
│     - extractIAAIData()            │
│     - extractVehicleData() (generic)│
│  5. P0 VIN validation              │
└─────────────────────────────────────┘
    ↓
MERGE SERVICE (combine results)
    ↓
Response
```

## Technology Stack
- **Backend**: NestJS + FastAPI Proxy (port 8001)
- **Scraping**: Puppeteer + Stealth Plugin + Chromium
- **Database**: MongoDB
- **Frontend**: React + Tailwind CSS

## Next Steps (Backlog)

### P1 (High Priority)
- [ ] Lot number extraction (потребує lot URL)
- [ ] Proxy rotation для обходу geo-блокування
- [ ] Loading UX ("Searching Copart...", "Searching IAAI...")

### P2 (Medium)
- [ ] Batch VIN processing
- [ ] Historical price tracking
- [ ] Email notifications

### P3 (Low/Future)
- [ ] Direct Copart/IAAI scraping (потребує auth)
- [ ] Monetization (pay-per-check)
- [ ] Subscription model
