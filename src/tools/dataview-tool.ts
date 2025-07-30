import { ObsidianAPI } from '../utils/obsidian-api';
import { PluginDetector } from '../utils/plugin-detector';

/**
 * Dataview tool implementation for querying vault data
 */
export class DataviewTool {
  private detector: PluginDetector;

  constructor(private api: ObsidianAPI) {
    this.detector = new PluginDetector(api.getApp());
  }

  /**
   * Check if Dataview functionality is available
   */
  isAvailable(): boolean {
    return this.detector.isDataviewAPIReady();
  }

  /**
   * Get Dataview status information
   */
  getStatus() {
    return this.detector.getDataviewStatus();
  }

  /**
   * Execute a Dataview query
   */
  async executeQuery(query: string, format: 'dql' | 'js' = 'dql'): Promise<any> {
    if (!this.isAvailable()) {
      throw new Error('Dataview plugin is not available or not enabled');
    }

    const dataviewAPI = this.detector.getDataviewAPI();
    
    try {
      if (format === 'dql') {
        // Execute DQL query
        const result = await dataviewAPI.query(query);
        return {
          success: true,
          query,
          format,
          result: this.formatQueryResult(result),
          type: result.type || 'unknown'
        };
      } else {
        // Execute JavaScript query (if needed in the future)
        throw new Error('JavaScript queries not yet implemented');
      }
    } catch (error) {
      return {
        success: false,
        query,
        format,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * List all pages with metadata
   */
  async listPages(source?: string): Promise<any> {
    if (!this.isAvailable()) {
      throw new Error('Dataview plugin is not available or not enabled');
    }

    const dataviewAPI = this.detector.getDataviewAPI();
    
    try {
      // Get pages from source (folder, tag, etc.) or all pages
      const pages = source 
        ? dataviewAPI.pages(source)
        : dataviewAPI.pages();

      return {
        success: true,
        source: source || 'all',
        count: pages.length,
        pages: pages.array().slice(0, 50).map((page: any) => ({
          path: page.file.path,
          name: page.file.name,
          size: page.file.size,
          created: page.file.ctime?.toISOString(),
          modified: page.file.mtime?.toISOString(),
          tags: page.file.tags?.array() || [],
          links: page.file.outlinks?.array()?.length || 0,
          aliases: page.aliases?.array() || [],
          // Include custom frontmatter fields
          ...this.extractCustomFields(page)
        }))
      };
    } catch (error) {
      return {
        success: false,
        source: source || 'all',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get metadata for a specific page
   */
  async getPageMetadata(path: string): Promise<any> {
    if (!this.isAvailable()) {
      throw new Error('Dataview plugin is not available or not enabled');
    }

    const dataviewAPI = this.detector.getDataviewAPI();
    
    try {
      const page = dataviewAPI.page(path);
      
      if (!page) {
        throw new Error(`Page not found: ${path}`);
      }

      return {
        success: true,
        path,
        metadata: {
          file: {
            path: page.file.path,
            name: page.file.name,
            basename: page.file.basename,
            extension: page.file.extension,
            size: page.file.size,
            created: page.file.ctime?.toISOString(),
            modified: page.file.mtime?.toISOString()
          },
          tags: page.file.tags?.array() || [],
          aliases: page.aliases?.array() || [],
          outlinks: page.file.outlinks?.array() || [],
          inlinks: page.file.inlinks?.array() || [],
          tasks: page.file.tasks?.array()?.length || 0,
          lists: page.file.lists?.array()?.length || 0,
          // Include all custom frontmatter fields
          custom: this.extractCustomFields(page)
        }
      };
    } catch (error) {
      return {
        success: false,
        path,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate a DQL query syntax
   */
  async validateQuery(query: string): Promise<any> {
    if (!this.isAvailable()) {
      throw new Error('Dataview plugin is not available or not enabled');
    }

    try {
      // Basic query structure validation
      const trimmedQuery = query.trim();
      const queryTypes = ['LIST', 'TABLE', 'TASK', 'CALENDAR'];
      const firstWord = trimmedQuery.split(/\s+/)[0]?.toUpperCase();

      if (!queryTypes.includes(firstWord)) {
        return {
          valid: false,
          query,
          error: `Query must start with one of: ${queryTypes.join(', ')}`
        };
      }

      return {
        valid: true,
        query,
        queryType: firstWord,
        message: 'Query syntax appears valid'
      };
    } catch (error) {
      return {
        valid: false,
        query,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Format query result for MCP response
   */
  private formatQueryResult(result: any): any {
    if (!result) return null;

    // Handle different result types
    switch (result.type) {
      case 'list':
        return {
          type: 'list',
          values: result.values?.array() || []
        };
      case 'table':
        return {
          type: 'table',
          headers: result.headers || [],
          values: result.values?.array()?.map((row: any) => row.array()) || []
        };
      case 'task':
        return {
          type: 'task',
          values: result.values?.array()?.map((task: any) => ({
            text: task.text,
            completed: task.completed,
            line: task.line,
            path: task.path
          })) || []
        };
      case 'calendar':
        return {
          type: 'calendar',
          values: result.values || {}
        };
      default:
        return {
          type: 'unknown',
          data: result
        };
    }
  }

  /**
   * Extract custom frontmatter fields from a page
   */
  private extractCustomFields(page: any): Record<string, any> {
    const customFields: Record<string, any> = {};
    
    // Standard fields to exclude
    const excludeFields = new Set([
      'file', 'tags', 'aliases', 'outlinks', 'inlinks', 'tasks', 'lists'
    ]);

    // Extract all non-standard fields
    for (const [key, value] of Object.entries(page)) {
      if (!excludeFields.has(key) && !key.startsWith('$')) {
        // Convert Dataview values to plain JavaScript values
        customFields[key] = this.convertDataviewValue(value);
      }
    }

    return customFields;
  }

  /**
   * Convert Dataview values to plain JavaScript values
   */
  private convertDataviewValue(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }

    // Handle Dataview arrays
    if (value && typeof value.array === 'function') {
      return value.array().map((item: any) => this.convertDataviewValue(item));
    }

    // Handle Dataview dates
    if (value && value.toISOString && typeof value.toISOString === 'function') {
      return value.toISOString();
    }

    // Handle Dataview links
    if (value && value.path && value.display) {
      return {
        path: value.path,
        display: value.display
      };
    }

    return value;
  }
}

/**
 * Check if Dataview is available for tool registration
 */
export function isDataviewToolAvailable(api: ObsidianAPI): boolean {
  const detector = new PluginDetector(api.getApp());
  return detector.isDataviewAPIReady();
}