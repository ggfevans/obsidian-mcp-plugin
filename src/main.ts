import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { MCPHttpServer } from './mcp-server';
import { getVersion } from './version';

interface MCPPluginSettings {
	httpEnabled: boolean;
	httpPort: number;
	debugLogging: boolean;
	showConnectionStatus: boolean;
	autoDetectPortConflicts: boolean;
}

const DEFAULT_SETTINGS: MCPPluginSettings = {
	httpEnabled: true, // Start enabled by default
	httpPort: 3001,
	debugLogging: false,
	showConnectionStatus: true,
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

			// Start MCP server by default (unless explicitly disabled)
			if (this.settings.httpEnabled) {
				await this.startMCPServer();
			} else {
				console.log('⚠️ MCP server is disabled in settings');
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
			// Check for port conflicts and auto-switch if needed
			if (this.settings.autoDetectPortConflicts) {
				const status = await this.checkPortConflict(this.settings.httpPort);
				if (status === 'in-use') {
					const suggestedPort = await this.findAvailablePort(this.settings.httpPort);
					
					if (suggestedPort === 0) {
						// All alternate ports are busy
						const portsChecked = `${this.settings.httpPort}, ${this.settings.httpPort + 1}, ${this.settings.httpPort + 2}, ${this.settings.httpPort + 3}`;
						console.error(`❌ Failed to find available port after 3 attempts. Ports checked: ${portsChecked}`);
						console.error('Please check for other applications using these ports or firewall/security software blocking access.');
						new Notice(`Cannot start MCP server: Ports ${this.settings.httpPort}-${this.settings.httpPort + 3} are all in use. Check console for details.`);
						this.updateStatusBar();
						return;
					}
					
					console.log(`⚠️ Port ${this.settings.httpPort} is in use, switching to port ${suggestedPort}`);
					new Notice(`Port ${this.settings.httpPort} is in use. Switching to port ${suggestedPort}`);
					
					// Temporarily use the suggested port for this session
					this.mcpServer = new MCPHttpServer(this.app, suggestedPort, this);
					await this.mcpServer.start();
					this.updateStatusBar();
					console.log(`✅ MCP server started on alternate port ${suggestedPort}`);
					if (this.settings.showConnectionStatus) {
						new Notice(`MCP server started on port ${suggestedPort} (default port was in use)`);
					}
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
		const maxRetries = 3;
		for (let i = 1; i <= maxRetries; i++) {
			const port = startPort + i;
			const status = await this.checkPortConflict(port);
			if (status === 'available') {
				return port;
			}
			console.log(`Port ${port} is also in use, trying next...`);
		}
		// If all 3 alternate ports are busy, return 0 to indicate failure
		return 0;
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
			
			// Update live stats in settings panel if it's open
			const settingsTab = (this.app as any).setting?.activeTab;
			if (settingsTab && settingsTab instanceof MCPSettingTab) {
				settingsTab.updateLiveStats();
			}
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
		
		// Protocol Information Section (always show)
		this.createProtocolInfoSection(containerEl);
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
			.setName('MCP Server')
			.setDesc('The MCP server starts automatically when the plugin loads')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.httpEnabled)
				.onChange(async (value) => {
					this.plugin.settings.httpEnabled = value;
					await this.plugin.saveSettings();
					
					// Apply changes immediately
					if (value) {
						await this.plugin.startMCPServer();
					} else {
						await this.plugin.stopMCPServer();
					}
					
					// Update the status display
					this.display();
				}));

		const portSetting = new Setting(containerEl)
			.setName('HTTP Port')
			.setDesc('Port for HTTP MCP server (default: 3001)')
			.addText(text => {
				let pendingPort = this.plugin.settings.httpPort;
				let hasChanges = false;
				
				text.setPlaceholder('3001')
					.setValue(this.plugin.settings.httpPort.toString())
					.onChange((value) => {
						const port = parseInt(value);
						if (!isNaN(port) && port > 0 && port < 65536) {
							pendingPort = port;
							hasChanges = (port !== this.plugin.settings.httpPort);
							
							// Update button visibility and port validation
							this.updatePortApplyButton(portSetting, hasChanges, pendingPort);
							this.checkPortAvailability(port, portSetting);
						} else {
							hasChanges = false;
							this.updatePortApplyButton(portSetting, false, pendingPort);
						}
					});
				
				return text;
			})
			.addButton(button => {
				button.setButtonText('Apply')
					.setClass('mod-cta')
					.onClick(async () => {
						const textComponent = portSetting.components.find(c => (c as any).inputEl) as any;
						const newPort = parseInt(textComponent.inputEl.value);
						
						if (!isNaN(newPort) && newPort > 0 && newPort < 65536) {
							const oldPort = this.plugin.settings.httpPort;
							this.plugin.settings.httpPort = newPort;
							await this.plugin.saveSettings();
							
							// Auto-restart server if port changed and server is running
							if (oldPort !== newPort && this.plugin.mcpServer?.isServerRunning()) {
								new Notice(`Restarting MCP server on port ${newPort}...`);
								await this.plugin.stopMCPServer();
								await this.plugin.startMCPServer();
								setTimeout(() => this.refreshConnectionStatus(), 500);
							}
							
							// Hide apply button
							button.buttonEl.style.display = 'none';
							portSetting.setDesc('Port for HTTP MCP server (default: 3001)');
						}
					});
				
				// Initially hide the apply button
				button.buttonEl.style.display = 'none';
				return button;
			});
		
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
		const commandExample = info.createDiv('protocol-command-example');
		const codeEl = commandExample.createEl('code');
		codeEl.style.display = 'block';
		codeEl.style.padding = '10px';
		codeEl.style.backgroundColor = 'var(--background-primary)';
		codeEl.style.marginTop = '5px';
		codeEl.textContent = `claude mcp add obsidian http://localhost:${this.plugin.settings.httpPort}/mcp --transport http`;
		
		info.createEl('h4', {text: 'Client Configuration (Claude Desktop, Cline, etc.)'});
		const desktopDesc = info.createEl('p', {
			text: 'Add this to your MCP client configuration file:'
		});
		desktopDesc.style.marginBottom = '10px';
		
		const configExample = info.createDiv('desktop-config-example');
		const configEl = configExample.createEl('pre');
		configEl.style.display = 'block';
		configEl.style.padding = '10px';
		configEl.style.backgroundColor = 'var(--background-primary)';
		configEl.style.marginTop = '5px';
		configEl.style.overflowX = 'auto';
		configEl.style.fontSize = '12px';
		
		const configJson = {
			"mcpServers": {
				"obsidian": {
					"transport": {
						"type": "http",
						"url": `http://localhost:${this.plugin.settings.httpPort}/mcp`
					}
				}
			}
		};
		
		configEl.textContent = JSON.stringify(configJson, null, 2);
		
		const configPath = info.createEl('p', {
			text: 'Configuration file location:'
		});
		configPath.style.marginTop = '10px';
		configPath.style.fontSize = '12px';
		
		const pathList = configPath.createEl('ul');
		pathList.style.fontSize = '12px';
		pathList.createEl('li', {text: 'macOS: ~/Library/Application Support/Claude/claude_desktop_config.json'});
		pathList.createEl('li', {text: 'Windows: %APPDATA%\\Claude\\claude_desktop_config.json'});
		pathList.createEl('li', {text: 'Linux: ~/.config/Claude/claude_desktop_config.json'});
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

	private updatePortApplyButton(setting: Setting, hasChanges: boolean, pendingPort: number): void {
		const button = setting.components.find(c => (c as any).buttonEl) as any;
		if (button) {
			if (hasChanges) {
				button.buttonEl.style.display = '';
				setting.setDesc(`Port for HTTP MCP server (default: 3001) - Click Apply to change to ${pendingPort}`);
			} else {
				button.buttonEl.style.display = 'none';
				setting.setDesc('Port for HTTP MCP server (default: 3001)');
			}
		}
	}

	updateLiveStats(): void {
		// Update all dynamic elements in the settings panel without rebuilding
		const info = this.plugin.getMCPServerInfo();
		
		// Update connection status grid
		const connectionEl = document.querySelector('.mcp-status-grid');
		if (connectionEl) {
			const connectionItems = connectionEl.querySelectorAll('div');
			for (let i = 0; i < connectionItems.length; i++) {
				const item = connectionItems[i];
				const text = item.textContent || '';
				const valueSpan = item.querySelector('span');
				
				if (text.includes('Status:') && valueSpan) {
					valueSpan.textContent = info.running ? 'Running' : 'Stopped';
					valueSpan.style.color = info.running ? 'var(--text-success)' : 'var(--text-error)';
				} else if (text.includes('Port:') && valueSpan) {
					valueSpan.textContent = info.port.toString();
				} else if (text.includes('Connections:') && valueSpan) {
					valueSpan.textContent = info.connections.toString();
				}
			}
		}
		
		// Update protocol information section
		const protocolSection = document.querySelector('.protocol-command-example');
		if (protocolSection) {
			const codeBlock = protocolSection.querySelector('code');
			if (codeBlock) {
				codeBlock.textContent = `claude --mcp http://localhost:${info.port}/mcp`;
			}
		}
		
		// Update any other dynamic content areas that need live updates
		const statusElements = document.querySelectorAll('[data-live-update]');
		for (let i = 0; i < statusElements.length; i++) {
			const el = statusElements[i];
			const updateType = el.getAttribute('data-live-update');
			switch (updateType) {
				case 'server-status':
					el.textContent = info.running ? 'Running' : 'Stopped';
					break;
				case 'connection-count':
					el.textContent = info.connections.toString();
					break;
				case 'server-port':
					el.textContent = info.port.toString();
					break;
			}
		}
	}
}