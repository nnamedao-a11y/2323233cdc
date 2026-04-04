/**
 * Circuit Breaker Service
 * 
 * Prevents hammering dead sources
 */

import { Injectable } from '@nestjs/common';

interface CircuitState {
  failures: number;
  successes: number;
  state: 'closed' | 'open' | 'half-open';
  openedAt?: number;
  lastAttempt?: number;
}

const FAILURE_THRESHOLD = 5;
const RECOVERY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const HALF_OPEN_MAX_ATTEMPTS = 2;

@Injectable()
export class CircuitBreakerService {
  private readonly circuits = new Map<string, CircuitState>();

  private getOrCreate(key: string): CircuitState {
    if (!this.circuits.has(key)) {
      this.circuits.set(key, {
        failures: 0,
        successes: 0,
        state: 'closed',
      });
    }
    return this.circuits.get(key)!;
  }

  canExecute(key: string): boolean {
    const circuit = this.getOrCreate(key);
    const now = Date.now();

    switch (circuit.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if recovery timeout passed
        if (circuit.openedAt && now - circuit.openedAt >= RECOVERY_TIMEOUT_MS) {
          circuit.state = 'half-open';
          circuit.successes = 0;
          console.log(`[CircuitBreaker] ${key}: open -> half-open`);
          return true;
        }
        return false;

      case 'half-open':
        return true;

      default:
        return true;
    }
  }

  recordSuccess(key: string) {
    const circuit = this.getOrCreate(key);
    circuit.lastAttempt = Date.now();

    if (circuit.state === 'half-open') {
      circuit.successes += 1;
      if (circuit.successes >= HALF_OPEN_MAX_ATTEMPTS) {
        circuit.state = 'closed';
        circuit.failures = 0;
        console.log(`[CircuitBreaker] ${key}: half-open -> closed (recovered)`);
      }
    } else {
      circuit.failures = Math.max(0, circuit.failures - 1);
    }
  }

  recordFailure(key: string) {
    const circuit = this.getOrCreate(key);
    circuit.lastAttempt = Date.now();
    circuit.failures += 1;

    if (circuit.state === 'half-open') {
      // Immediate trip back to open
      circuit.state = 'open';
      circuit.openedAt = Date.now();
      console.log(`[CircuitBreaker] ${key}: half-open -> open (failed again)`);
    } else if (circuit.failures >= FAILURE_THRESHOLD) {
      circuit.state = 'open';
      circuit.openedAt = Date.now();
      console.log(`[CircuitBreaker] ${key}: closed -> open (${circuit.failures} failures)`);
    }
  }

  getState(key: string): CircuitState {
    return this.getOrCreate(key);
  }

  getAllStates() {
    return Array.from(this.circuits.entries()).map(([key, state]) => ({
      key,
      ...state,
      remainingCooldown: state.state === 'open' && state.openedAt 
        ? Math.max(0, RECOVERY_TIMEOUT_MS - (Date.now() - state.openedAt))
        : 0,
    }));
  }

  reset(key: string) {
    this.circuits.set(key, {
      failures: 0,
      successes: 0,
      state: 'closed',
    });
  }

  resetAll() {
    this.circuits.clear();
  }
}
