/**
 * Base Service class with event system
 * All services should extend this class
 */
import { Log } from '../utils/Log';

export abstract class BaseService {
  private listeners: Map<string, ((data: unknown) => void)[]> = new Map();
  protected isInitialized: boolean = false;

  constructor() {
    // Initialize listeners map
  }

  /**
   * Initialize the service
   */
  abstract initialize(...args: unknown[]): Promise<void>;

  /**
   * Dispose of the service and clean up resources
   */
  abstract dispose(): void;

  /**
   * Check if service is initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Subscribe to service events
   */
  on(eventType: string, callback: (data: unknown) => void): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(callback);
  }

  /**
   * Unsubscribe from service events
   */
  off(eventType: string, callback: (data: unknown) => void): void {
    const eventListeners = this.listeners.get(eventType);
    if (eventListeners) {
      const index = eventListeners.indexOf(callback);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event to all subscribers
   */
  protected emit(eventType: string, data?: unknown): void {
    const eventListeners = this.listeners.get(eventType);
    if (eventListeners) {
      eventListeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          Log.Error('BaseService', `Error in event listener for ${eventType}`, error);
        }
      });
    }
  }

  /**
   * Remove all observers
   */
  protected removeAllObservers(): void {
    this.listeners.clear();
  }
}
