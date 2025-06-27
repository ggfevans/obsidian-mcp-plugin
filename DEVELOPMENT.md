# Development Guide

## Testing the HTTP MCP Server with Claude Code

This plugin implements an HTTP MCP server that can be used with Claude Code's new streamable HTTP transport feature.

### Plugin Setup

1. **Install via BRAT**:
   ```
   Command palette → "BRAT: Add a beta plugin for testing"
   Enter: aaronsb/obsidian-mcp-plugin
   ```

2. **Configure the plugin**:
   - Settings → Obsidian MCP Plugin
   - Ensure "Enable HTTP Server" is checked
   - Default port is 3001 (different from REST API plugin to avoid conflicts)
   - Status bar should show "MCP: :3001" when running

### Claude Code Integration

1. **Add the MCP server to Claude Code**:
   ```bash
   claude mcp add obsidian-test http://localhost:3001/mcp --transport http
   ```

2. **Test the connection**:
   - The plugin provides an "echo" tool for testing
   - Health check available at: http://localhost:3001/
   - MCP endpoint at: http://localhost:3001/mcp

3. **Use the echo tool**:
   - In Claude Code, you can now use the echo tool
   - It will respond with your message plus Obsidian context (vault name, active file)
   - This confirms the HTTP MCP transport is working!

### Example Echo Tool Usage

When you use the echo tool in Claude Code, you should see something like:

```
Echo from Obsidian MCP Plugin!

Original message: Hello from Claude Code!
Vault name: my-obsidian-vault
Active file: daily-notes/2024-01-15.md
Timestamp: 2024-01-15T10:30:00.000Z

This confirms the HTTP MCP transport is working between Claude Code and the Obsidian plugin! 🎉
```

### Development Workflow

1. **Make changes to the plugin**
2. **Bump version** in manifest.json (e.g., 0.1.1 → 0.1.2)
3. **Push to main** - GitHub Action automatically creates release
4. **BRAT auto-updates** the plugin for testers

### Architecture Notes

- **Port Configuration**: Uses 3001/3002 by default (different from REST API plugin's 27123/27124)
- **Protocol**: Implements HTTP MCP transport (not stdio)
- **Endpoints**:
  - `GET /` - Health check with server info
  - `POST /mcp` - MCP protocol endpoint for tools/list and tools/call
- **Tools**: Currently implements "echo" tool for testing connectivity

### Next Steps

Once the echo tool is working, we can implement:
- Full vault operations (read, write, search)
- Enhanced search with content snippets
- Direct ObsidianAPI integration for performance
- Complete MCP protocol compliance