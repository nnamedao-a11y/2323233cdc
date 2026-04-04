/**
 * Parser Health Service
 * 
 * Tracks health state of all parsers
 */

import { Injectable } from '@nestjs/common';

export interface ParserHealthState {
  parserId: string;
  parserName: string;
  status: 'ok' | 'degraded' | 'failed' | 'unknown';
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  lastError?: string;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalRuns: number;
  totalSuccesses: number;
  totalFailures: number;
  lastFetched: number;
  avgDurationMs: number;
}

@Injectable()
export class ParserHealthService {
  private readonly state = new Map<string, ParserHealthState>();
  private readonly durations = new Map<string, number[]>();

  private getOrCreate(parserId: string, parserName?: string): ParserHealthState {
    if (!this.state.has(parserId)) {
      this.state.set(parserId, {
        parserId,
        parserName: parserName || parserId,
        status: 'unknown',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        totalRuns: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        lastFetched: 0,
        avgDurationMs: 0,
      });
    }
    return this.state.get(parserId)!;
  }

  markSuccess(parserId: string, options?: { 
    parserName?: string;
    fetched?: number;
    durationMs?: number;
  }) {
    const current = this.getOrCreate(parserId, options?.parserName);
    
    current.status = 'ok';
    current.lastSuccessAt = new Date();
    current.consecutiveFailures = 0;
    current.consecutiveSuccesses += 1;
    current.totalRuns += 1;
    current.totalSuccesses += 1;
    current.lastFetched = options?.fetched || 0;

    if (options?.durationMs) {
      this.updateAvgDuration(parserId, options.durationMs);
    }

    this.state.set(parserId, current);
  }

  markFailure(parserId: string, error: string, options?: {
    parserName?: string;
    durationMs?: number;
  }) {
    const current = this.getOrCreate(parserId, options?.parserName);
    
    current.consecutiveFailures += 1;
    current.consecutiveSuccesses = 0;
    current.totalRuns += 1;
    current.totalFailures += 1;
    current.lastFailureAt = new Date();
    current.lastError = error;

    // Determine status based on consecutive failures
    if (current.consecutiveFailures >= 5) {
      current.status = 'failed';
    } else if (current.consecutiveFailures >= 2) {
      current.status = 'degraded';
    }

    if (options?.durationMs) {
      this.updateAvgDuration(parserId, options.durationMs);
    }

    this.state.set(parserId, current);
  }

  private updateAvgDuration(parserId: string, durationMs: number) {
    if (!this.durations.has(parserId)) {
      this.durations.set(parserId, []);
    }
    
    const durations = this.durations.get(parserId)!;
    durations.push(durationMs);
    
    // Keep last 10 measurements
    if (durations.length > 10) {
      durations.shift();
    }

    const state = this.state.get(parserId);
    if (state) {
      state.avgDurationMs = Math.round(
        durations.reduce((a, b) => a + b, 0) / durations.length
      );
    }
  }

  getHealth(parserId: string): ParserHealthState | undefined {
    return this.state.get(parserId);
  }

  getAllHealth(): ParserHealthState[] {
    return Array.from(this.state.values());
  }

  getSummary(): {
    total: number;
    ok: number;
    degraded: number;
    failed: number;
    unknown: number;
    successRate: number;
  } {
    const all = this.getAllHealth();
    const total = all.length;
    
    const ok = all.filter(s => s.status === 'ok').length;
    const degraded = all.filter(s => s.status === 'degraded').length;
    const failed = all.filter(s => s.status === 'failed').length;
    const unknown = all.filter(s => s.status === 'unknown').length;

    const totalRuns = all.reduce((sum, s) => sum + s.totalRuns, 0);
    const totalSuccesses = all.reduce((sum, s) => sum + s.totalSuccesses, 0);
    const successRate = totalRuns > 0 ? Math.round((totalSuccesses / totalRuns) * 100) : 0;

    return { total, ok, degraded, failed, unknown, successRate };
  }

  reset(parserId: string) {
    this.state.delete(parserId);
    this.durations.delete(parserId);
  }

  resetAll() {
    this.state.clear();
    this.durations.clear();
  }
}
