import express from 'express';
import cors from 'cors';
import { App } from 'obsidian';
import { createServer, Server } from 'http';
import { Server as MCPServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest,
  type CallToolResult,
  type Tool
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { getVersion } from './version';


export class MCPHttpServer {
  private app: express.Application;
  private server?: Server;
  private mcpServer: MCPServer;
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();
  private obsidianApp: App;
  private port: number;
  private isRunning: boolean = false;

  constructor(obsidianApp: App, port: number = 3001) {
    this.obsidianApp = obsidianApp;
    this.port = port;
    
    // Initialize MCP Server
    this.mcpServer = new MCPServer(
      {
        name: 'obsidian-mcp-plugin',
        version: getVersion()
      },
      {
        capabilities: {
          tools: {},
        }
      }
    );

    this.setupMCPHandlers();
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMCPHandlers(): void {
    // Register the echo tool
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'echo',
            description: 'Echo back the input message with Obsidian context',
            inputSchema: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  description: 'Message to echo back'
                }
              },
              required: ['message']
            }
          } as Tool
        ]
      };
    });

    // Handle tool calls
    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;

      if (name === 'echo') {
        const message = args?.message as string;
        const vaultName = this.obsidianApp.vault.getName();
        const activeFile = this.obsidianApp.workspace.getActiveFile();
        const fileCount = this.obsidianApp.vault.getAllLoadedFiles().length;
        
        console.log(`🔊 Echo tool called with message: "${message}"`);
        
        return {
          content: [
            {
              type: 'text',
              text: `🎉 Echo from Obsidian MCP Plugin!

📝 Original message: ${message}
📚 Vault name: ${vaultName}
📄 Active file: ${activeFile?.name || 'None'}
📊 Total files: ${fileCount}
⏰ Timestamp: ${new Date().toISOString()}

✨ This confirms the HTTP MCP transport is working between Claude Code and the Obsidian plugin!

🔧 Plugin version: ${getVersion()}
🌐 Transport: HTTP MCP via Express.js + MCP SDK
🎯 Status: Connected and operational`
            }
          ]
        };
      }

      throw new Error(`Unknown tool: ${name}`);
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
        console.log(`🔚 Closed MCP session: ${sessionId}`);
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
}