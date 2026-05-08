// Typed Event Bus with enhanced capabilities
import { EventEmitter } from 'events';
import { HealthStatus } from './interfaces';

export interface AppEvents {
  // Lifecycle events
  'app:started': { timestamp: Date; config: any };
  'app:stopping': { signal: string; timestamp: Date };
  'app:stopped': { timestamp: Date; uptime: number };
  
  // Agent events
  'agent:cycle:start': { cycleId: string; timestamp: Date };
  'agent:cycle:complete': { 
    cycleId: string; 
    duration: number; 
    processed: number; 
    timestamp: Date;
  };
  'agent:cycle:error': { 
    cycleId: string; 
    error: Error; 
    timestamp: Date;
  };
  
  // Health events
  'health:degraded': { component: string; status: HealthStatus; timestamp: Date };
  'health:recovered': { component: string; status: HealthStatus; timestamp: Date };
  
  // Database events
  'db:connected': { timestamp: Date };
  'db:disconnected': { timestamp: Date };
  'db:error': { error: Error; timestamp: Date };
  
  // Email events
  'email:received': { count: number; timestamp: Date };
  'email:sent': { to: string; timestamp: Date };
  'email:error': { error: Error; timestamp: Date };
}

export class TypedEventBus extends EventEmitter {
  emit<T extends keyof AppEvents>(event: T, data: AppEvents[T]): boolean {
    return super.emit(event, data);
  }

  on<T extends keyof AppEvents>(event: T, listener: (data: AppEvents[T]) => void): this {
    return super.on(event, listener);
  }

  once<T extends keyof AppEvents>(event: T, listener: (data: AppEvents[T]) => void): this {
    return super.once(event, listener);
  }

  addListener<T extends keyof AppEvents>(event: T, listener: (data: AppEvents[T]) => void): this {
    return super.addListener(event, listener);
  }
}

// Singleton instance
export const eventBus = new TypedEventBus();

// Configure max listeners to prevent memory leaks
eventBus.setMaxListeners(20);