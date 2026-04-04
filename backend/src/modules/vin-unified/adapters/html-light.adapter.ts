/**
 * HTML Light Adapter
 * 
 * Extracts vehicle data using axios + cheerio
 * For simple HTML pages without heavy JavaScript
 */

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { SourceType, DiscoveredSource, ExtractedVehicle } from '../dto/vin.dto';

@Injectable()
export class HtmlLightAdapter {
  private readonly logger = new Logger(HtmlLightAdapter.name);
  type: SourceType = 'html_light';

  async extract(vin: string, source: DiscoveredSource): Promise<ExtractedVehicle | null> {
    try {
      const response = await axios.get(source.url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        validateStatus: (status) => status < 500,
      });

      if (response.status >= 400) {
        this.logger.debug(`[HTMLLight] HTTP ${response.status} from ${source.name}`);
        return null;
      }

      const $ = cheerio.load(response.data);

      // Check for error pages
      const title = $('title').text().toLowerCase();
      if (['404', 'not found', 'error', 'access denied'].some(err => title.includes(err))) {
        return null;
      }

      // Extract data
      const bodyText = $('body').text();

      // Find VIN on page
      const vinMatch = bodyText.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
      const foundVin = vinMatch ? vinMatch[1].toUpperCase() : null;

      // Extract title
      let vehicleTitle = 
        $('.vehicle-title, .lot-title, .car-title, [data-testid="vehicle-title"]').first().text().trim() ||
        $('h1').first().text().trim();

      // Skip spam titles
      if (vehicleTitle && ['auto auctions', 'search results', 'login'].some(spam => vehicleTitle.toLowerCase().includes(spam))) {
        vehicleTitle = '';
      }

      // Extract price
      const priceText = $('.price, .current-bid, [data-price]').first().text();
      const priceMatch = priceText?.replace(/[,$]/g, '').match(/\d+/);
      const price = priceMatch ? parseInt(priceMatch[0], 10) : undefined;

      // Extract images
      const images: string[] = [];
      $('img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && (src.includes('vehicle') || src.includes('lot') || src.includes('photo'))) {
          if (!src.includes('placeholder') && !src.includes('icon') && !src.includes('logo')) {
            images.push(src.startsWith('http') ? src : `https://${source.domain}${src}`);
          }
        }
      });

      // Extract lot number
      const lotMatch = bodyText.match(/lot\s*#?\s*(\d+)/i);
      const lotNumber = lotMatch ? lotMatch[1] : undefined;

      // Extract year/make/model from title
      let year: number | undefined;
      let make: string | undefined;
      let model: string | undefined;

      if (vehicleTitle) {
        const yearMatch = vehicleTitle.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) year = parseInt(yearMatch[0], 10);

        const makes = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'BMW', 'Mercedes', 'Audi', 'Lexus', 'Nissan', 'Hyundai', 'Kia', 'Volkswagen', 'Tesla', 'Porsche'];
        for (const m of makes) {
          if (vehicleTitle.toLowerCase().includes(m.toLowerCase())) {
            make = m;
            break;
          }
        }
      }

      // Extract mileage
      const mileageMatch = bodyText.match(/(\d{1,3},?\d{3})\s*(miles?|mi|km)/i);
      const mileage = mileageMatch ? parseInt(mileageMatch[1].replace(/,/g, ''), 10) : undefined;

      // Extract damage
      let damageType: string | undefined;
      const damageKeywords = ['front end', 'rear end', 'side', 'flood', 'fire', 'mechanical', 'hail'];
      for (const kw of damageKeywords) {
        if (bodyText.toLowerCase().includes(kw)) {
          damageType = kw;
          break;
        }
      }

      // Extract location
      const locationMatch = bodyText.match(/location[:\s]+([^,\n]+,\s*[A-Z]{2})/i);
      const location = locationMatch ? locationMatch[1] : undefined;

      // Extract sale date
      let saleDate: Date | undefined;
      const dateMatch = bodyText.match(/sale\s*date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
      if (dateMatch) {
        const parsed = new Date(dateMatch[1]);
        if (!isNaN(parsed.getTime())) saleDate = parsed;
      }

      // Calculate confidence
      let confidence = 0.3;
      if (foundVin === vin.toUpperCase()) confidence += 0.4;
      if (price) confidence += 0.1;
      if (images.length > 0) confidence += 0.1;
      if (vehicleTitle) confidence += 0.1;

      return {
        vin: foundVin || vin.toUpperCase(),
        title: vehicleTitle || undefined,
        year,
        make,
        model,
        lotNumber,
        location,
        saleDate,
        price,
        images: images.slice(0, 10),
        damageType,
        mileage,
        source: source.name,
        sourceUrl: source.url,
        sourceTier: source.tier,
        confidence,
        extractedAt: new Date(),
        responseTime: 0,
      };

    } catch (error: any) {
      this.logger.warn(`[HTMLLight] Error from ${source.name}: ${error.message}`);
      return null;
    }
  }
}
