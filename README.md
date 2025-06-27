# Obsidian MCP Plugin

A hybrid Obsidian plugin that combines the functionality of the Local REST API plugin with an embedded MCP (Model Context Protocol) server, providing both HTTP REST endpoints and streamable MCP protocol access for AI tools.

## Architecture Overview

This plugin is designed as a clean evolution of two existing projects:
- **coddingtonbear/obsidian-local-rest-api**: Provides HTTP REST API access to Obsidian
- **aaronsb/obsidian-semantic-mcp**: Provides semantic MCP operations with enhanced search, fragment retrieval, and AI-optimized workflows

### Key Innovation: Abstraction Layer Preservation

The critical architectural decision is to **preserve the existing `ObsidianAPI` abstraction layer** while replacing its HTTP-based implementation with direct Obsidian plugin API calls. This allows us to:

1. **Reuse all existing MCP server logic** without modification
2. **Maintain API compatibility** with existing integrations  
3. **Improve performance** by eliminating HTTP overhead
4. **Add new capabilities** only possible with direct plugin access

## Goals & Requirements

### Primary Goals

1. **Seamless Migration**: Drop-in replacement for separate REST API plugin + MCP server setup
2. **Performance Enhancement**: Direct vault access instead of HTTP round-trips
3. **Extended Capabilities**: Access to Obsidian internals not available via REST API
4. **Dual Protocol Support**: Both HTTP REST and MCP protocols from single plugin
5. **Community Ready**: Proper plugin structure for BRAT testing and official submission

### Technical Requirements

#### Core Functionality Preservation
- ✅ All existing REST API endpoints from coddingtonbear's plugin
- ✅ All semantic MCP operations from our existing server
- ✅ Enhanced search with content snippets and media file discovery
- ✅ Fragment retrieval and intelligent content extraction
- ✅ Workflow hints and contextual suggestions

#### Architecture Requirements
- ✅ Plugin-native implementation (no external processes)
- ✅ Direct Obsidian API integration via `app.vault.*` and `app.workspace.*`
- ✅ HTTP server for REST and MCP protocol endpoints
- ✅ Maintained abstraction layer for code reuse
- ✅ TypeScript implementation with proper types

#### Performance Requirements
- ✅ Sub-100ms response times for file operations
- ✅ Efficient search with combined API + filename results
- ✅ Memory-efficient fragment retrieval
- ✅ Minimal plugin startup time

#### Compatibility Requirements
- ✅ Obsidian API version compatibility
- ✅ Cross-platform support (Windows, macOS, Linux)
- ✅ Mobile Obsidian compatibility considerations
- ✅ Plugin ecosystem integration capabilities

## Implementation Plan

### Phase 1: Foundation (Initial BRAT Release)
1. **Fork and Setup**
   - Fork REST API plugin codebase
   - Set up TypeScript build pipeline
   - Create proper plugin manifest and structure

2. **Direct API Implementation**
   - Replace `ObsidianAPI` HTTP calls with direct vault operations
   - Implement plugin lifecycle management
   - Add error handling for plugin context

3. **MCP Server Integration**
   - Embed semantic router and operations
   - Add HTTP MCP protocol endpoints
   - Preserve existing semantic operations

### Phase 2: Enhancement (BRAT Testing)
1. **Advanced Features**
   - Real-time vault change notifications
   - Enhanced metadata access (tags, links, frontmatter)
   - Plugin ecosystem integration hooks

2. **Performance Optimization**
   - Caching layer for frequently accessed files
   - Efficient search indexing
   - Memory usage optimization

3. **Testing & Iteration**
   - Community feedback via BRAT
   - Performance benchmarking
   - API stability testing

### Phase 3: Production (Official Submission)
1. **Documentation & Polish**
   - Complete user documentation
   - Developer API documentation
   - Migration guides from existing setups

2. **Official Submission**
   - Obsidian plugin directory submission
   - Community announcement
   - Support and maintenance plan

## Technical Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Obsidian MCP Plugin                      │
├─────────────────────────────────────────────────────────────┤
│  HTTP Server (Express/Fastify)                             │
│  ├── REST API Endpoints (coddingtonbear compatibility)     │
│  └── MCP Protocol Endpoints (streamable)                   │
├─────────────────────────────────────────────────────────────┤
│  Semantic Operations Layer                                  │
│  ├── Enhanced Search (API + filename + snippets)           │
│  ├── Fragment Retrieval                                     │
│  ├── Workflow Hints                                         │
│  └── File Type Detection                                    │
├─────────────────────────────────────────────────────────────┤
│  ObsidianAPI Abstraction Layer (CRITICAL)                  │
│  ├── Direct Vault Operations (app.vault.*)                 │
│  ├── Workspace Operations (app.workspace.*)                │
│  ├── Search Integration                                     │
│  └── Plugin Lifecycle Management                           │
├─────────────────────────────────────────────────────────────┤
│  Obsidian Plugin Foundation                                 │
│  ├── Plugin Class & Lifecycle                              │
│  ├── Settings Management                                    │
│  ├── UI Components (optional)                              │
│  └── Error Handling                                        │
└─────────────────────────────────────────────────────────────┘
```

### Key Abstraction Layer Transformation

**Current (HTTP-based):**
```typescript
class ObsidianAPI {
  async getFile(path: string): Promise<ObsidianFileResponse> {
    const response = await this.client.get(`/vault/${path}`);
    return response.data;
  }
}
```

**New (Direct plugin API):**
```typescript
class ObsidianAPI {
  constructor(private app: App) {}
  
  async getFile(path: string): Promise<ObsidianFileResponse> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const content = await this.app.vault.read(file);
      return { content, path, stat: file.stat };
    }
    throw new Error(`File not found: ${path}`);
  }
}
```

## Development Workflow

### Local Development
1. Clone repo to Obsidian plugins folder: `.obsidian/plugins/obsidian-mcp-plugin/`
2. Install dependencies: `npm install`
3. Build and watch: `npm run dev`
4. Reload plugin in Obsidian: Ctrl/Cmd+P → "Reload app without saving"

### BRAT Testing
1. Push changes to GitHub
2. Users install via BRAT: `aaronsb/obsidian-mcp-plugin`
3. Automatic updates for testers
4. Collect feedback and iterate

### Official Release
1. Final testing and documentation
2. Create GitHub release with plugin assets
3. Submit to Obsidian plugin directory
4. Community announcement

## Success Metrics

### Technical Metrics
- ⚡ **Performance**: 50%+ faster than HTTP-based approach
- 🔍 **Search Quality**: Enhanced results with snippets + media files
- 🛠️ **Compatibility**: 100% API compatibility with existing tools
- 📈 **Adoption**: BRAT testing with community feedback

### Community Metrics
- 📥 **Installation**: Target 1000+ BRAT installations during testing
- ⭐ **Reviews**: Positive feedback on functionality and performance
- 🔧 **Integration**: AI tools adopting the plugin for Obsidian access
- 📖 **Documentation**: Clear migration path from existing setups

## Next Steps

1. **Repository Setup**: Initialize TypeScript plugin structure
2. **Core Implementation**: Begin ObsidianAPI direct integration
3. **MCP Integration**: Embed existing semantic operations
4. **BRAT Preparation**: Prepare for beta testing release

---

*This plugin represents the natural evolution of Obsidian AI integration, combining the best of REST API access with semantic MCP operations in a single, high-performance package.*