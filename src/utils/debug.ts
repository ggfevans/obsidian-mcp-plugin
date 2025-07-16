/**
 * Debug logging utility for Semantic Notes Vault MCP
 * Only logs when debug mode is enabled in settings
 */

export interface DebugLogger {
    log(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
}

export class Debug {
    private static debugEnabled = false;
    
    static setDebugMode(enabled: boolean): void {
        this.debugEnabled = enabled;
    }
    
    static isDebugMode(): boolean {
        return this.debugEnabled;
    }
    
    static log(message: string, ...args: any[]): void {
        if (this.debugEnabled) {
            console.log(`[MCP] ${message}`, ...args);
        }
    }
    
    static error(message: string, ...args: any[]): void {
        // Always log errors
        console.error(`[MCP] ERROR: ${message}`, ...args);
    }
    
    static warn(message: string, ...args: any[]): void {
        if (this.debugEnabled) {
            console.warn(`[MCP] WARN: ${message}`, ...args);
        }
    }
    
    static info(message: string, ...args: any[]): void {
        if (this.debugEnabled) {
            console.info(`[MCP] INFO: ${message}`, ...args);
        }
    }
    
    static createLogger(module: string): DebugLogger {
        return {
            log: (message: string, ...args: any[]) => Debug.log(`[${module}] ${message}`, ...args),
            error: (message: string, ...args: any[]) => Debug.error(`[${module}] ${message}`, ...args),
            warn: (message: string, ...args: any[]) => Debug.warn(`[${module}] ${message}`, ...args),
            info: (message: string, ...args: any[]) => Debug.info(`[${module}] ${message}`, ...args)
        };
    }
}