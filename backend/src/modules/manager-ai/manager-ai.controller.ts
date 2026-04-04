/**
 * Manager AI Controller
 * 
 * Endpoints:
 * - GET /api/manager-ai/lead/:leadId - Get AI advice for a lead
 * - POST /api/manager-ai/analyze - Analyze custom data
 */

import { Controller, Get, Post, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { ManagerAIService, ManagerAIInput } from './manager-ai.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Lead } from '../leads/lead.schema';
import { IntentScore } from '../reminder-workflow/schemas/intent-score.schema';

@Controller('manager-ai')
export class ManagerAIController {
  constructor(
    private readonly managerAIService: ManagerAIService,
    @InjectModel(Lead.name) private readonly leadModel: Model<Lead>,
    @InjectModel(IntentScore.name) private readonly intentModel: Model<IntentScore>,
  ) {}

  /**
   * Get AI advice for a specific lead
   */
  @Get('lead/:leadId')
  async getLeadAdvice(@Param('leadId') leadId: string) {
    // Find lead
    const lead = await this.leadModel.findOne({ id: leadId, isDeleted: false }).lean();
    if (!lead) {
      throw new HttpException('Lead not found', HttpStatus.NOT_FOUND);
    }

    // Find intent score if available
    const userId = (lead.metadata as any)?.intentUserId || lead.id;
    const intent = await this.intentModel.findOne({ userId }).lean();

    // Build input
    const input: ManagerAIInput = {
      user: {
        id: userId,
        intent: (lead as any).intentLevel || intent?.level || 'cold',
        score: (lead as any).intentScore || intent?.score || 0,
        name: `${lead.firstName} ${lead.lastName}`,
        email: lead.email,
        phone: lead.phone,
      },
      behavior: {
        favorites: (lead as any).intentContext?.favoriteVins || intent?.context?.favoriteVins || [],
        compare: (lead as any).intentContext?.compareVins || intent?.context?.compareVins || [],
        lastViewedVin: (lead as any).intentContext?.lastViewedVin || intent?.context?.lastViewedVin,
        favoritesCount: intent?.favoritesCount || 0,
        comparesCount: intent?.comparesCount || 0,
        historyRequestsCount: intent?.historyRequestsCount || 0,
      },
      vehicleContext: lead.vin ? {
        vin: lead.vin,
      } : undefined,
      crm: {
        leadStatus: lead.status,
        previousContacts: (lead.callAttempts || 0) + (lead.emailAttempts || 0) + (lead.smsAttempts || 0),
        lastContactAt: lead.lastContactAt?.toISOString(),
      },
    };

    const advice = await this.managerAIService.generateAdvice(input);

    return {
      leadId,
      leadName: `${lead.firstName} ${lead.lastName}`,
      advice,
    };
  }

  /**
   * Get AI advice for a user by userId
   */
  @Get('user/:userId')
  async getUserAdvice(@Param('userId') userId: string) {
    const intent = await this.intentModel.findOne({ userId }).lean();
    if (!intent) {
      throw new HttpException('User intent not found', HttpStatus.NOT_FOUND);
    }

    const input: ManagerAIInput = {
      user: {
        id: userId,
        intent: intent.level || 'cold',
        score: intent.score || 0,
        name: (intent as any).context?.name,
        email: (intent as any).context?.email,
        phone: (intent as any).context?.phone,
      },
      behavior: {
        favorites: (intent as any).context?.favoriteVins || [],
        compare: (intent as any).context?.compareVins || [],
        lastViewedVin: (intent as any).context?.lastViewedVin,
        favoritesCount: intent.favoritesCount || 0,
        comparesCount: intent.comparesCount || 0,
        historyRequestsCount: intent.historyRequestsCount || 0,
      },
    };

    const advice = await this.managerAIService.generateAdvice(input);

    return {
      userId,
      intent: {
        level: intent.level,
        score: intent.score,
      },
      advice,
    };
  }

  /**
   * Analyze custom data
   */
  @Post('analyze')
  async analyze(@Body() input: ManagerAIInput) {
    if (!input.user?.id) {
      throw new HttpException('user.id is required', HttpStatus.BAD_REQUEST);
    }

    const advice = await this.managerAIService.generateAdvice(input);

    return { advice };
  }
}
