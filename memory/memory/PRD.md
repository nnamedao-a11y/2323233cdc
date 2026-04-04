# BIBI Cars CRM - Product Requirements Document

## Project Overview
**Name:** BIBI Cars CRM - Sales Management System  
**Tech Stack:** NestJS (Backend) + React (Frontend) + MongoDB  
**GitHub:** https://github.com/nnamedao-a11y/4343434343  

## User Personas
- **Owner (master_admin):** Full system access, views all KPIs, manages settings
- **Team Lead:** Manages team of managers, views team KPIs, controls their leads
- **Manager:** Works with clients, makes calls, closes deals

## Core Requirements (P0)
1. VIN Search & Price Engine - IMPLEMENTED
2. Deal Engine (BUY/NO BUY) - IMPLEMENTED
3. Lead Management - IMPLEMENTED
4. CRM Pipeline - IMPLEMENTED
5. Smart Campaigns - IMPLEMENTED
6. Revenue Advisor - IMPLEMENTED

## What's Been Implemented (Session: 31.03.2026)

### New Modules Implemented:

#### 1. KPI Module (`/api/admin/kpi/*`)
- Manager stats aggregation
- KPI alerts (HOT leads missed, low conversion, etc.)
- Manager rating system (gold/silver/bronze/needs_improvement)
- Team KPI dashboard
- Owner dashboard with full overview
- Leaderboard

#### 2. Coaching Module (`/api/admin/coaching/*`)
- Problem detection (HOT_LEAD_MISSED, LOW_CONVERSION, etc.)
- Validation layer (minimum data requirements, cooldown)
- Actionable advice with scripts in Ukrainian
- Priority-based coaching items

#### 3. Predictive Lead Scoring (`/api/admin/predictive-leads/*`)
- Behavior scoring (favorites, compare, history requests)
- Sales scoring (contacted, callback, negotiation)
- Deal scoring (STRONG_BUY, margin)
- Freshness scoring
- Lead bucket classification (hot/warm/cold)
- Next action recommendations

#### 4. Call Flow Module (`/api/admin/call-flow/*`)
- Call session management
- Status pipeline (new → no_answer → callback → interested → deal)
- Next action scheduling
- Call board view
- Due actions reminders

#### 5. History Reports Module (`/api/admin/history-reports/*`) - NEW
- **Core Logic:** Report = тільки після підтвердженого контакту + рішення менеджера
- User request → Pending → Manager approval → Purchase → Delivery
- VIN-based caching (pay once per VIN)
- Manager abuse detection (high spend / low conversion)
- Analytics: totalCost, cacheHitRate, ROI tracking
- Anti-abuse: deviceId, IP tracking, call verification

### Role System Update:
- 3-tier hierarchy: OWNER → TEAM_LEAD → MANAGER
- `teamLeadId` field added for manager hierarchy
- Legacy role support (master_admin, admin, moderator)

## Prioritized Backlog

### P0 (Next Priority)
- [ ] Frontend UI for KPI Dashboard
- [ ] Frontend UI for Call Board
- [ ] Frontend UI for Predictive Lead cards

### P1 (Soon)
- [ ] Twilio/SMS integration for 3x no-answer → SMS
- [ ] Telegram alerts for critical KPI issues
- [ ] Manager Coaching AI improvements

### P2 (Later)
- [ ] A/B testing for campaigns
- [ ] ML-based lead scoring (after 100+ deals)
- [ ] WhatsApp Business integration

## API Endpoints Created

```
# KPI
GET  /api/admin/kpi/dashboard
GET  /api/admin/kpi/me
GET  /api/admin/kpi/team
GET  /api/admin/kpi/manager/:id
GET  /api/admin/kpi/leaderboard
GET  /api/admin/kpi/alerts

# Coaching
GET  /api/admin/coaching/me
GET  /api/admin/coaching/manager/:id
GET  /api/admin/coaching/urgent

# Predictive Leads
GET  /api/admin/predictive-leads/hot
GET  /api/admin/predictive-leads/top
GET  /api/admin/predictive-leads/evaluate/:id
POST /api/admin/predictive-leads/evaluate
GET  /api/admin/predictive-leads/action-required
GET  /api/admin/predictive-leads/bucket/:bucket

# Call Flow
POST /api/admin/call-flow/session/:leadId
PUT  /api/admin/call-flow/session/:sessionId
GET  /api/admin/call-flow/board
GET  /api/admin/call-flow/due
GET  /api/admin/call-flow/stats

# History Reports (NEW)
GET  /api/admin/history-reports/check/:vin
POST /api/admin/history-reports/request
GET  /api/admin/history-reports/pending
PUT  /api/admin/history-reports/approve/:id
PUT  /api/admin/history-reports/deny/:id
GET  /api/admin/history-reports/my-reports
GET  /api/admin/history-reports/vin/:vin
GET  /api/admin/history-reports/analytics
GET  /api/admin/history-reports/abuse-check/:managerId
```

## Test Credentials
- Owner: admin@crm.com / admin123

_Last updated: 31.03.2026_
