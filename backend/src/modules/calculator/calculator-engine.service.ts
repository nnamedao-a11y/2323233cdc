/**
 * Calculator Engine Service
 * 
 * Основний движок розрахунку вартості доставки авто
 * Читає config з БД → рахує breakdown → повертає totals
 */

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CalculatorProfile, CalculatorProfileDocument } from './schemas/calculator-profile.schema';
import { RouteRate, RouteRateDocument } from './schemas/route-rate.schema';
import { AuctionFeeRule, AuctionFeeRuleDocument } from './schemas/auction-fee-rule.schema';
import { Quote, QuoteDocument } from './schemas/quote.schema';
import { CalculateDeliveryDto, CreateQuoteDto } from './dto/calculate-delivery.dto';

@Injectable()
export class CalculatorEngineService {
  private readonly logger = new Logger(CalculatorEngineService.name);

  constructor(
    @InjectModel(CalculatorProfile.name)
    private readonly profileModel: Model<CalculatorProfileDocument>,
    @InjectModel(RouteRate.name)
    private readonly routeRateModel: Model<RouteRateDocument>,
    @InjectModel(AuctionFeeRule.name)
    private readonly auctionFeeRuleModel: Model<AuctionFeeRuleDocument>,
    @InjectModel(Quote.name)
    private readonly quoteModel: Model<QuoteDocument>,
  ) {}

  /**
   * Основний метод розрахунку
   */
  async calculate(dto: CalculateDeliveryDto) {
    const profile = await this.getActiveProfile(dto.profileCode);
    
    // Resolve all components
    const auctionFee = await this.resolveAuctionFee(profile.code, dto.price);
    const usaInland = await this.resolveRouteRate(profile.code, 'usa_inland', dto.port, dto.vehicleType);
    const ocean = await this.resolveRouteRate(profile.code, 'ocean', dto.port, dto.vehicleType);
    const euDelivery = await this.resolveRouteRate(profile.code, 'eu_delivery', profile.destinationCountry, dto.vehicleType);

    // Calculate dynamic fees
    const insurance = (dto.price + auctionFee) * profile.insuranceRate;
    const customs = dto.price * profile.customsRate;
    
    // Hidden fee based on price threshold
    const hiddenFee = dto.price <= profile.hiddenFeeThreshold
      ? profile.hiddenFeeUnder5000
      : profile.hiddenFeeOver5000;

    // Build breakdown
    const visibleBreakdown = {
      carPrice: dto.price,
      auctionFee,
      insurance: round2(insurance),
      usaInland,
      ocean,
      usaHandlingFee: profile.usaHandlingFee,
      bankFee: profile.bankFee,
      euPortHandlingFee: profile.euPortHandlingFee,
      euDelivery,
      companyFee: profile.companyFee,
      customs: round2(customs),
      documentationFee: profile.documentationFee,
      titleFee: profile.titleFee,
    };

    const visibleTotal = sum(Object.values(visibleBreakdown));
    const internalTotal = visibleTotal + hiddenFee;

    this.logger.log(`[Calculator] Price: $${dto.price}, Port: ${dto.port}, Type: ${dto.vehicleType} → Total: $${round2(visibleTotal)}`);

    return {
      profile: {
        code: profile.code,
        name: profile.name,
        destinationCountry: profile.destinationCountry,
        currency: profile.currency,
      },
      input: {
        price: dto.price,
        port: dto.port,
        vehicleType: dto.vehicleType,
        vin: dto.vin,
        lotNumber: dto.lotNumber,
      },
      breakdown: visibleBreakdown,
      totals: {
        visible: round2(visibleTotal),
        internal: round2(internalTotal),
      },
      hiddenBreakdown: {
        hiddenFee,
      },
      margin: {
        hiddenFee,
        companyFee: profile.companyFee,
        controllableMargin: round2(hiddenFee + profile.companyFee),
      },
      // Formatted for UI display
      formattedBreakdown: [
        { label: 'Ціна авто', value: dto.price, type: 'primary' },
        { label: 'Аукціонний збір', value: auctionFee, type: 'fee' },
        { label: 'Страхування', value: round2(insurance), type: 'fee' },
        { label: 'Доставка по США', value: usaInland, type: 'shipping' },
        { label: 'Морська доставка', value: ocean, type: 'shipping' },
        { label: 'Обробка в США', value: profile.usaHandlingFee, type: 'fee' },
        { label: 'Банківська комісія', value: profile.bankFee, type: 'fee' },
        { label: 'Обробка в порту ЄС', value: profile.euPortHandlingFee, type: 'fee' },
        { label: 'Доставка в Болгарію', value: euDelivery, type: 'shipping' },
        { label: 'Митні платежі', value: round2(customs), type: 'customs' },
        { label: 'Документація', value: profile.documentationFee, type: 'fee' },
        { label: 'Оформлення титулу', value: profile.titleFee, type: 'fee' },
        { label: 'Сервісний збір', value: profile.companyFee, type: 'service' },
      ],
    };
  }

  /**
   * Створити quote snapshot
   */
  async createQuote(dto: CreateQuoteDto, userId?: string) {
    const calculation = await this.calculate(dto);
    
    const quoteNumber = await this.generateQuoteNumber();

    // Build scenario pricing
    const scenarios = this.buildScenarios(calculation.totals.visible);

    const quote = await this.quoteModel.create({
      quoteNumber,
      vin: dto.vin,
      lotNumber: dto.lotNumber,
      vehicleTitle: dto.vehicleTitle,
      input: calculation.input,
      breakdown: calculation.breakdown,
      visibleTotal: calculation.totals.visible,
      internalTotal: calculation.totals.internal,
      hiddenFee: calculation.hiddenBreakdown.hiddenFee,
      profileCode: calculation.profile.code,
      scenarios,
      selectedScenario: 'recommended',
      createdFrom: dto.createdFrom || 'vin',
      leadId: dto.leadId,
      customerId: dto.customerId,
      createdBy: userId,
      status: 'draft',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      notes: dto.notes,
      history: [{
        action: 'created',
        timestamp: new Date(),
        userId: userId,
      }],
    });

    this.logger.log(`[Quote] Created ${quoteNumber} for VIN: ${dto.vin || 'N/A'}`);

    return {
      ...calculation,
      scenarios,
      quote: {
        id: quote._id,
        quoteNumber: quote.quoteNumber,
        status: quote.status,
        expiresAt: quote.expiresAt,
        scenarios,
        selectedScenario: 'recommended',
      },
    };
  }

  /**
   * Build scenario pricing
   */
  private buildScenarios(visibleTotal: number) {
    return {
      minimum: round2(visibleTotal * 0.95),      // -5%
      recommended: round2(visibleTotal),          // base
      aggressive: round2(visibleTotal * 1.10),    // +10%
    };
  }

  /**
   * Get active profile
   */
  private async getActiveProfile(profileCode?: string) {
    const query = profileCode 
      ? { code: profileCode, isActive: true }
      : { isActive: true };
    
    const profile = await this.profileModel.findOne(query).lean();
    
    if (!profile) {
      throw new NotFoundException('Active calculator profile not found. Please seed the database.');
    }
    
    return profile;
  }

  /**
   * Resolve route rate from DB
   */
  private async resolveRouteRate(
    profileCode: string,
    rateType: 'usa_inland' | 'ocean' | 'eu_delivery',
    locationCode: string,
    vehicleType: string,
  ): Promise<number> {
    const query = rateType === 'eu_delivery'
      ? { profileCode, rateType, destinationCode: locationCode, vehicleType, isActive: true }
      : { profileCode, rateType, originCode: locationCode, vehicleType, isActive: true };

    const rate = await this.routeRateModel.findOne(query).lean();
    
    if (!rate) {
      this.logger.warn(`[Calculator] Rate not found: ${rateType}/${locationCode}/${vehicleType}, using fallback`);
      // Fallback to sedan rates if specific type not found
      const fallbackQuery = rateType === 'eu_delivery'
        ? { profileCode, rateType, destinationCode: locationCode, vehicleType: 'sedan', isActive: true }
        : { profileCode, rateType, originCode: locationCode, vehicleType: 'sedan', isActive: true };
      
      const fallbackRate = await this.routeRateModel.findOne(fallbackQuery).lean();
      return fallbackRate?.amount || 0;
    }
    
    return rate.amount;
  }

  /**
   * Resolve auction fee based on price brackets
   */
  private async resolveAuctionFee(profileCode: string, bidPrice: number): Promise<number> {
    const rule = await this.auctionFeeRuleModel.findOne({
      profileCode,
      minBid: { $lte: bidPrice },
      maxBid: { $gte: bidPrice },
      isActive: true,
    }).lean();

    if (!rule) {
      this.logger.warn(`[Calculator] No auction fee rule for price: $${bidPrice}`);
      return 0;
    }
    
    return rule.fee;
  }

  /**
   * Generate unique quote number
   */
  private async generateQuoteNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.quoteModel.countDocuments({
      createdAt: { $gte: new Date(`${year}-01-01`) },
    });
    
    return `QT-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  /**
   * Get quotes by VIN
   */
  async getQuotesByVin(vin: string) {
    return this.quoteModel.find({ vin }).sort({ createdAt: -1 }).lean();
  }

  /**
   * Get quote by ID
   */
  async getQuoteById(id: string) {
    return this.quoteModel.findById(id).lean();
  }

  /**
   * Get recent quotes
   */
  async getRecentQuotes(limit = 20) {
    return this.quoteModel.find().sort({ createdAt: -1 }).limit(limit).lean();
  }

  /**
   * Get quotes with filters
   */
  async getQuotes(query: { vin?: string; leadId?: string; customerPhone?: string; limit?: number }) {
    const filter: Record<string, any> = {};
    
    if (query.vin) filter.vin = query.vin.toUpperCase().trim();
    if (query.leadId) filter.leadId = query.leadId;
    if (query.customerPhone) filter.customerPhone = query.customerPhone;

    return this.quoteModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(query.limit || 50)
      .lean();
  }

  /**
   * Set quote scenario
   */
  async setQuoteScenario(id: string, selectedScenario: 'minimum' | 'recommended' | 'aggressive') {
    const quote = await this.quoteModel.findById(id);
    if (!quote) throw new NotFoundException('Quote not found');

    const selectedPrice = quote.scenarios?.[selectedScenario] || quote.visibleTotal;

    return this.quoteModel.findByIdAndUpdate(
      id,
      {
        $set: { 
          selectedScenario,
          finalPrice: selectedPrice,
        },
        $push: {
          history: {
            action: 'scenario_changed',
            timestamp: new Date(),
            oldValue: quote.selectedScenario,
            newValue: selectedScenario,
          }
        }
      },
      { new: true }
    );
  }

  /**
   * Bind quote to lead
   */
  async bindQuoteToLead(id: string, payload: { leadId: string; managerId?: string }) {
    return this.quoteModel.findByIdAndUpdate(
      id,
      {
        $set: {
          leadId: payload.leadId,
          managerId: payload.managerId,
          convertedToLead: true,
        },
        $push: {
          history: {
            action: 'bound_to_lead',
            timestamp: new Date(),
            newValue: payload.leadId,
          }
        }
      },
      { new: true }
    );
  }

  // ============ MANAGER PRICE OVERRIDE SYSTEM ============

  /**
   * Manager can override the final price with audit
   * 
   * Business rules:
   * - Manager can set any custom price
   * - Must provide reason for override
   * - Full audit trail recorded
   * - Margin impact calculated and logged
   */
  async managerPriceOverride(
    quoteId: string, 
    payload: { 
      newPrice: number; 
      reason: string; 
      managerId: string;
      managerName?: string;
    }
  ) {
    const quote = await this.quoteModel.findById(quoteId);
    if (!quote) throw new NotFoundException('Quote not found');

    const oldPrice = quote.finalPrice || quote.scenarios?.[quote.selectedScenario || 'recommended'] || quote.visibleTotal;
    const priceDiff = payload.newPrice - oldPrice;
    const percentChange = round2((priceDiff / oldPrice) * 100);

    // Calculate margin impact
    const originalMargin = quote.internalTotal - quote.visibleTotal;
    const newMargin = payload.newPrice - quote.internalTotal + originalMargin;
    const marginChange = newMargin - originalMargin;

    const auditEntry = {
      action: 'manager_price_override',
      timestamp: new Date(),
      userId: payload.managerId,
      userName: payload.managerName,
      oldValue: {
        price: oldPrice,
        margin: originalMargin,
        scenario: quote.selectedScenario,
      },
      newValue: {
        price: payload.newPrice,
        margin: newMargin,
        reason: payload.reason,
        priceDiff,
        percentChange,
        marginChange,
      },
    };

    this.logger.log(`[Manager Override] Quote ${quote.quoteNumber}: $${oldPrice} → $${payload.newPrice} (${percentChange > 0 ? '+' : ''}${percentChange}%) by ${payload.managerName || payload.managerId}`);

    const updated = await this.quoteModel.findByIdAndUpdate(
      quoteId,
      {
        $set: {
          finalPrice: payload.newPrice,
          selectedScenario: 'custom', // Mark as custom override
          notes: `${quote.notes || ''}\n[Override: ${payload.reason}]`.trim(),
        },
        $push: { history: auditEntry },
      },
      { new: true }
    );

    return {
      quote: updated,
      override: {
        oldPrice,
        newPrice: payload.newPrice,
        priceDiff,
        percentChange,
        marginChange,
        reason: payload.reason,
        managerId: payload.managerId,
        managerName: payload.managerName,
        timestamp: auditEntry.timestamp,
      },
    };
  }

  /**
   * Get quote audit history
   */
  async getQuoteAuditHistory(quoteId: string) {
    const quote = await this.quoteModel.findById(quoteId).lean();
    if (!quote) throw new NotFoundException('Quote not found');

    return {
      quoteNumber: quote.quoteNumber,
      vin: quote.vin,
      currentPrice: quote.finalPrice || quote.visibleTotal,
      selectedScenario: quote.selectedScenario,
      history: quote.history || [],
      createdAt: (quote as any).createdAt,
      summary: {
        totalChanges: (quote.history || []).length,
        priceOverrides: (quote.history || []).filter((h: any) => h.action === 'manager_price_override').length,
        scenarioChanges: (quote.history || []).filter((h: any) => h.action === 'scenario_changed').length,
      },
    };
  }

  /**
   * Get manager override analytics
   * Shows who changed prices and impact on margins
   */
  async getManagerOverrideAnalytics(managerId?: string, days = 30) {
    const dateFilter = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const pipeline: any[] = [
      {
        $match: {
          'history.action': 'manager_price_override',
          createdAt: { $gte: dateFilter },
        }
      },
      {
        $unwind: '$history'
      },
      {
        $match: {
          'history.action': 'manager_price_override',
          ...(managerId && { 'history.userId': managerId }),
        }
      },
      {
        $group: {
          _id: '$history.userId',
          managerName: { $first: '$history.userName' },
          totalOverrides: { $sum: 1 },
          avgPriceChange: { $avg: '$history.newValue.priceDiff' },
          avgPercentChange: { $avg: '$history.newValue.percentChange' },
          totalMarginImpact: { $sum: '$history.newValue.marginChange' },
          overrides: {
            $push: {
              quoteNumber: '$quoteNumber',
              vin: '$vin',
              oldPrice: '$history.oldValue.price',
              newPrice: '$history.newValue.price',
              reason: '$history.newValue.reason',
              timestamp: '$history.timestamp',
            }
          }
        }
      },
      {
        $project: {
          managerId: '$_id',
          managerName: 1,
          totalOverrides: 1,
          avgPriceChange: { $round: ['$avgPriceChange', 2] },
          avgPercentChange: { $round: ['$avgPercentChange', 2] },
          totalMarginImpact: { $round: ['$totalMarginImpact', 2] },
          recentOverrides: { $slice: ['$overrides', -10] },
        }
      },
      {
        $sort: { totalOverrides: -1 }
      }
    ];

    const result = await this.quoteModel.aggregate(pipeline);

    return {
      period: `Last ${days} days`,
      totalOverridesInPeriod: result.reduce((acc, r) => acc + r.totalOverrides, 0),
      totalMarginImpact: round2(result.reduce((acc, r) => acc + r.totalMarginImpact, 0)),
      byManager: result,
    };
  }

  /**
   * Revert to original scenario price
   */
  async revertToScenarioPrice(
    quoteId: string, 
    scenario: 'minimum' | 'recommended' | 'aggressive',
    managerId: string
  ) {
    const quote = await this.quoteModel.findById(quoteId);
    if (!quote) throw new NotFoundException('Quote not found');

    const scenarioPrice = quote.scenarios?.[scenario];
    if (!scenarioPrice) throw new NotFoundException('Scenario price not found');

    const oldPrice = quote.finalPrice || quote.visibleTotal;

    return this.quoteModel.findByIdAndUpdate(
      quoteId,
      {
        $set: {
          finalPrice: scenarioPrice,
          selectedScenario: scenario,
        },
        $push: {
          history: {
            action: 'revert_to_scenario',
            timestamp: new Date(),
            userId: managerId,
            oldValue: { price: oldPrice },
            newValue: { price: scenarioPrice, scenario },
          }
        }
      },
      { new: true }
    );
  }
}

// Helpers
function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + (Number(v) || 0), 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
