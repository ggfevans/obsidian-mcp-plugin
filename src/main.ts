import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { MCPHttpServer } from './mcp-server';
import { getVersion } from './version';

interface MCPPluginSettings {
	httpEnabled: boolean;
	httpPort: number;
	httpsPort: number;
	enableSSL: boolean;
	debugLogging: boolean;
	showConnectionStatus: boolean;
	showProtocolInfo: boolean;
	autoDetectPortConflicts: boolean;
}

const DEFAULT_SETTINGS: MCPPluginSettings = {
	httpEnabled: false, // Start disabled to avoid server startup issues
	httpPort: 3001,
	httpsPort: 3002,
	enableSSL: false,
	debugLogging: false,
	showConnectionStatus: true,
	showProtocolInfo: false,
	autoDetectPortConflicts: true
};

export default class ObsidianMCPPlugin extends Plugin {
	settings!: MCPPluginSettings;
	mcpServer?: MCPHttpServer;
	private currentVaultName: string = '';
	private currentVaultPath: string = '';
	private vaultSwitchTimeout?: number;
	private statsUpdateInterval?: number;

	async onload() {
		console.log(`🚀 Starting Obsidian MCP Plugin v${getVersion()}`);
		
		try {
			await this.loadSettings();
			console.log('✅ Settings loaded');

			// Initialize vault context tracking
			this.initializeVaultContext();

			// Add settings tab
			this.addSettingTab(new MCPSettingTab(this.app, this));
			console.log('✅ Settings tab added');

			// Add command
			this.addCommand({
				id: 'restart-mcp-server',
				name: 'Restart MCP Server',
				callback: async () => {
					console.log('🔄 MCP Server restart requested');
					await this.stopMCPServer();
					if (this.settings.httpEnabled) {
						await this.startMCPServer();
					}
				}
			});
			console.log('✅ Command added');

			// Setup vault monitoring
			this.setupVaultMonitoring();

			// Start MCP server if enabled
			if (this.settings.httpEnabled) {
				await this.startMCPServer();
			}

			// Add status bar item
			this.updateStatusBar();
			console.log('✅ Status bar added');

			// Start stats update interval
			this.startStatsUpdates();

			console.log('🎉 Obsidian MCP Plugin loaded successfully');
		} catch (error) {
			console.error('❌ Error loading Obsidian MCP Plugin:', error);
			throw error; // Re-throw to show in Obsidian's plugin list
		}
	}

	async onunload() {
		console.log('👋 Unloading Obsidian MCP Plugin');
		
		// Clear vault monitoring
		if (this.vaultSwitchTimeout) {
			window.clearTimeout(this.vaultSwitchTimeout);
		}
		
		// Clear stats updates
		if (this.statsUpdateInterval) {
			window.clearInterval(this.statsUpdateInterval);
		}
		
		await this.stopMCPServer();
	}

	async startMCPServer(): Promise<void> {
		try {
			// Check for port conflicts if enabled
			if (this.settings.autoDetectPortConflicts) {
				const status = await this.checkPortConflict(this.settings.httpPort);
				if (status === 'in-use') {
					const suggestedPort = await this.findAvailablePort(this.settings.httpPort);
					new Notice(`Port ${this.settings.httpPort} is in use. Try port ${suggestedPort}`);
					this.updateStatusBar();
					return;
				}
			}

			console.log(`🚀 Starting MCP server on port ${this.settings.httpPort}...`);
			this.mcpServer = new MCPHttpServer(this.app, this.settings.httpPort, this);
			await this.mcpServer.start();
			this.updateStatusBar();
			console.log('✅ MCP server started successfully');
			if (this.settings.showConnectionStatus) {
				new Notice(`MCP server started on port ${this.settings.httpPort}`);
			}
		} catch (error) {
			console.error('❌ Failed to start MCP server:', error);
			new Notice(`Failed to start MCP server: ${error}`);
			this.updateStatusBar();
		}
	}

	async stopMCPServer(): Promise<void> {
		if (this.mcpServer) {
			console.log('🛑 Stopping MCP server...');
			await this.mcpServer.stop();
			this.mcpServer = undefined;
			this.updateStatusBar();
			console.log('✅ MCP server stopped');
		}
	}

	private statusBarItem?: HTMLElement;

	updateStatusBar(): void {
		if (this.statusBarItem) {
			this.statusBarItem.remove();
		}
		
		if (!this.settings.showConnectionStatus) {
			return;
		}

		this.statusBarItem = this.addStatusBarItem();
		
		if (!this.settings.httpEnabled) {
			this.statusBarItem.setText('MCP: Disabled');
			this.statusBarItem.setAttribute('style', 'color: var(--text-muted);');
		} else if (this.mcpServer?.isServerRunning()) {
			const vaultName = this.app.vault.getName();
			this.statusBarItem.setText(`MCP: ${vaultName}:${this.settings.httpPort}`);
			this.statusBarItem.setAttribute('style', 'color: var(--text-success);');
		} else {
			this.statusBarItem.setText('MCP: Error');
			this.statusBarItem.setAttribute('style', 'color: var(--text-error);');
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async checkPortConflict(port: number): Promise<'available' | 'this-server' | 'in-use'> {
		try {
			// Check if this is our own server
			if (this.mcpServer?.isServerRunning() && this.settings.httpPort === port) {
				return 'this-server';
			}

			// Try to create a temporary server to test port availability
			const testServer = require('http').createServer();
			return new Promise((resolve) => {
				testServer.listen(port, '127.0.0.1', () => {
					testServer.close(() => resolve('available')); // Port is available
				});
				testServer.on('error', () => resolve('in-use')); // Port is in use
			});
		} catch (error) {
			return 'available'; // Assume available if we can't test
		}
	}

	private async findAvailablePort(startPort: number): Promise<number> {
		for (let port = startPort + 1; port <= startPort + 100; port++) {
			const status = await this.checkPortConflict(port);
			if (status === 'available') {
				return port;
			}
		}
		return startPort + 1; // Fallback
	}

	getMCPServerInfo(): any {
		return {
			version: getVersion(),
			running: this.mcpServer?.isServerRunning() || false,
			port: this.settings.httpPort,
			vaultName: this.app.vault.getName(),
			vaultPath: this.getVaultPath(),
			toolsCount: 5, // Our 5 semantic tools
			resourcesCount: 1, // vault-info resource
			connections: this.mcpServer?.getConnectionCount() || 0
		};
	}

	private startStatsUpdates(): void {
		// Update stats every 3 seconds
		this.statsUpdateInterval = window.setInterval(() => {
			// Update status bar with latest info
			this.updateStatusBar();
		}, 3000);
	}

	private initializeVaultContext(): void {
		this.currentVaultName = this.app.vault.getName();
		this.currentVaultPath = this.getVaultPath();
		console.log(`📁 Initial vault context: ${this.currentVaultName} at ${this.currentVaultPath}`);
	}

	private getVaultPath(): string {
		try {
			// Try to get the vault path from the adapter
			return (this.app.vault.adapter as any).basePath || '';
		} catch (error) {
			return '';
		}
	}

	private setupVaultMonitoring(): void {
		// Monitor layout changes which might indicate vault context changes
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.checkVaultContext();
			})
		);

		// Monitor file operations that can help detect vault changes
		this.registerEvent(
			this.app.vault.on('create', () => {
				this.checkVaultContext();
			})
		);

		// Also monitor on active leaf changes
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.checkVaultContext();
			})
		);

		// Periodic check as fallback (every 30 seconds)
		this.registerInterval(
			window.setInterval(() => {
				this.checkVaultContext();
			}, 30000)
		);
	}

	private checkVaultContext(): void {
		const newVaultName = this.app.vault.getName();
		const newVaultPath = this.getVaultPath();

		// Check if vault has changed (name or path)
		if (newVaultName !== this.currentVaultName || 
			(newVaultPath && newVaultPath !== this.currentVaultPath)) {
			
			this.handleVaultSwitch(
				this.currentVaultName, 
				newVaultName, 
				this.currentVaultPath, 
				newVaultPath
			);
		}
	}

	private async handleVaultSwitch(
		oldVaultName: string, 
		newVaultName: string, 
		oldVaultPath: string, 
		newVaultPath: string
	): Promise<void> {
		console.log(`🔄 Vault switch detected: ${oldVaultName} → ${newVaultName}`);
		console.log(`📁 Path change: ${oldVaultPath} → ${newVaultPath}`);

		// Update current context
		this.currentVaultName = newVaultName;
		this.currentVaultPath = newVaultPath;

		// Show notification if enabled
		if (this.settings.showConnectionStatus) {
			new Notice(`MCP Plugin: Switched to vault "${newVaultName}"`);
		}

		// Restart MCP server to use new vault context
		if (this.settings.httpEnabled && this.mcpServer?.isServerRunning()) {
			console.log('🔄 Restarting MCP server for new vault context...');
			
			// Use a small delay to avoid rapid restarts
			if (this.vaultSwitchTimeout) {
				window.clearTimeout(this.vaultSwitchTimeout);
			}
			
			this.vaultSwitchTimeout = window.setTimeout(async () => {
				await this.stopMCPServer();
				await this.startMCPServer();
				console.log(`✅ MCP server restarted for vault: ${newVaultName}`);
			}, 1000); // 1 second delay
		}

		// Update status bar to reflect new vault
		this.updateStatusBar();
	}
}

class MCPSettingTab extends PluginSettingTab {
	plugin: ObsidianMCPPlugin;

	constructor(app: App, plugin: ObsidianMCPPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Obsidian MCP Plugin Settings'});

		// Connection Status Section
		this.createConnectionStatusSection(containerEl);
		
		// Server Configuration Section
		this.createServerConfigSection(containerEl);
		
		// UI Options Section
		this.createUIOptionsSection(containerEl);
		
		// Protocol Information Section (if enabled)
		if (this.plugin.settings.showProtocolInfo) {
			this.createProtocolInfoSection(containerEl);
		}
	}

	private createConnectionStatusSection(containerEl: HTMLElement): void {
		const statusEl = containerEl.createDiv('mcp-status-section');
		statusEl.createEl('h3', {text: 'Connection Status'});
		
		const info = this.plugin.getMCPServerInfo();
		if (info) {
			const statusGrid = statusEl.createDiv('mcp-status-grid');
			statusGrid.style.display = 'grid';
			statusGrid.style.gridTemplateColumns = '1fr 1fr';
			statusGrid.style.gap = '10px';
			statusGrid.style.margin = '10px 0';
			
			const createStatusItem = (label: string, value: string, color?: string) => {
				const item = statusGrid.createDiv();
				item.createEl('strong', {text: `${label}: `});
				const valueEl = item.createSpan({text: value});
				if (color) valueEl.style.color = color;
			};
			
			createStatusItem('Status', info.running ? 'Running' : 'Stopped', 
				info.running ? 'var(--text-success)' : 'var(--text-error)');
			createStatusItem('Port', info.port.toString());
			createStatusItem('Vault', info.vaultName);
			if (info.vaultPath) {
				createStatusItem('Path', info.vaultPath.length > 50 ? '...' + info.vaultPath.slice(-47) : info.vaultPath);
			}
			createStatusItem('Version', info.version);
			createStatusItem('Tools', info.toolsCount.toString());
			createStatusItem('Connections', info.connections.toString());
		} else {
			statusEl.createDiv({text: 'Server not running', cls: 'mcp-status-offline'});
		}
	}

	private createServerConfigSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', {text: 'Server Configuration'});

		new Setting(containerEl)
			.setName('Enable HTTP Server')
			.setDesc('Enable the HTTP server for MCP access (requires restart)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.httpEnabled)
				.onChange(async (value) => {
					this.plugin.settings.httpEnabled = value;
					await this.plugin.saveSettings();
				}));

		const portSetting = new Setting(containerEl)
			.setName('HTTP Port')
			.setDesc('Port for HTTP MCP server (default: 3001)')
			.addText(text => text
				.setPlaceholder('3001')
				.setValue(this.plugin.settings.httpPort.toString())
				.onChange(async (value) => {
					const port = parseInt(value);
					if (!isNaN(port) && port > 0 && port < 65536) {
						const oldPort = this.plugin.settings.httpPort;
						this.plugin.settings.httpPort = port;
						await this.plugin.saveSettings();
						
						// Auto-restart server if port changed and server is running
						if (oldPort !== port && this.plugin.mcpServer?.isServerRunning()) {
							new Notice(`Restarting MCP server on port ${port}...`);
							await this.plugin.stopMCPServer();
							await this.plugin.startMCPServer();
							// Refresh status after a short delay
							setTimeout(() => this.refreshConnectionStatus(), 500);
						}
						
						this.checkPortAvailability(port, portSetting);
					}
				}));
		
		// Check port availability on load
		this.checkPortAvailability(this.plugin.settings.httpPort, portSetting);

		new Setting(containerEl)
			.setName('Auto-detect Port Conflicts')
			.setDesc('Automatically detect and warn about port conflicts')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoDetectPortConflicts)
				.onChange(async (value) => {
					this.plugin.settings.autoDetectPortConflicts = value;
					await this.plugin.saveSettings();
				}));
	}

	private createUIOptionsSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', {text: 'Interface Options'});

		new Setting(containerEl)
			.setName('Show Connection Status')
			.setDesc('Show MCP server status in the status bar')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showConnectionStatus)
				.onChange(async (value) => {
					this.plugin.settings.showConnectionStatus = value;
					await this.plugin.saveSettings();
					this.plugin.updateStatusBar();
				}));

		new Setting(containerEl)
			.setName('Show Protocol Information')
			.setDesc('Display detailed MCP protocol information in settings')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showProtocolInfo)
				.onChange(async (value) => {
					this.plugin.settings.showProtocolInfo = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide protocol info
				}));

		new Setting(containerEl)
			.setName('Debug Logging')
			.setDesc('Enable detailed debug logging in console')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugLogging)
				.onChange(async (value) => {
					this.plugin.settings.debugLogging = value;
					await this.plugin.saveSettings();
				}));
	}

	private createProtocolInfoSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', {text: 'MCP Protocol Information'});
		
		const info = containerEl.createDiv('mcp-protocol-info');
		info.style.backgroundColor = 'var(--background-secondary)';
		info.style.padding = '15px';
		info.style.borderRadius = '5px';
		info.style.marginTop = '10px';
		
		const toolsList = [
			'🗂️ vault - File and folder operations with fragment support',
			'✏️ edit - Smart editing with content buffers', 
			'👁️ view - Content viewing and navigation',
			'🔄 workflow - AI workflow guidance and suggestions',
			'⚙️ system - System operations and web fetch'
		];
		
		info.createEl('h4', {text: 'Available Tools (5)'});
		const toolsListEl = info.createEl('ul');
		toolsList.forEach(tool => {
			toolsListEl.createEl('li', {text: tool});
		});
		
		info.createEl('h4', {text: 'Available Resources (1)'});
		const resourcesList = info.createEl('ul');
		resourcesList.createEl('li', {text: '📊 obsidian://vault-info - Real-time vault metadata'});
		
		info.createEl('h4', {text: 'Claude Code Connection'});
		const codeEl = info.createEl('code');
		codeEl.style.display = 'block';
		codeEl.style.padding = '10px';
		codeEl.style.backgroundColor = 'var(--background-primary)';
		codeEl.style.marginTop = '5px';
		codeEl.textContent = `claude mcp add obsidian http://localhost:${this.plugin.settings.httpPort}/mcp --transport http`;
	}

	private async checkPortAvailability(port: number, setting: Setting): Promise<void> {
		if (!this.plugin.settings.autoDetectPortConflicts) return;
		
		const status = await this.plugin.checkPortConflict(port);
		
		switch (status) {
			case 'available':
				setting.setDesc(`Port for HTTP MCP server (default: 3001) ✅ Available`);
				break;
			case 'this-server':
				setting.setDesc(`Port for HTTP MCP server (default: 3001) 🟢 This server`);
				break;
			case 'in-use':
				setting.setDesc(`Port for HTTP MCP server (default: 3001) ⚠️ Port ${port} in use`);
				break;
			default:
				setting.setDesc('Port for HTTP MCP server (default: 3001)');
		}
	}

	refreshConnectionStatus(): void {
		// Simply refresh the entire settings display to ensure accurate data
		// This is more reliable than trying to manually update DOM elements
		this.display();
	}
}