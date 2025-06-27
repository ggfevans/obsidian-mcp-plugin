# Technical Architecture

## ObsidianAPI Abstraction Layer - The Critical Design Pattern

The success of this architecture depends on preserving the exact `ObsidianAPI` abstraction layer from our semantic MCP server while changing only its underlying implementation. This allows us to reuse all existing semantic MCP logic while gaining the performance benefits and richer capabilities of direct plugin API access.

**The key insight**: Keep the interface identical, change only the implementation target.

## Current vs. New Implementation

### Current Implementation Analysis

The existing `ObsidianAPI` class in `obsidian-semantic-mcp/src/utils/obsidian-api.ts` provides:

```typescript
export class ObsidianAPI {
  private client: AxiosInstance;  // HTTP client
  
  // Server operations
  async getServerInfo()
  async getActiveFile(): Promise<ObsidianFile>
  async updateActiveFile(content: string)
  
  // Vault operations  
  async listFiles(directory?: string)
  async getFile(path: string): Promise<ObsidianFileResponse>
  async createFile(path: string, content: string)
  async updateFile(path: string, content: string)
  async deleteFile(path: string)
  
  // Search operations
  async searchSimple(query: string)
  async searchPaginated(query: string, page: number, pageSize: number)
  
  // Advanced operations
  async patchVaultFile(path: string, params: PatchParams)
  async openFile(path: string)
  async getCommands()
  async executeCommand(commandId: string)
}
```

### New Implementation Strategy

Replace HTTP calls with direct Obsidian API calls while maintaining identical interface:

```typescript
import { App, TFile, TFolder, Vault, Workspace } from 'obsidian';

export class ObsidianAPI {
  private app: App;  // Direct Obsidian app reference
  
  constructor(app: App) {
    this.app = app;
  }
  
  // Maintain exact same method signatures
  async getServerInfo() {
    return {
      authenticated: true,
      ok: true,
      service: 'Obsidian MCP Plugin',
      version: this.app.vault.adapter.version || '1.0.0'
    };
  }
  
  async getActiveFile(): Promise<ObsidianFile> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      throw new Error('No active file');
    }
    
    const content = await this.app.vault.read(activeFile);
    return {
      path: activeFile.path,
      content,
      stat: activeFile.stat
    };
  }
  
  async listFiles(directory?: string): Promise<string[]> {
    const folder = directory 
      ? this.app.vault.getAbstractFileByPath(directory) as TFolder
      : this.app.vault.getRoot();
      
    if (!folder || !(folder instanceof TFolder)) {
      throw new Error(`Directory not found: ${directory || 'root'}`);
    }
    
    return folder.children.map(file => file.name);
  }
  
  async getFile(path: string): Promise<ObsidianFileResponse> {
    const file = this.app.vault.getAbstractFileByPath(path);
    
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }
    
    // Handle images vs text files
    if (this.isImageFile(path)) {
      const arrayBuffer = await this.app.vault.readBinary(file);
      return this.processImageResponse(arrayBuffer, path);
    } else {
      const content = await this.app.vault.read(file);
      return { content, path, stat: file.stat };
    }
  }
  
  async searchSimple(query: string): Promise<any[]> {
    // Use Obsidian's built-in search or implement file-based search
    return this.performDirectSearch(query);
  }
  
  // ... implement all other methods with direct API calls
}
```

## Performance Improvements

### HTTP vs. Direct API Comparison

| Operation | HTTP (Current) | Direct API (New) | Improvement |
|-----------|----------------|------------------|-------------|
| File Read | ~50-100ms | ~1-5ms | 10-50x faster |
| File List | ~30-60ms | ~1-3ms | 10-20x faster |
| Search | ~100-300ms | ~10-50ms | 5-10x faster |
| Patch Operations | ~80-150ms | ~5-15ms | 10-15x faster |

### Direct API Advantages

1. **No Network Overhead**: Eliminate HTTP request/response cycles
2. **No Serialization**: Direct object access instead of JSON serialization
3. **Real-time Updates**: Direct access to Obsidian's reactive system
4. **Enhanced Metadata**: Access to internal file properties and relationships
5. **Memory Efficiency**: Shared memory space instead of separate processes

## Enhanced Capabilities - Beyond REST API Limitations

### Rich Obsidian API Access

The HTTP REST API plugin only exposes a subset of Obsidian's capabilities. With direct plugin access, we get the full API:

**File System & Vault Operations:**
```typescript
// Rich file metadata and relationships
const file = this.app.vault.getAbstractFileByPath(path);
const metadata = this.app.metadataCache.getFileCache(file);
const backlinks = this.app.metadataCache.getBacklinksForFile(file);

// Real-time file watching and change events
this.app.vault.on('modify', (file) => {
  this.notifyMCPClients('file-changed', { path: file.path, metadata });
});

// Canvas API access
const canvasView = this.app.workspace.getActiveViewOfType(ItemView);
if (canvasView?.getViewType() === 'canvas') {
  const canvasData = canvasView.canvas.getData();
  // Rich canvas manipulation and querying
}
```

**Workspace & UI Integration:**
```typescript
// Advanced workspace manipulation
this.app.workspace.openLinkText(linkText, sourcePath, newLeaf);
this.app.workspace.setActiveLeaf(leaf);
this.app.workspace.revealActiveFile();

// Plugin ecosystem integration
const dataviewAPI = this.app.plugins.plugins['dataview']?.api;
const templaterAPI = this.app.plugins.plugins['templater-obsidian']?.templater;

// Internal search and indexing
const searchPlugin = this.app.internalPlugins.plugins['global-search'];
const searchResults = searchPlugin?.instance?.searchIndex?.search(query);
```

**Advanced Metadata & Links:**
```typescript
// Rich metadata extraction
const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
const tags = this.app.metadataCache.getTags();
const links = this.app.metadataCache.getLinks();

// Graph analysis
const resolvedLinks = this.app.metadataCache.resolvedLinks;
const unresolvedLinks = this.app.metadataCache.unresolvedLinks;
```

**Community Plugin Integration:**
```typescript
// Dataview queries and data
if (this.app.plugins.plugins['dataview']?.api) {
  const dv = this.app.plugins.plugins['dataview'].api;
  const pages = dv.pages().where(p => p.tags?.includes('#important'));
}

// Excalidraw drawings
if (this.app.plugins.plugins['obsidian-excalidraw-plugin']) {
  // Access and manipulate Excalidraw content
}

// Daily notes integration
const dailyNotesPlugin = this.app.plugins.plugins['daily-notes'];
const todaysNote = dailyNotesPlugin?.getTodaysNote();
```

This gives us semantic operations that are **impossible** with the REST API layer - rich metadata, real-time events, plugin ecosystem access, and advanced workspace manipulation.

### Enhanced Search Implementation

Combine multiple search strategies for comprehensive results:

```typescript
async performEnhancedSearch(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  // 1. Obsidian's native search (if available)
  try {
    const nativeResults = await this.searchWithObsidianIndex(query);
    results.push(...nativeResults);
  } catch (e) {
    // Fallback to file-based search
  }
  
  // 2. Filename-based search (for media files)
  const filenameResults = await this.searchByFilename(query);
  results.push(...filenameResults);
  
  // 3. Tag and link search
  const metadataResults = await this.searchMetadata(query);
  results.push(...metadataResults);
  
  // 4. Plugin integration (Dataview, etc.)
  const pluginResults = await this.searchWithPlugins(query);
  results.push(...pluginResults);
  
  return this.deduplicateAndSort(results);
}
```

## MCP Protocol Integration

### HTTP MCP Server Embedding

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import express from 'express';

export class MCPHttpServer {
  private mcpServer: Server;
  private httpServer: express.Application;
  private obsidianAPI: ObsidianAPI;
  
  constructor(app: App) {
    this.obsidianAPI = new ObsidianAPI(app);
    this.setupMCPServer();
    this.setupHttpEndpoints();
  }
  
  private setupHttpEndpoints() {
    // REST API compatibility endpoints
    this.httpServer.get('/vault/:path', async (req, res) => {
      const result = await this.obsidianAPI.getFile(req.params.path);
      res.json(result);
    });
    
    // MCP protocol endpoint
    this.httpServer.post('/mcp', async (req, res) => {
      // Handle MCP protocol over HTTP
      const mcpResponse = await this.handleMCPRequest(req.body);
      res.json(mcpResponse);
    });
  }
}
```

## Plugin Lifecycle Integration

### Obsidian Plugin Structure

```typescript
import { Plugin, Setting, PluginSettingTab } from 'obsidian';

export default class ObsidianMCPPlugin extends Plugin {
  private mcpServer: MCPHttpServer;
  private obsidianAPI: ObsidianAPI;
  
  async onload() {
    console.log('Loading Obsidian MCP Plugin');
    
    // Initialize API abstraction layer
    this.obsidianAPI = new ObsidianAPI(this.app);
    
    // Start HTTP server for MCP and REST endpoints
    this.mcpServer = new MCPHttpServer(this.app);
    await this.mcpServer.start();
    
    // Add settings tab
    this.addSettingTab(new MCPSettingTab(this.app, this));
    
    // Register commands
    this.addCommand({
      id: 'restart-mcp-server',
      name: 'Restart MCP Server',
      callback: () => this.restartMCPServer()
    });
  }
  
  async onunload() {
    console.log('Unloading Obsidian MCP Plugin');
    await this.mcpServer.stop();
  }
}
```

## Migration Strategy

### Preserving Backward Compatibility

1. **API Interface Preservation**: Exact method signatures maintained
2. **Response Format Compatibility**: Identical JSON response structures  
3. **Error Handling Consistency**: Same error types and messages
4. **Configuration Migration**: Automatic settings import from REST API plugin

### Gradual Migration Path

1. **Phase 1**: Plugin provides both HTTP REST and MCP endpoints
2. **Phase 2**: Enhanced features only available via plugin (performance benefits)
3. **Phase 3**: Deprecation notice for separate REST API plugin setup
4. **Phase 4**: Full migration to plugin-native approach

This architecture ensures we can reuse all existing MCP server logic while gaining significant performance improvements and new capabilities through direct Obsidian API integration.