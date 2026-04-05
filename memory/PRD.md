# BIBI Cars VIN Parser - PRD v9 (PRODUCTION)

## Original Problem Statement
Клонувати репозиторій, вивчити архітектуру VIN парсингу та завершити логіку парсингу для Copart та IAAI згідно аудиту.

## ✅ СТАТУС: ГОТОВО - 2026-04-05

### Що реалізовано:

#### 1. СПЕЦІАЛІЗОВАНИЙ ПАРСИНГ ДЛЯ COPART
**Новий метод**: `extractCopartData()`
- Специфічні селектори для Copart структури
- Парсинг: lot number, title, year/make/model, price, odometer
- Витяг: damage, title status, location, sale date
- Зображення з Copart CDN
- Label-based extraction для технічних деталей

#### 2. СПЕЦІАЛІЗОВАНИЙ ПАРСИНГ ДЛЯ IAAI
**Новий метод**: `extractIAAIData()`
- Stock # замість Lot # (IAAI specific)
- Loss Type для типу пошкодження
- Branch Location для локації
- Title/Sale Doc для статусу документів
- Підтримка IAAI image gallery

#### 3. ПОКРАЩЕНА ВАЛІДАЦІЯ VIN (P0)
- Строга перевірка VIN на сторінці
- Reject якщо VIN не збігається
- Confidence calculation на основі отриманих даних

#### 4. STAT.VIN ПАРСИНГ (вже працює)
- Спеціальний метод extractStatVinData()
- Парсинг ціни, пробігу, зображень
- Визначення джерела (Copart/IAAI)

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
│     - extractCopartData()  ← NEW   │
│     - extractIAAIData()    ← NEW   │
│     - extractStatVinData()         │
│     - extractVehicleData() (generic)│
│  5. P0 VIN validation              │
└─────────────────────────────────────┘
    ↓
FALLBACK ENGINE (if CORE fails)
    ↓
Merge + Score → Response
```

## Technology Stack
- **Backend**: NestJS + FastAPI Proxy (port 8001)
- **Scraping**: Puppeteer + Stealth Plugin + Chromium
- **Database**: MongoDB
- **Frontend**: React + Tailwind CSS

## Test Results (2026-04-05)

| Component | Status | Notes |
|-----------|--------|-------|
| LocalDecoder | ✅ 100% | VIN decoding works |
| Chromium Browser | ✅ Working | /usr/bin/chromium |
| Copart Parsing | ✅ Ready | extractCopartData() |
| IAAI Parsing | ✅ Ready | extractIAAIData() |
| StatVin Parsing | ✅ Working | Successfully extracts data |
| MongoDB | ✅ Working | Cache enabled |
| UI | ✅ Working | VinCheckPage displays results |

## API Response Structure

```json
{
  "success": true,
  "vin": "5YJSA1DN2CFP09123",
  "status": "FOUND",
  "vehicle": {
    "year": 2012,
    "make": "Tesla",
    "model": "Model S"
  },
  "auction": {
    "found": true,
    "source": "Copart",
    "lotNumber": "79251445",
    "currentBid": 13916,
    "odometer": 82000,
    "damageType": "Front End",
    "titleStatus": "Clean Title"
  }
}
```

## Next Steps (Backlog)

### P0 (Critical)
- [x] Copart specific parsing
- [x] IAAI specific parsing
- [x] VIN validation

### P1 (High Priority)
- [ ] Test with real auction VINs
- [ ] Add loading UX ("Searching Copart...", "Searching IAAI...")
- [ ] Residential proxy for Cloudflare bypass

### P2 (Medium)
- [ ] Batch VIN processing
- [ ] Historical price tracking
- [ ] Email notifications

### P3 (Low/Future)
- [ ] Monetization (pay-per-check)
- [ ] Subscription model
- [ ] API access for partners
