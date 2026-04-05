"""
BidMotors.bg Bulk Scraper
Extracts entire vehicle database from sitemaps.

Strategy:
  Phase 1: Parse sitemap XMLs -> extract URLs -> extract VIN/make/model/year from URL pattern
  Phase 2: On-demand page scraping for detailed data (lot, damage, price, images)
"""

import re
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from xml.etree import ElementTree as ET

import httpx
from pymongo import MongoClient, UpdateOne
import os

logger = logging.getLogger("BulkScraper")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
COLLECTION = "bidmotors_vehicles"

SITEMAP_INDEX_URL = "https://bidmotors.bg/sitemap.xml"

VIN_REGEX = re.compile(r"[A-HJ-NPR-Z0-9]{17}", re.IGNORECASE)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/xml, text/xml, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
}


def get_db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


def ensure_indexes():
    db = get_db()
    col = db[COLLECTION]
    col.create_index("vin")
    col.create_index("url", unique=True)
    col.create_index("sitemap_category")
    col.create_index("year")
    col.create_index("make")
    col.create_index([("make", 1), ("model", 1)])


class ScraperState:
    def __init__(self):
        self.reset()

    def reset(self):
        self.running = False
        self.phase = "idle"
        self.total_sitemaps = 0
        self.processed_sitemaps = 0
        self.total_urls = 0
        self.total_vehicles_saved = 0
        self.errors = []
        self.started_at = None
        self.finished_at = None
        self.current_sitemap = ""

    def to_dict(self):
        return {
            "running": self.running,
            "phase": self.phase,
            "total_sitemaps": self.total_sitemaps,
            "processed_sitemaps": self.processed_sitemaps,
            "total_urls": self.total_urls,
            "total_vehicles_saved": self.total_vehicles_saved,
            "errors_count": len(self.errors),
            "last_errors": self.errors[-5:],
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "current_sitemap": self.current_sitemap,
            "elapsed_seconds": (
                round((datetime.now(timezone.utc) - self.started_at).total_seconds(), 1)
                if self.started_at and not self.finished_at
                else None
            ),
        }


state = ScraperState()


def parse_vehicle_from_url(url: str) -> Optional[dict]:
    """Extract VIN, make, model, year from bidmotors.bg URL slug."""
    path = url.replace("https://bidmotors.bg/", "").replace("http://bidmotors.bg/", "")

    if not path:
        return None

    is_in_stock = False
    if path.startswith("cars-in-stock/"):
        path = path[len("cars-in-stock/"):]
        is_in_stock = True

    # Skip non-vehicle paths
    if "/" in path:
        return None
    skip_prefixes = ("catalogue", "en", "carfaxes", "favourites", "blog", "about", "contacts", "terms", "privacy")
    if path.lower() in skip_prefixes:
        return None

    slug = path.lower().strip()
    parts = slug.split("-")

    # Find VIN (17 alphanumeric chars)
    vin = None
    vin_match = VIN_REGEX.search(slug.upper())
    if vin_match:
        vin = vin_match.group(0).upper()

    # Find year: 4-digit number between 1980-2027
    year = None
    year_idx = None
    for i, p in enumerate(parts):
        if re.fullmatch(r"\d{4}", p):
            y = int(p)
            if 1980 <= y <= 2027:
                year = y
                year_idx = i
                break

    # Extract make/model from parts before year
    make = None
    model = None
    trim = None

    if year_idx is not None and year_idx >= 1:
        make = parts[0]
        if year_idx >= 2:
            model = parts[1]
        if year_idx >= 3:
            trim = "-".join(parts[2:year_idx])
    elif len(parts) >= 2:
        make = parts[0]
        model = parts[1]

    if not make:
        return None

    return {
        "vin": vin,
        "make": make,
        "model": model,
        "trim": trim if trim else None,
        "year": year,
        "url": url,
        "is_in_stock": is_in_stock,
    }


def parse_sitemap_xml(xml_text: str, tag: str = "url") -> list[dict]:
    """Parse sitemap XML, handling namespaces automatically."""
    root = ET.fromstring(xml_text)

    # Auto-detect namespace
    ns = ""
    if root.tag.startswith("{"):
        ns = root.tag.split("}")[0] + "}"

    results = []
    for elem in root.findall(f"{ns}{tag}"):
        loc = elem.find(f"{ns}loc")
        lastmod = elem.find(f"{ns}lastmod")
        if loc is not None and loc.text:
            results.append({
                "url": loc.text.strip(),
                "lastmod": lastmod.text.strip() if lastmod is not None and lastmod.text else None,
            })
    return results


def categorize_sitemap(sitemap_url: str) -> str:
    name = sitemap_url.split("/")[-1].lower()
    if "in-stock" in name:
        return "in-stock"
    if "products-new" in name:
        return "new"
    if "products-middle" in name:
        return "middle"
    if "products-old" in name:
        return "old"
    return "other"


async def fetch_xml(client: httpx.AsyncClient, url: str) -> Optional[str]:
    for attempt in range(3):
        try:
            resp = await client.get(url, timeout=30)
            if resp.status_code == 200:
                text = resp.text
                if text.strip().startswith("<?xml") or text.strip().startswith("<"):
                    return text
                logger.warning(f"Non-XML response from {url}")
                return None
            logger.warning(f"HTTP {resp.status_code} for {url}")
        except Exception as e:
            logger.warning(f"Attempt {attempt+1} failed for {url}: {e}")
            await asyncio.sleep(1 * (attempt + 1))
    return None


async def scrape_sitemap(
    client: httpx.AsyncClient, sitemap_url: str, category: str, db
) -> int:
    state.current_sitemap = sitemap_url.split("/")[-1]

    xml = await fetch_xml(client, sitemap_url)
    if not xml:
        state.errors.append(f"Failed to fetch {sitemap_url}")
        return 0

    try:
        url_entries = parse_sitemap_xml(xml, "url")
    except ET.ParseError as e:
        state.errors.append(f"XML parse error {sitemap_url}: {e}")
        return 0

    vehicles = []
    for entry in url_entries:
        try:
            parsed = parse_vehicle_from_url(entry["url"])
            if parsed and parsed.get("make"):
                parsed["sitemap_category"] = category
                parsed["last_modified"] = entry.get("lastmod")
                parsed["scraped_at"] = datetime.now(timezone.utc).isoformat()
                parsed["detail_scraped"] = False
                vehicles.append(parsed)
        except Exception:
            pass

    state.total_urls += len(url_entries)

    if vehicles:
        col = db[COLLECTION]
        ops = [
            UpdateOne({"url": v["url"]}, {"$set": v}, upsert=True)
            for v in vehicles
        ]
        try:
            result = col.bulk_write(ops, ordered=False)
            saved = result.upserted_count + result.modified_count
            state.total_vehicles_saved += saved
            return saved
        except Exception as e:
            state.errors.append(f"MongoDB error: {e}")
            return 0

    return 0


async def run_bulk_scrape(
    categories: list[str] = None,
    max_sitemaps: int = 0,
):
    if state.running:
        return

    state.reset()
    state.running = True
    state.phase = "fetching_index"
    state.started_at = datetime.now(timezone.utc)

    ensure_indexes()
    db = get_db()

    try:
        async with httpx.AsyncClient(
            headers=HEADERS,
            follow_redirects=True,
        ) as client:
            logger.info("Fetching sitemap index...")
            index_xml = await fetch_xml(client, SITEMAP_INDEX_URL)
            if not index_xml:
                state.errors.append("Failed to fetch sitemap index")
                state.phase = "error"
                return

            all_sitemaps = parse_sitemap_xml(index_xml, "sitemap")
            logger.info(f"Found {len(all_sitemaps)} sitemaps in index")

            product_sitemaps = []
            for sm in all_sitemaps:
                cat = categorize_sitemap(sm["url"])
                if cat == "other":
                    continue
                if categories and cat not in categories:
                    continue
                product_sitemaps.append({"url": sm["url"], "category": cat})

            if max_sitemaps > 0:
                product_sitemaps = product_sitemaps[:max_sitemaps]

            state.total_sitemaps = len(product_sitemaps)
            state.phase = "scraping_sitemaps"
            logger.info(f"Processing {len(product_sitemaps)} product sitemaps...")

            batch_size = 5
            for i in range(0, len(product_sitemaps), batch_size):
                if not state.running:
                    state.phase = "stopped"
                    break

                batch = product_sitemaps[i : i + batch_size]
                tasks = [
                    scrape_sitemap(client, sm["url"], sm["category"], db)
                    for sm in batch
                ]
                await asyncio.gather(*tasks, return_exceptions=True)
                state.processed_sitemaps += len(batch)

                await asyncio.sleep(0.3)

            if state.running:
                state.phase = "completed"
            logger.info(
                f"Bulk scrape done: {state.total_vehicles_saved} vehicles "
                f"from {state.processed_sitemaps}/{state.total_sitemaps} sitemaps"
            )

    except Exception as e:
        state.phase = "error"
        state.errors.append(f"Fatal: {e}")
        logger.error(f"Bulk scrape error: {e}", exc_info=True)
    finally:
        state.running = False
        state.finished_at = datetime.now(timezone.utc)


def get_stats() -> dict:
    db = get_db()
    col = db[COLLECTION]
    total = col.count_documents({})

    pipeline = [
        {"$group": {"_id": "$sitemap_category", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    by_category = {doc["_id"]: doc["count"] for doc in col.aggregate(pipeline)}

    pipeline_makes = [
        {"$group": {"_id": "$make", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20},
    ]
    top_makes = {doc["_id"]: doc["count"] for doc in col.aggregate(pipeline_makes)}

    pipeline_years = [
        {"$match": {"year": {"$ne": None}}},
        {"$group": {"_id": "$year", "count": {"$sum": 1}}},
        {"$sort": {"_id": -1}},
        {"$limit": 15},
    ]
    by_year = {str(doc["_id"]): doc["count"] for doc in col.aggregate(pipeline_years)}

    with_vin = col.count_documents({"vin": {"$ne": None}})

    return {
        "total_vehicles": total,
        "with_vin": with_vin,
        "without_vin": total - with_vin,
        "by_category": by_category,
        "top_makes": top_makes,
        "by_year": by_year,
    }


def search_vehicles(
    make: str = None,
    model: str = None,
    year: int = None,
    vin: str = None,
    category: str = None,
    page: int = 1,
    limit: int = 50,
) -> dict:
    db = get_db()
    col = db[COLLECTION]

    query = {}
    if make:
        query["make"] = {"$regex": make, "$options": "i"}
    if model:
        query["model"] = {"$regex": model, "$options": "i"}
    if year:
        query["year"] = year
    if vin:
        query["vin"] = vin.upper()
    if category:
        query["sitemap_category"] = category

    total = col.count_documents(query)
    skip = (page - 1) * limit

    vehicles = list(
        col.find(query, {"_id": 0})
        .sort([("year", -1), ("make", 1)])
        .skip(skip)
        .limit(limit)
    )

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if total > 0 else 0,
        "vehicles": vehicles,
    }
