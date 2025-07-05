import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import { randomUUID } from 'crypto';
import { Debug } from './debug';

export interface PooledRequest {
  id: string;
  sessionId?: string;
  method: string;
  params: any;
  timestamp: number;
}

export interface PooledResponse {
  id: string;
  result?: any;
  error?: any;
}

export interface ConnectionPoolOptions {
  maxConnections: number;
  maxQueueSize: number;
  requestTimeout: number;
  sessionTimeout: number;
  sessionCheckInterval: number;
  workerScript?: string;
}

/**
 * Connection pool manager for handling concurrent MCP requests
 * Uses a queue-based approach with configurable connection limits
 */
export class ConnectionPool extends EventEmitter {
  protected activeConnections: Map<string, PooledRequest> = new Map();
  protected requestQueue: PooledRequest[] = [];
  protected workers: Worker[] = [];
  protected availableWorkers: Worker[] = [];
  protected options: ConnectionPoolOptions;
  protected isShuttingDown: boolean = false;

  constructor(options: Partial<ConnectionPoolOptions> = {}) {
    super();
    this.options = {
      maxConnections: options.maxConnections || 32,
      maxQueueSize: options.maxQueueSize || 100,
      requestTimeout: options.requestTimeout || 30000, // 30 seconds
      sessionTimeout: options.sessionTimeout || 3600000, // 1 hour
      sessionCheckInterval: options.sessionCheckInterval || 60000, // 1 minute
      workerScript: options.workerScript
    };
  }

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<void> {
    Debug.log(`🏊 Initializing connection pool with ${this.options.maxConnections} max connections`);
    
    // For now, we'll use a simpler approach without worker threads
    // This can be enhanced later with actual worker threads for CPU-intensive operations
  }

  /**
   * Submit a request to the pool
   */
  async submitRequest(request: PooledRequest): Promise<PooledResponse> {
    if (this.isShuttingDown) {
      throw new Error('Connection pool is shutting down');
    }

    // Check if we're at capacity
    if (this.requestQueue.length >= this.options.maxQueueSize) {
      throw new Error('Request queue is full');
    }

    // Add to queue
    this.requestQueue.push(request);
    Debug.log(`📥 Request ${request.id} added to queue. Queue size: ${this.requestQueue.length}`);

    // Process queue
    this.processQueue();

    // Return a promise that resolves when the request is complete
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeRequest(request.id);
        reject(new Error(`Request ${request.id} timed out`));
      }, this.options.requestTimeout);

      this.once(`response:${request.id}`, (response: PooledResponse) => {
        clearTimeout(timeout);
        if (response.error) {
          reject(response.error);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Process queued requests
   */
  protected processQueue(): void {
    while (
      this.requestQueue.length > 0 && 
      this.activeConnections.size < this.options.maxConnections
    ) {
      const request = this.requestQueue.shift();
      if (!request) continue;

      this.activeConnections.set(request.id, request);
      Debug.log(`🔄 Processing request ${request.id}. Active: ${this.activeConnections.size}/${this.options.maxConnections}`);

      // Emit event for processing
      this.emit('process', request);
    }
  }

  /**
   * Mark a request as complete
   */
  completeRequest(requestId: string, response: PooledResponse): void {
    const request = this.activeConnections.get(requestId);
    if (!request) {
      Debug.warn(`⚠️ Attempt to complete unknown request: ${requestId}`);
      return;
    }

    this.activeConnections.delete(requestId);
    Debug.log(`✅ Request ${requestId} completed. Active: ${this.activeConnections.size}/${this.options.maxConnections}`);

    // Emit response event
    this.emit(`response:${requestId}`, response);

    // Process next request in queue
    this.processQueue();
  }

  /**
   * Remove a request from tracking
   */
  private removeRequest(requestId: string): void {
    this.activeConnections.delete(requestId);
    const queueIndex = this.requestQueue.findIndex(r => r.id === requestId);
    if (queueIndex !== -1) {
      this.requestQueue.splice(queueIndex, 1);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    activeConnections: number;
    queuedRequests: number;
    maxConnections: number;
    utilization: number;
  } {
    const active = this.activeConnections.size;
    return {
      activeConnections: active,
      queuedRequests: this.requestQueue.length,
      maxConnections: this.options.maxConnections,
      utilization: active / this.options.maxConnections
    };
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    Debug.log('🛑 Shutting down connection pool');
    this.isShuttingDown = true;

    // Clear the queue
    this.requestQueue = [];

    // Wait for active connections to complete (with timeout)
    const shutdownTimeout = 5000; // 5 seconds
    const startTime = Date.now();

    while (this.activeConnections.size > 0 && Date.now() - startTime < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.activeConnections.size > 0) {
      Debug.warn(`⚠️ Force closing ${this.activeConnections.size} active connections`);
      this.activeConnections.clear();
    }

    // Clean up workers if we implement them
    for (const worker of this.workers) {
      await worker.terminate();
    }

    Debug.log('👋 Connection pool shutdown complete');
  }
}

/**
 * Request prioritization for the queue
 */
export enum RequestPriority {
  HIGH = 0,
  NORMAL = 1,
  LOW = 2
}

/**
 * Enhanced pooled request with priority
 */
export interface PrioritizedRequest extends PooledRequest {
  priority: RequestPriority;
}

/**
 * Priority-aware connection pool
 */
export class PriorityConnectionPool extends ConnectionPool {
  private priorityQueue: Map<RequestPriority, PooledRequest[]> = new Map([
    [RequestPriority.HIGH, []],
    [RequestPriority.NORMAL, []],
    [RequestPriority.LOW, []]
  ]);

  /**
   * Submit a request with priority
   */
  async submitPriorityRequest(request: PrioritizedRequest): Promise<PooledResponse> {
    const queue = this.priorityQueue.get(request.priority) || [];
    queue.push(request);
    
    // Override processQueue to handle priorities
    this.processQueue();
    
    return super.submitRequest(request);
  }

  /**
   * Process queue with priority ordering
   */
  protected processQueue(): void {
    // Process high priority first, then normal, then low
    for (const priority of [RequestPriority.HIGH, RequestPriority.NORMAL, RequestPriority.LOW]) {
      const queue = this.priorityQueue.get(priority) || [];
      
      while (
        queue.length > 0 && 
        this.activeConnections.size < this.options.maxConnections
      ) {
        const request = queue.shift();
        if (!request) continue;

        this.activeConnections.set(request.id, request);
        this.emit('process', request);
      }
    }
  }
}