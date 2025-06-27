import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolResult,
  type Tool
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { App } from 'obsidian';

export class MCPHttpServer {
  private server: Server;
  private httpServer!: express.Application;
  private httpServerInstance: any;
  private obsidianApp: App;
  private port: number;
  private isRunning: boolean = false;

  constructor(obsidianApp: App, port: number = 3001) {
    this.obsidianApp = obsidianApp;
    this.port = port;
    this.server = new Server(
      {
        name: 'obsidian-mcp-plugin',
        version: '0.1.1'
      },
      {
        capabilities: {
          tools: {},
        }
      }
    );

    this.setupMCPHandlers();
    this.setupHttpServer();
  }

  private setupMCPHandlers() {
    // Register the echo tool
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
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
    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;

      if (name === 'echo') {
        const message = args?.message as string;
        const vaultName = this.obsidianApp.vault.getName();
        const activeFile = this.obsidianApp.workspace.getActiveFile();
        
        return {
          content: [
            {
              type: 'text',
              text: `Echo from Obsidian MCP Plugin!

Original message: ${message}
Vault name: ${vaultName}
Active file: ${activeFile?.name || 'None'}
Timestamp: ${new Date().toISOString()}

This confirms the HTTP MCP transport is working between Claude Code and the Obsidian plugin! 🎉`
            }
          ]
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  private setupHttpServer() {
    this.httpServer = express();
    
    // Enable CORS for Claude Code
    this.httpServer.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    this.httpServer.use(express.json());

    // Health check endpoint
    this.httpServer.get('/', (req, res) => {
      res.json({
        name: 'obsidian-mcp-plugin',
        version: '0.1.1',
        status: 'running',
        vault: this.obsidianApp.vault.getName(),
        timestamp: new Date().toISOString()
      });
    });

    // MCP protocol endpoint
    this.httpServer.post('/mcp', async (req, res) => {
      try {
        // For now, handle requests manually until we figure out the correct SDK API
        const request = req.body;
        
        if (request.method === 'tools/list') {
          const response = {
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
              }
            ]
          };
          res.json(response);
        } else if (request.method === 'tools/call' && request.params?.name === 'echo') {
          const message = request.params?.arguments?.message as string;
          const vaultName = this.obsidianApp.vault.getName();
          const activeFile = this.obsidianApp.workspace.getActiveFile();
          
          const response = {
            content: [
              {
                type: 'text',
                text: `Echo from Obsidian MCP Plugin!

Original message: ${message}
Vault name: ${vaultName}
Active file: ${activeFile?.name || 'None'}
Timestamp: ${new Date().toISOString()}

This confirms the HTTP MCP transport is working between Claude Code and the Obsidian plugin! 🎉`
              }
            ]
          };
          res.json(response);
        } else {
          res.status(404).json({
            error: 'Method not found',
            method: request.method
          });
        }
      } catch (error) {
        console.error('MCP request error:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`MCP server already running on port ${this.port}`);
      return;
    }

    return new Promise((resolve, reject) => {
      this.httpServerInstance = this.httpServer.listen(this.port, () => {
        this.isRunning = true;
        console.log(`MCP server started on http://localhost:${this.port}`);
        console.log(`Health check: http://localhost:${this.port}/`);
        console.log(`MCP endpoint: http://localhost:${this.port}/mcp`);
        resolve();
      });

      this.httpServerInstance.on('error', (error: any) => {
        this.isRunning = false;
        console.error('Failed to start MCP server:', error);
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.httpServerInstance) {
      return;
    }

    return new Promise((resolve) => {
      this.httpServerInstance.close(() => {
        this.isRunning = false;
        console.log('MCP server stopped');
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