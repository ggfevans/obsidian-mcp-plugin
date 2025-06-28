import { App, TFile, TFolder, TAbstractFile, Vault, Workspace, Command } from 'obsidian';
import { ObsidianConfig, ObsidianFile, ObsidianFileResponse } from '../types/obsidian';
import { limitSearchResults, DEFAULT_LIMITER_CONFIG, paginateResults, paginateFiles } from './response-limiter';
import { isImageFile as checkIsImageFile, processImageResponse } from './image-handler';
import { getVersion } from '../version';
import { AdvancedSearchService, SearchResult, SearchOptions } from './advanced-search';

export class ObsidianAPI {
  private app: App;
  private config: ObsidianConfig;
  private plugin?: any; // Reference to the plugin for accessing MCP server info
  private searchService: AdvancedSearchService;

  constructor(app: App, config?: ObsidianConfig, plugin?: any) {
    this.app = app;
    this.config = config || { apiKey: '', apiUrl: '' };
    this.plugin = plugin;
    this.searchService = new AdvancedSearchService(app);
  }

  // Server info
  async getServerInfo() {
    const baseInfo = {
      authenticated: true,
      cors: true,
      ok: true,
      service: 'Obsidian MCP Plugin',
      versions: {
        obsidian: (this.app as any).appVersion || '1.0.0',
        'self': getVersion()
      }
    };

    // Add MCP server connection info if plugin is available
    if (this.plugin && this.plugin.mcpServer) {
      return {
        ...baseInfo,
        mcp: {
          running: this.plugin.mcpServer.isServerRunning(),
          port: this.plugin.settings?.httpPort || 3001,
          connections: this.plugin.mcpServer.getConnectionCount() || 0,
          vault: this.app.vault.getName()
        }
      };
    }

    return baseInfo;
  }

  // Active file operations
  async getActiveFile(): Promise<ObsidianFile> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      throw new Error('No active file');
    }

    const content = await this.app.vault.read(activeFile);
    const stat = await this.app.vault.adapter.stat(activeFile.path);
    
    return {
      path: activeFile.path,
      content,
      tags: [], // TODO: Extract tags from frontmatter/content
      frontmatter: {} // TODO: Parse frontmatter
    };
  }

  async updateActiveFile(content: string) {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      throw new Error('No active file');
    }

    await this.app.vault.modify(activeFile, content);
    return { success: true };
  }

  async appendToActiveFile(content: string) {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      throw new Error('No active file');
    }

    const existingContent = await this.app.vault.read(activeFile);
    await this.app.vault.modify(activeFile, existingContent + content);
    return { success: true };
  }

  async deleteActiveFile() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      throw new Error('No active file');
    }

    await this.app.vault.delete(activeFile);
    return { success: true };
  }

  async patchActiveFile(params: any) {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      throw new Error('No active file');
    }

    return await this.patchVaultFile(activeFile.path, params);
  }

  // Vault file operations
  async listFiles(directory?: string): Promise<string[]> {
    const vault = this.app.vault;
    let files: TAbstractFile[];
    
    if (directory && directory !== '/') {
      const folder = vault.getAbstractFileByPath(directory);
      if (!folder || !(folder instanceof TFolder)) {
        throw new Error(`Directory not found: ${directory}`);
      }
      files = folder.children;
    } else {
      files = vault.getAllLoadedFiles();
    }

    // Return file paths, filtering out folders unless specifically requested
    return files
      .filter(file => file instanceof TFile)
      .map(file => file.path)
      .sort();
  }

  async listFilesPaginated(
    directory?: string, 
    page: number = 1, 
    pageSize: number = 20
  ): Promise<{
    files: Array<{
      path: string;
      name: string;
      type: 'file' | 'folder';
      size?: number;
      extension?: string;
      modified?: number;
    }>;
    page: number;
    pageSize: number;
    totalFiles: number;
    totalPages: number;
    directory?: string;
  }> {
    const vault = this.app.vault;
    let files: TAbstractFile[];
    
    if (directory && directory !== '/') {
      const folder = vault.getAbstractFileByPath(directory);
      if (!folder || !(folder instanceof TFolder)) {
        throw new Error(`Directory not found: ${directory}`);
      }
      files = folder.children;
    } else {
      files = vault.getAllLoadedFiles();
    }

    // Create detailed file objects
    const fileObjects = files.map(file => {
      const isFile = file instanceof TFile;
      const result: any = {
        path: file.path,
        name: file.name,
        type: isFile ? 'file' : 'folder'
      };
      
      if (isFile) {
        result.size = file.stat.size;
        result.extension = file.extension;
        result.modified = file.stat.mtime;
      }
      
      return result;
    }).sort((a, b) => {
      // Sort folders first, then files, alphabetically
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return paginateFiles(fileObjects, page, pageSize, directory);
  }

  async getFile(path: string): Promise<ObsidianFileResponse> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }

    // Check if it's an image file
    if (checkIsImageFile(path)) {
      const arrayBuffer = await this.app.vault.readBinary(file);
      return await processImageResponse(path, arrayBuffer);
    }

    // Regular text file
    const content = await this.app.vault.read(file);
    
    return {
      path: file.path,
      content,
      tags: [], // TODO: Extract tags from frontmatter/content
      frontmatter: {} // TODO: Parse frontmatter
    };
  }

  async createFile(path: string, content: string) {
    // Ensure directory exists
    const dirPath = path.substring(0, path.lastIndexOf('/'));
    if (dirPath && !this.app.vault.getAbstractFileByPath(dirPath)) {
      await this.ensureDirectoryExists(dirPath);
    }

    const file = await this.app.vault.create(path, content);
    return { 
      success: true, 
      path: file.path,
      name: file.name 
    };
  }

  async updateFile(path: string, content: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }

    await this.app.vault.modify(file, content);
    return { success: true };
  }

  async deleteFile(path: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }

    await this.app.vault.delete(file);
    return { success: true };
  }

  async appendToFile(path: string, content: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }

    const existingContent = await this.app.vault.read(file);
    await this.app.vault.modify(file, existingContent + content);
    return { success: true };
  }

  async patchVaultFile(path: string, params: any) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }

    let content = await this.app.vault.read(file);
    
    // Handle different patch operations
    if (params.operation === 'replace') {
      if (params.old_text && params.new_text) {
        content = content.replace(params.old_text, params.new_text);
      }
    } else if (params.operation === 'insert') {
      if (params.position !== undefined) {
        content = content.slice(0, params.position) + params.text + content.slice(params.position);
      }
    } else if (params.operation === 'delete') {
      if (params.start !== undefined && params.end !== undefined) {
        content = content.slice(0, params.start) + content.slice(params.end);
      }
    }

    await this.app.vault.modify(file, content);
    return { success: true, updated_content: content };
  }

  // Search operations
  async searchSimple(query: string) {
    try {
      // Try to use Obsidian's search if available
      const searchPlugin = (this.app as any).internalPlugins?.plugins?.['global-search'];
      if (searchPlugin?.instance?.searchIndex) {
        const searchResults = searchPlugin.instance.searchIndex.search(query);
        if (searchResults) {
          return limitSearchResults(searchResults, DEFAULT_LIMITER_CONFIG);
        }
      }
    } catch (error) {
      console.warn('Search plugin unavailable, using fallback:', error);
    }

    return await this.fallbackSearch(query);
  }

  async searchPaginated(
    query: string, 
    page: number = 1, 
    pageSize: number = 10,
    strategy: 'filename' | 'content' | 'combined' = 'combined',
    includeContent: boolean = true
  ): Promise<{
    query: string;
    page: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
    results: SearchResult[];
    method: string;
    truncated?: boolean;
    originalCount?: number;
    message?: string;
  }> {
    if (!query || query.trim().length === 0) {
      return {
        query,
        page,
        pageSize,
        totalResults: 0,
        totalPages: 0,
        results: [],
        method: 'advanced'
      };
    }

    // Use advanced search service for ranking and snippets
    const searchOptions: SearchOptions = {
      strategy,
      maxResults: 200, // Get more results for better pagination
      snippetLength: includeContent ? 200 : 0,
      includeMetadata: true
    };

    const allResults = await this.searchService.search(query, searchOptions);
    
    // Apply pagination with token limits
    const paginatedResponse = paginateResults(allResults, page, pageSize);
    
    return {
      query,
      page: paginatedResponse.page,
      pageSize: paginatedResponse.pageSize,
      totalResults: paginatedResponse.totalResults,
      totalPages: paginatedResponse.totalPages,
      results: paginatedResponse.results,
      method: `advanced-${strategy}`,
      ...(paginatedResponse.truncated && {
        truncated: true,
        originalCount: paginatedResponse.originalCount,
        message: paginatedResponse.message
      })
    };
  }

  // Obsidian integration
  async openFile(path: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }

    const leaf = this.app.workspace.getUnpinnedLeaf();
    await leaf.openFile(file);
    return { success: true };
  }

  async getCommands(): Promise<Command[]> {
    const commands = (this.app as any).commands?.commands;
    if (!commands) {
      return [];
    }

    return Object.values(commands).map((cmd: any) => ({
      id: cmd.id,
      name: cmd.name,
      icon: cmd.icon
    }));
  }

  async executeCommand(commandId: string) {
    const success = (this.app as any).commands?.executeCommandById(commandId);
    return { 
      success: !!success,
      commandId 
    };
  }

  // Helper methods
  private async ensureDirectoryExists(dirPath: string) {
    const parts = dirPath.split('/').filter(part => part);
    let currentPath = '';
    
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(currentPath)) {
        await this.app.vault.createFolder(currentPath);
      }
    }
  }

  private async fallbackSearch(query: string) {
    const files = this.app.vault.getMarkdownFiles();
    const results: any[] = [];
    const queryLower = query.toLowerCase();

    for (const file of files) {
      try {
        const content = await this.app.vault.read(file);
        const contentLower = content.toLowerCase();
        
        if (contentLower.includes(queryLower) || file.path.toLowerCase().includes(queryLower)) {
          // Find matching lines
          const lines = content.split('\n');
          const matchingLines = lines
            .map((line, index) => ({ line, number: index + 1 }))
            .filter(({ line }) => line.toLowerCase().includes(queryLower));

          if (matchingLines.length > 0) {
            results.push({
              filename: file.path,
              matches: matchingLines.map(({ line, number }) => ({
                line,
                lineNumber: number
              }))
            });
          } else if (file.path.toLowerCase().includes(queryLower)) {
            // File name match
            results.push({
              filename: file.path,
              matches: [{
                line: `File: ${file.name}`,
                lineNumber: 0
              }]
            });
          }
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    return limitSearchResults(results, DEFAULT_LIMITER_CONFIG);
  }
}