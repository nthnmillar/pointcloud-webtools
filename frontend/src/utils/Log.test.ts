import { describe, test, expect, beforeEach } from 'vitest';
import { Log, LogLevel } from './Log';

/**
 * Tests for Log utility
 */

describe('Log', () => {
  beforeEach(() => {
    // Clear logs before each test
    Log.clearLogs();
  });

  test('should add log entries', () => {
    Log.Info('Test', 'Test message');
    const logs = Log.getLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].message).toBe('Test message');
    expect(logs[0].level).toBe(LogLevel.INFO);
    expect(logs[0].tag).toBe('Test');
  });

  test('should limit log entries', () => {
    // Add more than maxLogs (default is 1000)
    for (let i = 0; i < 2000; i++) {
      Log.Info('Test', `Message ${i}`);
    }
    const logs = Log.getLogs();
    expect(logs.length).toBeLessThanOrEqual(1000);
  });

  test('should support different log levels', () => {
    Log.Info('Test', 'info message');
    Log.Warn('Test', 'warn message');
    Log.Error('Test', 'error message');

    const logs = Log.getLogs();
    expect(logs.some(log => log.level === LogLevel.INFO)).toBe(true);
    expect(logs.some(log => log.level === LogLevel.WARN)).toBe(true);
    expect(logs.some(log => log.level === LogLevel.ERROR)).toBe(true);
  });
});
