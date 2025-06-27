# Obsidian MCP Plugin

A semantic MCP (Model Context Protocol) server implemented as an Obsidian plugin, providing AI tools with direct access to your vault through HTTP transport with intelligent semantic operations.

## 🎉 Current Status: v0.3.0 - Full Semantic Integration Complete!

✅ **Working HTTP MCP Transport** - Claude Code successfully connects  
✅ **5 Semantic Tools Implemented** - vault, edit, view, workflow, system  
✅ **Direct Obsidian API Integration** - Maximum performance, no HTTP overhead  
✅ **Fragment Retrieval System** - Advanced content indexing for large files  
✅ **Workflow Intelligence** - AI guidance and suggestions  
✅ **MCP Resources** - Real-time vault metadata via `obsidian://vault-info`  

## Quick Start

1. **Install via BRAT**: Add `aaronsb/obsidian-mcp-plugin` to BRAT
2. **Enable HTTP Server**: Go to plugin settings → Enable HTTP Server
3. **Connect Claude Code**: 
   ```bash
   claude mcp add obsidian http://localhost:3001/mcp --transport http
   ```
4. **Test Connection**: Use any semantic tool like `vault` with action `list`

## Architecture Overview

This plugin implements a semantic MCP server that runs natively within Obsidian, providing:
- **Direct Obsidian API Integration**: No external HTTP calls - direct vault access for maximum performance
- **Semantic Operations**: Enhanced search with content snippets, intelligent fragment retrieval, and contextual workflows
- **HTTP MCP Transport**: Claude Code and other AI tools can connect via streamable HTTP MCP protocol

### Key Innovation: ObsidianAPI Abstraction Layer

The critical architectural pattern is **preserving the existing `ObsidianAPI` abstraction layer** from our semantic MCP server while changing its implementation:

**Before (External MCP Server):**
```
MCP Server → ObsidianAPI → HTTP calls → REST API Plugin → Obsidian App
```

**Now (Plugin-Integrated MCP Server):**
```
MCP Server → ObsidianAPI → Direct calls → Obsidian App
```

This allows us to:
1. **Reuse all existing semantic MCP logic** without modification
2. **Provide the same Obsidian tools** as the MCP+REST approach
3. **Improve performance** by eliminating HTTP overhead  
4. **Access the full Obsidian API** - not limited to what the REST API plugin exposes
5. **Rich plugin ecosystem integration** - Dataview, Canvas, community plugins, etc.

## Goals & Requirements

### Primary Goals

1. **Native MCP Integration**: Run MCP server directly within Obsidian for optimal performance
2. **Semantic Intelligence**: Provide enhanced search, fragment retrieval, and contextual operations
3. **Direct Vault Access**: Eliminate HTTP overhead with direct Obsidian API integration
4. **HTTP Transport**: Support Claude Code's streamable HTTP MCP transport
5. **Community Ready**: Proper plugin structure for BRAT testing and official submission

### Technical Requirements

## Semantic Tools Available

The plugin provides 5 intelligent semantic tools, each with multiple actions:

### 🗂️ `vault` - File and Folder Operations
- **list** - List files and directories with optional filtering
- **read** - Read file content with fragment support for large files
- **create** - Create new files with automatic directory creation
- **update** - Update existing file content
- **delete** - Delete files and folders
- **search** - Enhanced search with content snippets and relevance scoring
- **fragments** - Advanced fragment retrieval for specific content sections

### ✏️ `edit` - Smart Editing Operations  
- **window** - Smart editing with automatic content buffering
- **append** - Append content to files
- **patch** - Intelligent patch operations with fuzzy matching
- **at_line** - Edit content at specific line numbers
- **from_buffer** - Recover and apply content from edit buffers

### 👁️ `view` - Content Viewing and Navigation
- **file** - View file content with metadata
- **window** - View content windows with context
- **active** - Get currently active file information
- **open_in_obsidian** - Open files in Obsidian interface

### 🔄 `workflow` - AI Workflow Guidance
- **suggest** - Get contextual workflow suggestions and efficiency hints based on current vault state and operation history

### ⚙️ `system` - System Operations
- **info** - Get vault and plugin information
- **commands** - List and execute Obsidian commands
- **fetch_web** - Fetch and convert web content to markdown

## MCP Resources

- **`obsidian://vault-info`** - Real-time vault metadata including file counts, active file, plugin status, and timestamps

## Technical Implementation Status

#### Core Functionality ✅ COMPLETE
- ✅ All semantic MCP operations integrated with direct API calls
- ✅ Enhanced search with content snippets and media file discovery  
- ✅ Fragment retrieval and intelligent content extraction
- ✅ Workflow hints and contextual suggestions
- ✅ HTTP MCP transport with session management
- ✅ Direct Obsidian plugin API integration

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