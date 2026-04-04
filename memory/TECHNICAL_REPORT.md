# VIN Parser - Technical Implementation Report
# Date: 2026-04-04
# Status: WORKING

## ============================================
## 1. REPOSITORY & SETUP
## ============================================

# Cloned from:
git clone https://github.com/nnamedao-a11y/34434fffff

# Stack:
# - Backend: NestJS (TypeScript) port 8001
# - Frontend: React port 3000
# - Database: MongoDB
# - Scraping: Puppeteer + Stealth Plugin

## ============================================
## 2. PROBLEMS SOLVED
## ============================================

### PROBLEM 1: NHTSA API was being used
# Solution: Removed completely, created LocalVinDecoder

# Deleted file:
rm /app/backend/src/modules/vin-unified/adapters/nhtsa.adapter.ts

# Created new file:
# /app/backend/src/modules/vin-unified/adapters/local-decoder.adapter.ts
# - WMI database (50+ manufacturers)
# - Year decode from VIN position 10
# - Instant decode without external requests

### PROBLEM 2: headless_shell was detected by Cloudflare
# Solution: Installed full Chromium

apt-get install -y chromium
# Result: /usr/bin/chromium (Chromium 146.0.7680.177)

# Changed in stealth.adapter.ts:
# FROM: const BROWSER_PATH = '/pw-browsers/chromium_headless_shell-1208/chrome-linux/headless_shell';
# TO:   const BROWSER_PATH = '/usr/bin/chromium';

### PROBLEM 3: Promise.race was cutting off results before completion
# File: /app/backend/src/modules/vin-unified/extraction/extraction.service.ts

# FROM:
const { results, meta } = await Promise.race([
  lightStealthPromise,
  new Promise((resolve) => setTimeout(() => resolve({ results: [], meta: [] }), stealthTimeout + 5000)),
]);

# TO:
const { results, meta } = await this.runWithConcurrencyAndMetadata(
  [...grouped.light, ...grouped.stealth],
  vin,
  maxConcurrency,
  (source) => source.type === 'stealth' ? stealthTimeout : baseTimeout,
  maxRetries,
);

### PROBLEM 4: Scraping was skipped when LocalDecoder found data
# File: /app/backend/src/modules/vin-unified/vin-unified.service.ts

# FROM:
if (sources.length > 0 && (!localResult || !options?.quick))

# TO:
if (sources.length > 0 && !options?.quick)  // Always try scraping

### PROBLEM 5: skipCache parameter not passed to service
# File: /app/backend/src/modules/vin-unified/vin-unified.controller.ts

# Added:
@Get('resolve')
async resolve(
  @Query('vin') vin: string,
  @Query('skipCache') skipCache?: string,  // <-- Added
): Promise<VinResolveResponseDto> {
  return this.vinService.resolve(cleanVin, {
    skipCache: skipCache === 'true',  // <-- Added
  });
}

## ============================================
## 3. KEY FILES MODIFIED
## ============================================

/app/backend/src/modules/vin-unified/
├── adapters/
│   ├── adapter.registry.ts      # Changed: PlaywrightStealth -> StealthAdapter
│   ├── stealth.adapter.ts       # Modified: Full Chromium, aggressive extraction
│   ├── local-decoder.adapter.ts # NEW: WMI database decoder
│   └── nhtsa.adapter.ts         # DELETED
├── discovery/
│   └── discovery.service.ts     # Modified: Removed NHTSA, updated sources
├── extraction/
│   └── extraction.service.ts    # Modified: Removed Promise.race timeout
├── dto/
│   └── vin.dto.ts               # Modified: Removed 'nhtsa' from SourceType
├── vin-unified.module.ts        # Modified: StealthAdapter instead of Playwright
├── vin-unified.service.ts       # Modified: Always try scraping
└── vin-unified.controller.ts    # Modified: Added skipCache parameter

## ============================================
## 4. API ENDPOINTS
## ============================================

# Main resolve (with scraping)
GET /api/vin-unified/resolve?vin=5YJSA1DN2CFP09123&skipCache=true

# Quick resolve (LocalDecoder only)
GET /api/vin-unified/quick?vin=5YJSA1DN2CFP09123

# Param-based resolve
GET /api/vin-unified/5YJSA1DN2CFP09123

# Create lead from VIN
POST /api/vin-unified/lead
Content-Type: application/json
{
  "vin": "5YJSA1DN2CFP09123",
  "firstName": "Test",
  "phone": "+380991234567"
}

## ============================================
## 5. WORKING TEST RESULT
## ============================================

curl "http://localhost:8002/api/vin-unified/resolve?vin=5YJSA1DN2CFP09123&skipCache=true"

# Response:
{
  "success": true,
  "vin": "5YJSA1DN2CFP09123",
  "status": "FOUND",
  "searchDurationMs": 126497,
  "fromCache": false,
  "vehicle": {
    "year": 2012,
    "make": "Tesla",
    "model": "Model S",
    "confidence": "probable",
    "source": "cache"
  },
  "auction": {
    "found": true,
    "lotNumber": "79251445",
    "currentBid": 13916,
    "damageType": "Keys available",
    "odometer": 14431,
    "source": "Copart",
    "confidence": "confirmed"
  },
  "history": {
    "found": false,
    "confidence": "unavailable"
  },
  "shipping": {
    "found": false,
    "confidence": "unavailable"
  },
  "sources": [
    {"name": "LocalDecoder", "type": "json", "tier": 3, "success": true, "responseTime": 1},
    {"name": "Copart", "type": "stealth", "tier": 1, "success": true, "responseTime": 21457},
    {"name": "AutoBidMaster", "type": "stealth", "tier": 2, "success": true, "responseTime": 81960},
    {"name": "IAAI", "type": "stealth", "tier": 1, "success": false, "responseTime": 126372},
    {"name": "BidFax", "type": "stealth", "tier": 2, "success": false, "responseTime": 118175}
  ],
  "confidence": {
    "overall": 0.85,
    "vehicleLayer": "probable",
    "auctionLayer": "confirmed",
    "historyLayer": "unavailable",
    "shippingLayer": "unavailable"
  }
}

## ============================================
## 6. SOURCE STATUS
## ============================================

# WORKING (Cloudflare bypassed):
✅ Copart          - HTTP 200, data extracted (21 sec)
✅ AutoBidMaster   - HTTP 200, data extracted (82 sec)
✅ LocalDecoder    - Instant (1ms)

# PARTIAL (slow/inconsistent):
⚠️ IAAI            - HTTP 200, but timeout
⚠️ SalvageReseller - Cloudflare challenge, sometimes passes

# BLOCKED (Cloudflare challenge not solved):
❌ BidFax.info     - 403 Forbidden
❌ Poctra.com      - 403 Forbidden  
❌ StatVin         - 404 Not Found

## ============================================
## 7. STEALTH ADAPTER CONFIG
## ============================================

# Browser launch args (stealth.adapter.ts):
const args = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-web-security',
  '--window-size=1920,1080',
  '--start-maximized',
  '--disable-infobars',
  '--no-first-run',
  '--no-default-browser-check',
  '--ignore-certificate-errors',
  '--lang=en-US,en',
  '--user-data-dir=/tmp/chromium-user-data-' + Date.now(),
];

# Stealth features enabled:
- puppeteer-extra-plugin-stealth
- User-Agent rotation (Chrome/Firefox/Edge)
- WebGL vendor/renderer spoofing
- Navigator properties masking
- Mouse movement simulation
- Random scroll behavior

## ============================================
## 8. EXTRACTION LOGIC (stealth.adapter.ts)
## ============================================

# Vehicle data extraction patterns:
const yearPattern = /\b(19[89]\d|20[0-2]\d)\b\s+(TESLA|TOYOTA|...)/i;
const lotPatterns = [/Lot\s*#?\s*(\d{7,9})/i, /(\d{7,9})\s*Watch/i];
const pricePatterns = [/retail\s*value[:\s]*\$?([\d,]+)/i, /current\s*bid[:\s]*\$?([\d,]+)/i];
const mileagePatterns = [/Odometer[:\s]*(\d{1,3},?\d{3})/i];
const damagePatterns = [/(Front End|Rear End|Side|Flood|Fire|Mechanical)/i];

# Confidence calculation:
let confidence = 0.4;  // Base
if (foundVin === targetVin) confidence += 0.2;
if (price) confidence += 0.1;
if (images.length > 0) confidence += 0.05;
if (title || year && make) confidence += 0.15;
if (lotNumber) confidence += 0.1;
// Max: 1.0

## ============================================
## 9. REMAINING ISSUES
## ============================================

# 1. VIN validation in extraction
# Problem: AutoBidMaster returns wrong vehicles (search results, not exact VIN match)
# Solution needed: Strict VIN check on extracted data

# 2. Cloudflare bypass for BidFax/Poctra
# Problem: These sources have stronger Cloudflare protection
# Solution options:
#   - FlareSolverr container
#   - Residential proxy
#   - Captcha solving service

# 3. Performance
# Problem: Full scraping takes 120+ seconds
# Solution needed: 
#   - Parallel browser tabs
#   - Better source prioritization
#   - Early return when high-confidence data found

## ============================================
## 10. COMMANDS FOR TESTING
## ============================================

# Restart backend:
sudo supervisorctl restart backend

# Clear VIN cache:
mongosh mongodb://localhost:27017/bibi_crm --eval "db.vincaches.deleteMany({})"

# Test VIN resolve:
curl -s "http://localhost:8002/api/vin-unified/resolve?vin=5YJSA1DN2CFP09123&skipCache=true"

# Quick resolve (no scraping):
curl -s "http://localhost:8002/api/vin-unified/quick?vin=5YJSA1DN2CFP09123"

# Check logs:
tail -f /var/log/supervisor/backend.out.log | grep -i "stealth\|copart\|extraction"

# Manual Puppeteer test:
cd /app/backend && node -e "
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.goto('https://www.copart.com/lotSearchResults?free=true&query=5YJSA1DN2CFP09123');
  const title = await page.title();
  console.log('Title:', title);
  await browser.close();
})();
"
