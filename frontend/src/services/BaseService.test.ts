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

    service.emit('test-event', testData);
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

    service.emit('test-event', {});
    expect(count).toBe(2);
  });
});
