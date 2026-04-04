/**
 * BIBI Cars - Blueprint Controller
 * API endpoints for stage transitions
 */

import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { BlueprintService } from './blueprint.service';
import { DealStage, DEAL_STAGE_LABELS, DEAL_STAGE_ORDER } from './blueprint-stage.enum';
import { DealContext } from './interfaces/blueprint-transition.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsString, IsOptional, IsObject, ValidateNested, IsBoolean, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class DealContextDto {
  @IsString()
  id: string;

  @IsString()
  stage: string;

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsString()
  teamLeadId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  vin?: string;

  @IsOptional()
  @IsString()
  lotId?: string;

  @IsOptional()
  @IsBoolean()
  hasCalls?: boolean;

  @IsOptional()
  @IsNumber()
  callCount?: number;

  @IsOptional()
  @IsBoolean()
  contractSigned?: boolean;

  @IsOptional()
  @IsBoolean()
  invoiceCreated?: boolean;

  @IsOptional()
  @IsBoolean()
  depositPaid?: boolean;

  @IsOptional()
  @IsBoolean()
  shipmentCreated?: boolean;

  @IsOptional()
  @IsBoolean()
  shipmentDelivered?: boolean;
}

class MoveStageDto {
  @IsString()
  to: string;
}

class ValidateTransitionDto {
  @IsString()
  from: string;

  @IsString()
  to: string;

  @ValidateNested()
  @Type(() => DealContextDto)
  deal: DealContextDto;
}

@Controller('blueprint')
@UseGuards(JwtAuthGuard)
export class BlueprintController {
  constructor(private readonly blueprintService: BlueprintService) {}

  /**
   * Get full blueprint configuration
   */
  @Get()
  getBlueprint() {
    return {
      stages: DEAL_STAGE_ORDER.map((stage) => ({
        id: stage,
        label: DEAL_STAGE_LABELS[stage],
      })),
      transitions: this.blueprintService.getFullBlueprint(),
    };
  }

  /**
   * Get stage info and allowed transitions
   */
  @Get('stage/:stage')
  getStageInfo(@Param('stage') stage: string) {
    const dealStage = stage as DealStage;
    return this.blueprintService.getStageInfo(dealStage);
  }

  /**
   * Validate a transition without executing
   */
  @Post('validate')
  async validateTransition(@Body() dto: ValidateTransitionDto) {
    const from = dto.from as DealStage;
    const to = dto.to as DealStage;

    const transition = this.blueprintService.getFullBlueprint().find(
      (t) => t.from === from && t.to === to,
    );

    if (!transition) {
      return {
        ok: false,
        message: `Transition ${from} → ${to} not allowed`,
        allowedTransitions: this.blueprintService.getStageInfo(from).allowed,
      };
    }

    const validation = await this.blueprintService.validateTransition(dto.deal as DealContext, {
      from,
      to,
      requiredFields: transition.requiredFields,
      requiredActions: transition.requiredActions,
      blockers: transition.blockers,
    });

    return validation;
  }

  /**
   * Move deal to next stage
   */
  @Patch('deals/:dealId/move')
  async moveStage(
    @Param('dealId') dealId: string,
    @Body() dto: MoveStageDto,
    @Req() req: any,
  ) {
    // In real implementation, fetch deal from DB
    // For now, this shows the structure
    const deal: DealContext = {
      id: dealId,
      stage: DealStage.NEW_LEAD, // This would come from DB
      managerId: req.user?.id,
      // ... other fields from DB
    };

    const to = dto.to as DealStage;
    const result = await this.blueprintService.moveStage(
      deal,
      to,
      req.user?.id,
      req.user?.role || 'manager',
    );

    return {
      success: true,
      deal: result.deal,
      message: `Угода переведена в статус: ${DEAL_STAGE_LABELS[to]}`,
    };
  }
}
