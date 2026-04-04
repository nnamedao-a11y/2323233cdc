import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RoutingRule } from '../schemas/routing-rule.schema';
import { RoutingContext } from '../interfaces/routing.interface';
import { CreateRoutingRuleDto, UpdateRoutingRuleDto } from '../dto/routing.dto';
import { generateId, toObjectResponse, toArrayResponse } from '../../../shared/utils';
import { AssignmentStrategy } from '../enums/assignment.enum';

@Injectable()
export class RoutingRulesService {
  private readonly logger = new Logger(RoutingRulesService.name);

  constructor(
    @InjectModel(RoutingRule.name) private ruleModel: Model<RoutingRule>,
  ) {}

  /**
   * Find the best matching rule for a given routing context
   * Matching order: market + language + source + leadType -> market + language + source -> ... -> default
   */
  async findMatchingRule(context: RoutingContext): Promise<RoutingRule | null> {
    const { market, language, source, leadType } = context;

    // Build queries from most specific to least specific
    const queries = [
      // Most specific: all 4 fields match
      { market, language, source, leadType, isActive: true, deletedAt: null },
      // 3 fields
      { market, language, source, isActive: true, deletedAt: null },
      { market, language, leadType, isActive: true, deletedAt: null },
      { market, source, leadType, isActive: true, deletedAt: null },
      { language, source, leadType, isActive: true, deletedAt: null },
      // 2 fields
      { market, language, isActive: true, deletedAt: null },
      { market, source, isActive: true, deletedAt: null },
      { market, leadType, isActive: true, deletedAt: null },
      { language, source, isActive: true, deletedAt: null },
      { language, leadType, isActive: true, deletedAt: null },
      { source, leadType, isActive: true, deletedAt: null },
      // 1 field
      { market, isActive: true, deletedAt: null },
      { language, isActive: true, deletedAt: null },
      { source, isActive: true, deletedAt: null },
      { leadType, isActive: true, deletedAt: null },
    ];

    // Try each query in order
    for (const query of queries) {
      // Remove undefined values
      const cleanQuery = Object.fromEntries(
        Object.entries(query).filter(([_, v]) => v !== undefined)
      );

      const rule = await this.ruleModel
        .findOne(cleanQuery)
        .sort({ priority: -1 })
        .lean();

      if (rule) {
        this.logger.debug(`Found matching rule: ${rule.name} for context`);
        return rule as any;
      }
    }

    // Fallback: return default rule (highest priority with isActive and no specific filters)
    const defaultRule = await this.ruleModel
      .findOne({
        isActive: true,
        deletedAt: null,
        market: { $exists: false },
        language: { $exists: false },
        source: { $exists: false },
        leadType: { $exists: false },
      })
      .sort({ priority: -1 })
      .lean();

    if (defaultRule) {
      this.logger.debug(`Using default rule: ${defaultRule.name}`);
      return defaultRule as any;
    }

    // If no default rule, get any active rule
    const anyRule = await this.ruleModel
      .findOne({ isActive: true, deletedAt: null })
      .sort({ priority: -1 })
      .lean();

    return anyRule as any;
  }

  /**
   * Create new routing rule
   */
  async create(data: CreateRoutingRuleDto, userId: string): Promise<any> {
    const rule = new this.ruleModel({
      id: generateId(),
      ...data,
      createdBy: userId,
    });
    const saved = await rule.save();
    return toObjectResponse(saved);
  }

  /**
   * Update routing rule
   */
  async update(id: string, data: UpdateRoutingRuleDto, userId: string): Promise<any> {
    const rule = await this.ruleModel.findOneAndUpdate(
      { id, deletedAt: null },
      { $set: { ...data, updatedBy: userId } },
      { new: true },
    );
    return rule ? toObjectResponse(rule) : null;
  }

  /**
   * Soft delete rule
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.ruleModel.findOneAndUpdate(
      { id },
      { $set: { deletedAt: new Date(), isActive: false } },
    );
    return !!result;
  }

  /**
   * Toggle rule active status
   */
  async toggle(id: string, userId: string): Promise<any> {
    const rule = await this.ruleModel.findOne({ id, deletedAt: null });
    if (!rule) return null;

    rule.isActive = !rule.isActive;
    rule.updatedBy = userId;
    await rule.save();
    return toObjectResponse(rule);
  }

  /**
   * Find all rules
   */
  async findAll(includeInactive = false): Promise<any[]> {
    const filter: any = { deletedAt: null };
    if (!includeInactive) {
      filter.isActive = true;
    }
    const rules = await this.ruleModel.find(filter).sort({ priority: -1, createdAt: -1 });
    return toArrayResponse(rules);
  }

  /**
   * Find rule by ID
   */
  async findById(id: string): Promise<any> {
    const rule = await this.ruleModel.findOne({ id, deletedAt: null });
    return rule ? toObjectResponse(rule) : null;
  }

  /**
   * Bootstrap default routing rules
   */
  async bootstrapDefaultRules(userId: string): Promise<void> {
    const existingRules = await this.ruleModel.countDocuments();
    if (existingRules > 0) return;

    const defaultRules = [
      {
        name: 'Default - Least Loaded',
        description: 'Базове правило: розподіл по найменшому навантаженню',
        priority: 0,
        strategy: AssignmentStrategy.LEAST_LOADED,
        allowedRoleKeys: ['manager'],
        onlyAvailableManagers: true,
        useFallbackQueue: true,
        firstResponseSlaMinutes: 10,
      },
      {
        name: 'Bulgaria Market',
        description: 'Ліди з Болгарії - least loaded серед BG менеджерів',
        priority: 50,
        market: 'BG',
        strategy: AssignmentStrategy.LEAST_LOADED,
        allowedRoleKeys: ['manager'],
        supportedMarkets: ['BG'],
        firstResponseSlaMinutes: 10,
      },
      {
        name: 'Phone/Missed Call - Round Robin',
        description: 'Телефонні ліди - швидкий round robin розподіл',
        priority: 60,
        source: 'phone',
        strategy: AssignmentStrategy.ROUND_ROBIN,
        allowedRoleKeys: ['manager'],
        firstResponseSlaMinutes: 5, // Швидший SLA для телефонних
      },
      {
        name: 'VIP Leads',
        description: 'VIP ліди - до найкращих менеджерів',
        priority: 100,
        leadType: 'vip',
        strategy: AssignmentStrategy.LEAST_LOADED,
        allowedRoleKeys: ['manager', 'admin'],
        maxActiveLeadsPerManager: 5, // Обмежити навантаження для VIP
        firstResponseSlaMinutes: 5,
      },
    ];

    for (const rule of defaultRules) {
      await this.create(rule, userId);
    }

    this.logger.log(`Created ${defaultRules.length} default routing rules`);
  }
}
