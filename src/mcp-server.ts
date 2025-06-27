import express from 'express';
import cors from 'cors';
import { App } from 'obsidian';
import { createServer, Server } from 'http';
import { Server as MCPServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  isInitializeRequest,
  type CallToolResult,
  type Tool
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { getVersion } from './version';
import { ObsidianAPI } from './utils/obsidian-api';
import { semanticTools } from './tools/semantic-tools';


export class MCPHttpServer {
  private app: express.Application;
  private server?: Server;
  private mcpServer: MCPServer;
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();
  private obsidianApp: App;
  private obsidianAPI: ObsidianAPI;
  private port: number;
  private isRunning: boolean = false;
  private connectionCount: number = 0;

  constructor(obsidianApp: App, port: number = 3001) {
    this.obsidianApp = obsidianApp;
    this.port = port;
    
    // Initialize ObsidianAPI with direct plugin access
    this.obsidianAPI = new ObsidianAPI(obsidianApp);
    
    // Initialize MCP Server
    this.mcpServer = new MCPServer(
      {
        name: 'obsidian-mcp-plugin',
        version: getVersion()
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        }
      }
    );

    this.setupMCPHandlers();
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMCPHandlers(): void {
    // Register semantic tools following the proven pattern from obsidian-semantic-mcp
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: semanticTools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      };
    });

    // Handle tool calls
    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;
      
      const tool = semanticTools.find(t => t.name === name);
      if (!tool) {
        throw new Error(`Tool not found: ${name}`);
      }
      
      console.log(`🔧 Executing semantic tool: ${name} with action: ${args?.action}`);
      
      // Use the tool handler with our direct ObsidianAPI
      return await tool.handler(this.obsidianAPI, args);
    });

    // Handle resource listing
    this.mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'obsidian://vault-info',
            name: 'Vault Information',
            description: 'Current vault status, file counts, and metadata',
            mimeType: 'application/json'
          }
        ]
      };
    });

    // Handle resource reading
    this.mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      if (uri === 'obsidian://vault-info') {
        const vaultName = this.obsidianApp.vault.getName();
        const activeFile = this.obsidianApp.workspace.getActiveFile();
        const allFiles = this.obsidianApp.vault.getAllLoadedFiles();
        const markdownFiles = this.obsidianApp.vault.getMarkdownFiles();
        
        const vaultInfo = {
          vault: {
            name: vaultName,
            path: (this.obsidianApp.vault.adapter as any).basePath || 'Unknown'
          },
          activeFile: activeFile ? {
            name: activeFile.name,
            path: activeFile.path,
            basename: activeFile.basename,
            extension: activeFile.extension
          } : null,
          files: {
            total: allFiles.length,
            markdown: markdownFiles.length,
            attachments: allFiles.length - markdownFiles.length
          },
          plugin: {
            version: getVersion(),
            status: 'Connected and operational',
            transport: 'HTTP MCP via Express.js + MCP SDK'
          },
          timestamp: new Date().toISOString()
        };

        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(vaultInfo, null, 2)
          }]
        };
      }
      
      throw new Error(`Resource not found: ${uri}`);
    });
  }

  private setupMiddleware(): void {
    // CORS middleware for Claude Code and MCP clients
    this.app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'Mcp-Session-Id'],
      exposedHeaders: ['Mcp-Session-Id']
    }));

    // JSON body parser
    this.app.use(express.json());

    // Request logging for debugging
    this.app.use((req, res, next) => {
      console.log(`📡 ${req.method} ${req.url}`, req.body ? JSON.stringify(req.body).substring(0, 200) : '');
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/', (req, res) => {
      const response = {
        name: 'obsidian-mcp-plugin',
        version: getVersion(),
        status: 'running',
        vault: this.obsidianApp.vault.getName(),
        timestamp: new Date().toISOString()
      };
      
      console.log('📊 Health check requested');
      res.json(response);
    });


    // MCP protocol endpoint - using StreamableHTTPServerTransport
    this.app.post('/mcp', async (req, res) => {
      await this.handleMCPRequest(req, res);
    });

    // Handle session deletion
    this.app.delete('/mcp', (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      
      if (sessionId && this.transports.has(sessionId)) {
        const transport = this.transports.get(sessionId)!;
        transport.close();
        this.transports.delete(sessionId);
        this.connectionCount = Math.max(0, this.connectionCount - 1);
        console.log(`🔚 Closed MCP session: ${sessionId} (Remaining: ${this.connectionCount})`);
        res.status(200).json({ message: 'Session closed' });
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    });
  }

  private async handleMCPRequest(req: any, res: any): Promise<void> {
    try {
      const request = req.body;
      console.log('📨 MCP Request:', request.method, request.params);

      // Get or create session ID
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;
      let effectiveSessionId = sessionId;

      if (sessionId && this.transports.has(sessionId)) {
        // Use existing transport for this session
        transport = this.transports.get(sessionId)!;
      } else if (!sessionId && isInitializeRequest(request)) {
        // New initialization request - create new transport with session
        effectiveSessionId = randomUUID();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => effectiveSessionId!
        });
        
        // Connect the MCP server to this transport
        await this.mcpServer.connect(transport);
        
        // Store the transport for future requests
        this.transports.set(effectiveSessionId, transport);
        this.connectionCount++;
        console.log(`🔗 New MCP connection: ${effectiveSessionId} (Total: ${this.connectionCount})`);
        
        console.log(`🔗 Created new MCP session: ${effectiveSessionId}`);
      } else {
        // Handle stateless requests or create temporary transport
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined // Stateless mode
        });
        await this.mcpServer.connect(transport);
      }

      // Set session header if we have one
      if (effectiveSessionId) {
        res.setHeader('Mcp-Session-Id', effectiveSessionId);
      }

      // Handle the request using the transport
      await transport.handleRequest(req, res, request);
      
      console.log('📤 MCP Response sent via transport');

    } catch (error) {
      console.error('❌ MCP request error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error: ' + (error instanceof Error ? error.message : 'Unknown error')
          },
          id: null
        });
      }
    }
  }


  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`MCP server already running on port ${this.port}`);
      return;
    }

    return new Promise<void>((resolve, reject) => {
      this.server = createServer(this.app);
      
      this.server.listen(this.port, () => {
        this.isRunning = true;
        console.log(`🚀 MCP server started on http://localhost:${this.port}`);
        console.log(`📍 Health check: http://localhost:${this.port}/`);
        console.log(`🔗 MCP endpoint: http://localhost:${this.port}/mcp`);
        resolve();
      });

      this.server.on('error', (error: any) => {
        this.isRunning = false;
        console.error('❌ Failed to start MCP server:', error);
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    // Clean up all active transports
    for (const [sessionId, transport] of this.transports) {
      transport.close();
      console.log(`🔚 Closed MCP session on shutdown: ${sessionId}`);
    }
    this.transports.clear();

    return new Promise<void>((resolve) => {
      this.server?.close(() => {
        this.isRunning = false;
        console.log('👋 MCP server stopped');
        resolve();
      });
    });
  }

  getPort(): number {
    return this.port;
  }

  isServerRunning(): boolean {
    return this.isRunning;
  }

  getConnectionCount(): number {
    return this.connectionCount;
  }
}