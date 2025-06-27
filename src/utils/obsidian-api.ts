import { App, TFile, TFolder, TAbstractFile, Vault, Workspace, Command } from 'obsidian';
import { ObsidianConfig, ObsidianFile, ObsidianFileResponse } from '../types/obsidian';
import { limitSearchResults, DEFAULT_LIMITER_CONFIG } from './response-limiter';
import { isImageFile as checkIsImageFile, processImageResponse } from './image-handler';
import { getVersion } from '../version';

export class ObsidianAPI {
  private app: App;
  private config: ObsidianConfig;

  constructor(app: App, config?: ObsidianConfig) {
    this.app = app;
    this.config = config || { apiKey: '', apiUrl: '' };
  }

  // Server info
  async getServerInfo() {
    return {
      authenticated: true,
      cors: true,
      ok: true,
      service: 'Obsidian MCP Plugin',
      versions: {
        obsidian: (this.app as any).appVersion || '1.0.0',
        'self': getVersion()
      }
    };
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

  async searchPaginated(query: string, page: number = 0, pageSize: number = 50) {
    const allResults = await this.searchSimple(query);
    const results = Array.isArray(allResults) ? allResults : allResults?.results || [];
    const start = page * pageSize;
    const end = start + pageSize;
    
    return {
      results: results.slice(start, end),
      page,
      pageSize,
      total: results.length,
      hasMore: end < results.length
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