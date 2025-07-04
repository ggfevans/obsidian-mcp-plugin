# Obsidian MCP Plugin

A high-performance Model Context Protocol (MCP) server implemented as an Obsidian plugin, providing AI tools with direct vault access through HTTP transport.

## Overview

This plugin brings MCP capabilities directly into Obsidian, eliminating the need for external servers or the REST API plugin. It provides semantic, AI-optimized operations that consolidate multiple tools into intelligent workflows with contextual hints.

### Key Features

- **Direct Obsidian Integration**: Runs natively within Obsidian for maximum performance
- **HTTP MCP Transport**: Compatible with Claude Desktop, Claude Code, Cline, and other MCP clients
- **Semantic Operations**: Enhanced search with Obsidian operators, intelligent fragment retrieval, and workflow guidance
- **No External Dependencies**: No need for the REST API plugin or external servers
- **High Performance**: Sub-100ms response times with direct vault access

## Installation

### Via BRAT (Beta Reviewer's Auto-update Tool)

1. **Install BRAT**:
   - Open Obsidian Settings → Community Plugins
   - Browse and search for "BRAT"
   - Install and enable the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat)

2. **Add This Plugin**:
   - In Obsidian settings, go to BRAT settings
   - Click "Add Beta Plugin"
   - Enter: `aaronsb/obsidian-mcp-plugin`
   - Click "Add Plugin"

3. **Enable the Plugin**:
   - Go to Settings → Community Plugins
   - Find "Obsidian MCP Plugin" and enable it
   - The plugin will auto-update through BRAT

## Configuration

1. **Enable the Server**:
   - Go to plugin settings
   - Toggle "Enable HTTP Server" 
   - Default port is 3001 (configurable)

2. **Connect Your MCP Client**:

   ### Claude Code
   ```bash
   claude mcp add obsidian http://localhost:3001/mcp --transport http
   ```

   ### Claude Desktop / Other Clients
   Add to your configuration file:
   ```json
   {
     "mcpServers": {
       "obsidian": {
         "transport": {
           "type": "http",
           "url": "http://localhost:3001/mcp"
         }
       }
     }
   }
   ```

   Configuration file locations:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

## Available Tools

### 🗂️ `vault` - File and Folder Operations
- **list** - List files and directories
- **read** - Read file content with fragments for large files
- **create** - Create new files and directories
- **update** - Update existing files
- **delete** - Delete files and folders
- **search** - Enhanced search with Obsidian operators
- **fragments** - Get relevant excerpts from files

**Search Operators**:
- `file:` - Search by filename or extension (e.g., `file:.png`)
- `path:` - Search in file paths
- `content:` - Search only in file content
- `tag:` - Search for tags
- `"exact phrase"` - Search for exact phrases
- `term1 OR term2` - Search for either term
- `/regex/flags` - Regular expression search

### ✏️ `edit` - Smart Editing Operations  
- **window** - Edit with automatic content buffering
- **append** - Append content to files
- **patch** - Intelligent patching with fuzzy matching
- **at_line** - Edit at specific line numbers
- **from_buffer** - Recover content from edit buffers

### 👁️ `view` - Content Viewing and Navigation
- **file** - View complete files with metadata
- **window** - View content windows with context
- **active** - Get currently active file
- **open_in_obsidian** - Open files in Obsidian

### 🔄 `workflow` - AI Workflow Guidance
- **suggest** - Get contextual suggestions based on current operations

### 🕸️ `graph` - Graph Traversal and Link Analysis
- **traverse** - Explore connected nodes from a starting point
- **neighbors** - Get immediate connections of a file
- **path** - Find paths between two nodes
- **statistics** - Get link counts and statistics for files
- **backlinks** - Find all incoming links to a file
- **forwardlinks** - Find all outgoing links from a file
- **search-traverse** - Search-based graph traversal with snippet chains
- **advanced-traverse** - Multi-query traversal with strategies (breadth-first, best-first, beam-search)

**Graph Features**:
- Follow links, backlinks, and tags during traversal
- Filter by file patterns, folders, or tags
- Control traversal depth and maximum nodes
- Get relevance scores and snippet chains
- Support for orphaned notes and unresolved links

### ⚙️ `system` - System Operations
- **info** - Get vault and plugin information
- **commands** - List and execute Obsidian commands
- **fetch_web** - Fetch and convert web content to markdown

## MCP Resources

- **`obsidian://vault-info`** - Real-time vault metadata including file counts, active file, and plugin status

## Key Improvements Over External MCP Servers

1. **Performance**: Direct vault access eliminates HTTP overhead
2. **Search**: Uses Obsidian's native search with advanced operators
3. **Integration**: Access to full Obsidian API and plugin ecosystem
4. **Simplicity**: Single plugin installation, no external dependencies
5. **Reliability**: No separate processes to manage or crash

## Architecture

This plugin implements the same semantic operations as [obsidian-semantic-mcp](https://github.com/aaronsb/obsidian-semantic-mcp) but runs directly within Obsidian:

```
Before: AI Tool → MCP Server → REST API Plugin → Obsidian
Now:    AI Tool → MCP Plugin (within Obsidian)
```

The critical `ObsidianAPI` abstraction layer is preserved, allowing all semantic operations to work identically while gaining the performance benefits of direct integration.

## Testing Status

✅ **Working Features**:
- All 6 semantic tools with all actions
- Enhanced search with Obsidian operators
- Graph traversal and link analysis
- Image viewing and file operations
- Fragment retrieval for large files
- Workflow hints and guidance
- Multi-vault support
- Port collision detection

⚡ **Performance Results**:
- File operations: <10ms (vs ~50-100ms with REST API)
- Search operations: <50ms (vs ~100-300ms)
- Zero network overhead

## Development

```bash
# Clone to your vault's plugins folder
git clone https://github.com/aaronsb/obsidian-mcp-plugin .obsidian/plugins/obsidian-mcp-plugin

# Install dependencies
npm install

# Build for development
npm run dev

# Build for production
npm run build
```

## Support

- **Issues**: [GitHub Issues](https://github.com/aaronsb/obsidian-mcp-plugin/issues)
- **Discussions**: [GitHub Discussions](https://github.com/aaronsb/obsidian-mcp-plugin/discussions)

## License

MIT

---

*This plugin brings the power of semantic MCP directly into Obsidian, providing AI tools with intelligent, high-performance vault access.*