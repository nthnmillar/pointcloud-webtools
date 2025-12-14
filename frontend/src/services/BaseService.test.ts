import { describe, test, expect, beforeEach } from 'vitest';
import { BaseService } from './BaseService';

/**
 * Tests for BaseService - core service functionality
 */

describe('BaseService', () => {
  class TestService extends BaseService {
    public getName(): string {
      return 'TestService';
    }

    async initialize(): Promise<void> {
      // Test implementation
    }

    dispose(): void {
      // Test implementation
    }
  }

  let service: TestService;

  beforeEach(() => {
    service = new TestService();
  });

  test('should initialize successfully', () => {
    expect(service).toBeDefined();
    expect(service.getName()).toBe('TestService');
  });

  test('should handle events', () => {
    let eventReceived = false;
    const testData = { message: 'test' };

    service.on('test-event', data => {
      eventReceived = true;
      expect(data).toEqual(testData);
    });

    // Access protected emit method for testing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (
      service as unknown as { emit: (event: string, data?: unknown) => void }
    ).emit('test-event', testData);
    expect(eventReceived).toBe(true);
  });

  test('should handle multiple listeners', () => {
    let count = 0;

    service.on('test-event', () => {
      count++;
    });

    service.on('test-event', () => {
      count++;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (
      service as unknown as { emit: (event: string, data?: unknown) => void }
    ).emit('test-event', {});
    expect(count).toBe(2);
  });
});
