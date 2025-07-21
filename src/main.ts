import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { MCPHttpServer } from './mcp-server';
import { getVersion } from './version';
import { Debug } from './utils/debug';
import { MCPIgnoreManager } from './security/mcp-ignore-manager';
import { randomBytes } from 'crypto';

interface MCPPluginSettings {
	httpEnabled: boolean;
	httpPort: number;
	debugLogging: boolean;
	showConnectionStatus: boolean;
	autoDetectPortConflicts: boolean;
	enableConcurrentSessions: boolean;
	maxConcurrentConnections: number;
	apiKey: string;
	dangerouslyDisableAuth: boolean;
	readOnlyMode: boolean;
	pathExclusionsEnabled: boolean;
}

const DEFAULT_SETTINGS: MCPPluginSettings = {
	httpEnabled: true, // Start enabled by default
	httpPort: 3001,
	debugLogging: false,
	showConnectionStatus: true,
	autoDetectPortConflicts: true,
	enableConcurrentSessions: false, // Disabled by default for backward compatibility
	maxConcurrentConnections: 32,
	apiKey: '', // Will be generated on first load
	dangerouslyDisableAuth: false, // Auth enabled by default
	readOnlyMode: false, // Read-only mode disabled by default
	pathExclusionsEnabled: false // Path exclusions disabled by default
};

export default class ObsidianMCPPlugin extends Plugin {
	settings!: MCPPluginSettings;
	mcpServer?: MCPHttpServer;
	ignoreManager?: MCPIgnoreManager;
	private currentVaultName: string = '';
	private currentVaultPath: string = '';
	private vaultSwitchTimeout?: number;
	private statsUpdateInterval?: number;

	async onload() {
		Debug.log(`🚀 Starting Semantic Notes Vault MCP v${getVersion()}`);
		
		try {
			await this.loadSettings();
			Debug.setDebugMode(this.settings.debugLogging);
			Debug.log('✅ Settings loaded');
			
			// Debug log read-only mode status at startup
			if (this.settings.readOnlyMode) {
				Debug.log('🔒 READ-ONLY MODE detected in settings - will activate on server start');
			} else {
				Debug.log('✅ READ-ONLY MODE not enabled - normal operations mode');
			}

			// Initialize ignore manager
			this.ignoreManager = new MCPIgnoreManager(this.app);
			this.ignoreManager.setEnabled(this.settings.pathExclusionsEnabled);
			if (this.settings.pathExclusionsEnabled) {
				await this.ignoreManager.loadIgnoreFile();
				Debug.log('✅ Path exclusions initialized');
			} else {
				Debug.log('✅ Path exclusions disabled');
			}

			// Initialize vault context tracking
			this.initializeVaultContext();

			// Add settings tab
			this.addSettingTab(new MCPSettingTab(this.app, this));
			Debug.log('✅ Settings tab added');

			// Add command
			this.addCommand({
				id: 'restart-mcp-server',
				name: 'Restart MCP Server',
				callback: async () => {
					Debug.log('🔄 MCP Server restart requested');
					await this.stopMCPServer();
					if (this.settings.httpEnabled) {
						await this.startMCPServer();
					}
				}
			});
			Debug.log('✅ Command added');

			// Setup vault monitoring
			this.setupVaultMonitoring();

			// Start MCP server by default (unless explicitly disabled)
			if (this.settings.httpEnabled) {
				await this.startMCPServer();
			} else {
				Debug.log('⚠️ MCP server is disabled in settings');
			}

			// Add status bar item
			this.updateStatusBar();
			Debug.log('✅ Status bar added');

			// Start stats update interval
			this.startStatsUpdates();

			Debug.log('🎉 Obsidian MCP Plugin loaded successfully');
		} catch (error) {
			Debug.error('❌ Error loading Obsidian MCP Plugin:', error);
			throw error; // Re-throw to show in Obsidian's plugin list
		}
	}

	async onunload() {
		Debug.log('👋 Unloading Obsidian MCP Plugin');
		
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
						Debug.error(`❌ Failed to find available port after 3 attempts. Ports checked: ${portsChecked}`);
						Debug.error('Please check for other applications using these ports or firewall/security software blocking access.');
						new Notice(`Cannot start MCP server: Ports ${this.settings.httpPort}-${this.settings.httpPort + 3} are all in use. Check console for details.`);
						this.updateStatusBar();
						return;
					}
					
					Debug.log(`⚠️ Port ${this.settings.httpPort} is in use, switching to port ${suggestedPort}`);
					new Notice(`Port ${this.settings.httpPort} is in use. Switching to port ${suggestedPort}`);
					
					// Temporarily use the suggested port for this session
					this.mcpServer = new MCPHttpServer(this.app, suggestedPort, this);
					await this.mcpServer.start();
					this.updateStatusBar();
					Debug.log(`✅ MCP server started on alternate port ${suggestedPort}`);
					if (this.settings.showConnectionStatus) {
						new Notice(`MCP server started on port ${suggestedPort} (default port was in use)`);
					}
					return;
				}
			}

			Debug.log(`🚀 Starting MCP server on port ${this.settings.httpPort}...`);
			this.mcpServer = new MCPHttpServer(this.app, this.settings.httpPort, this);
			await this.mcpServer.start();
			this.updateStatusBar();
			Debug.log('✅ MCP server started successfully');
			if (this.settings.showConnectionStatus) {
				new Notice(`MCP server started on port ${this.settings.httpPort}`);
			}
		} catch (error) {
			Debug.error('❌ Failed to start MCP server:', error);
			new Notice(`Failed to start MCP server: ${error}`);
			this.updateStatusBar();
		}
	}

	async stopMCPServer(): Promise<void> {
		if (this.mcpServer) {
			Debug.log('🛑 Stopping MCP server...');
			await this.mcpServer.stop();
			this.mcpServer = undefined;
			this.updateStatusBar();
			Debug.log('✅ MCP server stopped');
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
		
		// Generate API key on first load if not present
		if (!this.settings.apiKey) {
			this.settings.apiKey = this.generateApiKey();
			await this.saveSettings();
			Debug.log('🔐 Generated new API key for authentication');
		}
	}
	
	public generateApiKey(): string {
		// Generate a secure random API key
		const bytes = randomBytes(32);
		return bytes.toString('base64url');
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
			Debug.log(`Port ${port} is also in use, trying next...`);
		}
		// If all 3 alternate ports are busy, return 0 to indicate failure
		return 0;
	}

	getMCPServerInfo(): any {
		const poolStats = this.mcpServer?.getConnectionPoolStats();
		const resourceCount = this.settings.enableConcurrentSessions ? 2 : 1; // vault-info + session-info
		
		return {
			version: getVersion(),
			running: this.mcpServer?.isServerRunning() || false,
			port: this.settings.httpPort,
			vaultName: this.app.vault.getName(),
			vaultPath: this.getVaultPath(),
			toolsCount: 6, // Our 6 semantic tools (including graph)
			resourcesCount: resourceCount,
			connections: this.mcpServer?.getConnectionCount() || 0,
			concurrentSessions: this.settings.enableConcurrentSessions,
			poolStats: poolStats
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
		Debug.log(`📁 Initial vault context: ${this.currentVaultName} at ${this.currentVaultPath}`);
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
		Debug.log(`🔄 Vault switch detected: ${oldVaultName} → ${newVaultName}`);
		Debug.log(`📁 Path change: ${oldVaultPath} → ${newVaultPath}`);

		// Update current context
		this.currentVaultName = newVaultName;
		this.currentVaultPath = newVaultPath;

		// Show notification if enabled
		if (this.settings.showConnectionStatus) {
			new Notice(`MCP Plugin: Switched to vault "${newVaultName}"`);
		}

		// Restart MCP server to use new vault context
		if (this.settings.httpEnabled && this.mcpServer?.isServerRunning()) {
			Debug.log('🔄 Restarting MCP server for new vault context...');
			
			// Use a small delay to avoid rapid restarts
			if (this.vaultSwitchTimeout) {
				window.clearTimeout(this.vaultSwitchTimeout);
			}
			
			this.vaultSwitchTimeout = window.setTimeout(async () => {
				await this.stopMCPServer();
				await this.startMCPServer();
				Debug.log(`✅ MCP server restarted for vault: ${newVaultName}`);
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

		containerEl.createEl('h2', {text: 'Semantic Notes Vault MCP Settings'});

		// Connection Status Section
		this.createConnectionStatusSection(containerEl);
		
		// Server Configuration Section
		this.createServerConfigSection(containerEl);
		
		// Authentication Section
		this.createAuthenticationSection(containerEl);
		
		// Security Section
		this.createSecuritySection(containerEl);
		
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
			
			const createStatusItem = (label: string, value: string, colorClass?: string) => {
				const item = statusGrid.createDiv();
				item.createEl('strong', {text: `${label}: `});
				const valueEl = item.createSpan({text: value});
				if (colorClass) valueEl.classList.add('mcp-status-value', colorClass);
			};
			
			createStatusItem('Status', info.running ? 'Running' : 'Stopped', 
				info.running ? 'success' : 'error');
			createStatusItem('Port', info.port.toString());
			createStatusItem('Vault', info.vaultName);
			if (info.vaultPath) {
				createStatusItem('Path', info.vaultPath.length > 50 ? '...' + info.vaultPath.slice(-47) : info.vaultPath);
			}
			createStatusItem('Version', info.version);
			createStatusItem('Tools', info.toolsCount.toString());
			createStatusItem('Resources', info.resourcesCount.toString());
			createStatusItem('Connections', info.connections.toString());
			
			// Show pool stats if concurrent sessions are enabled
			if (info.concurrentSessions && info.poolStats?.enabled && info.poolStats.stats) {
				const poolStats = info.poolStats.stats;
				createStatusItem('Active Sessions', `${poolStats.activeConnections}/${poolStats.maxConnections}`);
				createStatusItem('Pool Utilization', `${Math.round(poolStats.utilization * 100)}%`, 
					poolStats.utilization > 0.8 ? 'warning' : 'success');
				if (poolStats.queuedRequests > 0) {
					createStatusItem('Queued Requests', poolStats.queuedRequests.toString(), 'warning');
				}
			}
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
							button.buttonEl.classList.add('mcp-hidden');
							portSetting.setDesc('Port for HTTP MCP server (default: 3001)');
						}
					});
				
				// Initially hide the apply button
				button.buttonEl.classList.add('mcp-hidden');
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
	
	private createAuthenticationSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', {text: 'Authentication'});
		
		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Secure API key for authenticating MCP clients')
			.addText(text => {
				const input = text
					.setPlaceholder('API key will be shown here')
					.setValue(this.plugin.settings.apiKey)
					.setDisabled(true);
				
				// Make the text input wider to accommodate the key
				input.inputEl.style.width = '300px';
				input.inputEl.style.fontFamily = 'monospace';
				
				// Add a class for styling
				input.inputEl.classList.add('mcp-api-key-input');
				
				return input;
			})
			.addButton(button => button
				.setButtonText('Copy')
				.setTooltip('Copy API key to clipboard')
				.onClick(async () => {
					await navigator.clipboard.writeText(this.plugin.settings.apiKey);
					new Notice('API key copied to clipboard');
				}))
			.addButton(button => button
				.setButtonText('Regenerate')
				.setTooltip('Generate a new API key')
				.setWarning()
				.onClick(async () => {
					// Show confirmation dialog
					const confirmed = confirm('Are you sure you want to regenerate the API key? This will invalidate the current key and require updating all MCP clients.');
					
					if (confirmed) {
						this.plugin.settings.apiKey = this.plugin.generateApiKey();
						await this.plugin.saveSettings();
						new Notice('API key regenerated. Update your MCP clients with the new key.');
						this.display(); // Refresh the settings display
					}
				}));
		
		// Add a note about security
		const securityNote = containerEl.createEl('p', {
			text: 'Note: The API key is stored in the plugin settings file. Anyone with access to your vault can read it.',
			cls: 'setting-item-description'
		});
		securityNote.style.marginTop = '-10px';
		securityNote.style.marginBottom = '10px';
		
		// Add note about auth methods
		const authNote = containerEl.createEl('p', {
			text: 'Supports both Bearer token (recommended) and Basic authentication.',
			cls: 'setting-item-description'
		});
		authNote.style.marginTop = '-10px';
		authNote.style.marginBottom = '20px';
		
		// Add dangerous disable auth toggle
		new Setting(containerEl)
			.setName('Disable Authentication')
			.setDesc('⚠️ DANGEROUS: Disable authentication entirely. Only use for testing or if you fully trust your local environment.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.dangerouslyDisableAuth)
				.onChange(async (value) => {
					this.plugin.settings.dangerouslyDisableAuth = value;
					await this.plugin.saveSettings();
					
					// Show warning if disabling auth
					if (value) {
						new Notice('⚠️ Authentication disabled! Your vault is accessible without credentials.');
					} else {
						new Notice('✅ Authentication enabled. API key required for access.');
					}
					
					// Refresh display to update examples
					this.display();
				}));
	}

	private createSecuritySection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', {text: 'Security'});
		
		new Setting(containerEl)
			.setName('Read-Only Mode')
			.setDesc('Enable read-only mode - blocks all write operations (create, update, delete, move, rename)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.readOnlyMode)
				.onChange(async (value) => {
					this.plugin.settings.readOnlyMode = value;
					await this.plugin.saveSettings();
					
					// Debug logging for read-only mode changes
					if (value) {
						Debug.log('🔒 READ-ONLY MODE ENABLED via settings - Server restart required for activation');
						new Notice('🔒 Read-only mode enabled. All write operations are blocked.');
					} else {
						Debug.log('✅ READ-ONLY MODE DISABLED via settings - Server restart required for deactivation');
						new Notice('✅ Read-only mode disabled. All operations are allowed.');
					}
					
					// Refresh display to update examples
					this.display();
				}));

		// Path Exclusions Setting
		new Setting(containerEl)
			.setName('Path Exclusions')
			.setDesc('Exclude files and directories from MCP operations using .gitignore-style patterns')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.pathExclusionsEnabled)
				.onChange(async (value) => {
					this.plugin.settings.pathExclusionsEnabled = value;
					await this.plugin.saveSettings();
					
					if (this.plugin.ignoreManager) {
						this.plugin.ignoreManager.setEnabled(value);
						if (value) {
							await this.plugin.ignoreManager.loadIgnoreFile();
							Debug.log('✅ Path exclusions enabled');
							new Notice('✅ Path exclusions enabled');
						} else {
							Debug.log('🔓 Path exclusions disabled');
							new Notice('🔓 Path exclusions disabled');
						}
					}
					
					// Refresh display to show/hide file management options
					this.display();
				}));

		// Show file management options if path exclusions are enabled
		if (this.plugin.settings.pathExclusionsEnabled) {
			this.createPathExclusionManagement(containerEl);
		}
	}

	private createPathExclusionManagement(containerEl: HTMLElement): void {
		console.log('Creating path exclusion management UI');
		const exclusionSection = containerEl.createDiv('mcp-exclusion-section');
		exclusionSection.createEl('h4', {text: '.mcpignore File Management'});

		if (this.plugin.ignoreManager) {
			console.log('Ignore manager available, creating buttons');
			const stats = this.plugin.ignoreManager.getStats();
			
			// Status info
			const statusEl = exclusionSection.createDiv('mcp-exclusion-status');
			statusEl.createEl('p', {
				text: `Current exclusions: ${stats.patternCount} patterns active`,
				cls: 'setting-item-description'
			});
			
			if (stats.lastModified > 0) {
				statusEl.createEl('p', {
					text: `Last modified: ${new Date(stats.lastModified).toLocaleString()}`,
					cls: 'setting-item-description'
				});
			}

			// File management buttons
			const buttonContainer = exclusionSection.createDiv('mcp-exclusion-buttons');
			
			// Open in default app button
			const openButton = buttonContainer.createEl('button', {
				text: 'Open in default app',
				cls: 'mod-cta'
			});
			console.log('Created open button:', openButton);
			openButton.addEventListener('click', async () => {
				console.log('OPEN BUTTON CLICKED!');  // This should show if button works
				try {
					console.log('Inside try block - checking file exists...');
					const exists = await this.plugin.ignoreManager!.ignoreFileExists();
					console.log('File exists?', exists);
					if (!exists) {
						await this.plugin.ignoreManager!.createDefaultIgnoreFile();
					}
					
					console.log('Getting file from vault, path:', stats.filePath);
					console.log('this.app available?', !!this.app);
					const file = this.app.vault.getAbstractFileByPath(stats.filePath);
					console.log('Got file?', !!file, file);
					
					// Whether or not Obsidian has the file indexed, we know it exists
					// So let's construct the path directly
					try {
						const adapter = this.app.vault.adapter as any;
						console.log('Adapter:', adapter);
						console.log('Adapter basePath:', adapter.basePath);
						
						const path = require('path');
						const fullPath = path.join(adapter.basePath || '', stats.filePath);
						console.log('Full path constructed:', fullPath);
						
						// Try to access electron shell
						const electron = require('electron');
						console.log('Electron available:', !!electron);
						console.log('Shell available:', !!electron?.shell);
						
						if (electron?.shell) {
							console.log('Calling shell.openPath...');
							const result = await electron.shell.openPath(fullPath);
							console.log('Shell.openPath result:', result);
							new Notice('📝 .mcpignore file opened in default app');
						} else {
							console.log('Shell not available');
							new Notice('❌ Unable to open in external app');
						}
					} catch (err: any) {
						console.error('Error opening file:', err);
						new Notice('❌ Failed to open file: ' + (err?.message || err));
					}
				} catch (error) {
					console.error('OUTER CATCH - Failed to open .mcpignore file:', error);
					console.error('Error details:', error);
					new Notice('❌ Failed to open .mcpignore file');
				}
			});

			// Show in system explorer button
			const showButton = buttonContainer.createEl('button', {
				text: 'Show in system explorer'
			});
			console.log('Created show button:', showButton);
			showButton.addEventListener('click', async () => {
				console.log('SHOW BUTTON CLICKED!');  // This should show if button works
				try {
					const exists = await this.plugin.ignoreManager!.ignoreFileExists();
					if (!exists) {
						await this.plugin.ignoreManager!.createDefaultIgnoreFile();
					}
					
					// Construct path directly, don't rely on Obsidian's file cache
					try {
						console.log('Attempting to show file in folder:', stats.filePath);
						
						const adapter = this.app.vault.adapter as any;
						const path = require('path');
						const fullPath = path.join(adapter.basePath || '', stats.filePath);
						console.log('Full path for folder:', fullPath);
						
						const electron = require('electron');
						if (electron?.shell) {
							console.log('Calling shell.showItemInFolder...');
							electron.shell.showItemInFolder(fullPath);
							new Notice('📁 .mcpignore file location shown in explorer');
						} else {
							console.log('Shell not available for show in folder');
							new Notice('❌ System explorer not available');
						}
					} catch (err: any) {
						console.error('Error showing file in folder:', err);
						new Notice('❌ Failed to show file: ' + (err?.message || err));
					}
				} catch (error) {
					console.error('Failed to show .mcpignore file:', error);
					new Notice('❌ Failed to show file location');
				}
			});

			// Create template button
			const templateButton = buttonContainer.createEl('button', {
				text: 'Create Template'
			});
			templateButton.addEventListener('click', async () => {
				try {
					await this.plugin.ignoreManager!.createDefaultIgnoreFile();
					new Notice('📄 Default .mcpignore template created');
					this.display(); // Refresh to update status
				} catch (error) {
					console.error('Failed to create .mcpignore template:', error);
					new Notice('❌ Failed to create template');
				}
			});

			// Reload patterns button
			const reloadButton = buttonContainer.createEl('button', {
				text: 'Reload Patterns'
			});
			reloadButton.addEventListener('click', async () => {
				try {
					await this.plugin.ignoreManager!.forceReload();
					new Notice('🔄 Exclusion patterns reloaded');
					this.display(); // Refresh to update status
				} catch (error) {
					console.error('Failed to reload patterns:', error);
					new Notice('❌ Failed to reload patterns');
				}
			});

			// Help text
			const helpEl = exclusionSection.createDiv('mcp-exclusion-help');
			helpEl.createEl('h5', {text: 'Pattern Examples:'});
			const examplesList = helpEl.createEl('ul');
			const examples = [
				'private/ - exclude entire directory',
				'*.secret - exclude files by extension',
				'temp/** - exclude deeply nested paths',
				'!file.md - include exception (whitelist)',
				'.obsidian/workspace* - exclude workspace files'
			];
			
			examples.forEach(example => {
				examplesList.createEl('li', {
					text: example,
					cls: 'setting-item-description'
				});
			});

			helpEl.createEl('p', {
				text: 'Full syntax documentation: https://git-scm.com/docs/gitignore',
				cls: 'setting-item-description'
			});
		}
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
					Debug.setDebugMode(value);
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', {text: 'Concurrent Sessions'});

		new Setting(containerEl)
			.setName('Enable Concurrent Sessions for Agent Swarms')
			.setDesc('Allow multiple MCP clients to connect simultaneously. Required for agent swarms and multi-client setups.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableConcurrentSessions)
				.onChange(async (value) => {
					this.plugin.settings.enableConcurrentSessions = value;
					await this.plugin.saveSettings();
					
					// Show notice about restart requirement
					new Notice('Server restart required for concurrent session changes to take effect');
				}));

		new Setting(containerEl)
			.setName('Maximum Concurrent Connections')
			.setDesc('Maximum number of simultaneous connections allowed (1-100, default: 32)')
			.addText(text => text
				.setPlaceholder('32')
				.setValue(this.plugin.settings.maxConcurrentConnections.toString())
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num >= 1 && num <= 100) {
						this.plugin.settings.maxConcurrentConnections = num;
						await this.plugin.saveSettings();
					}
				}))
			.setDisabled(!this.plugin.settings.enableConcurrentSessions);
	}

	private createProtocolInfoSection(containerEl: HTMLElement): void {
		containerEl.createEl('h3', {text: 'MCP Protocol Information'});
		
		const info = containerEl.createDiv('mcp-protocol-info');
		
		// Show warning if auth is disabled
		if (this.plugin.settings.dangerouslyDisableAuth) {
			const warningEl = info.createEl('div', {
				text: '⚠️ WARNING: Authentication is disabled. Your vault is accessible without credentials!',
				cls: 'mcp-auth-warning'
			});
			warningEl.style.backgroundColor = 'var(--background-modifier-error)';
			warningEl.style.color = 'var(--text-error)';
			warningEl.style.padding = '10px';
			warningEl.style.borderRadius = '5px';
			warningEl.style.marginBottom = '15px';
			warningEl.style.fontWeight = 'bold';
		}
		
		const toolsList = [
			'🗂️ vault - File and folder operations with fragment support',
			'✏️ edit - Smart editing with content buffers', 
			'👁️ view - Content viewing and navigation',
			'🔄 workflow - AI workflow guidance and suggestions',
			'🕸️ graph - Graph traversal and link analysis',
			'⚙️ system - System operations and web fetch'
		];
		
		info.createEl('h4', {text: 'Available Tools (6)'});
		const toolsListEl = info.createEl('ul');
		toolsList.forEach(tool => {
			toolsListEl.createEl('li', {text: tool});
		});
		
		const resourceCount = this.plugin.settings.enableConcurrentSessions ? 2 : 1;
		info.createEl('h4', {text: `Available Resources (${resourceCount})`});
		const resourcesList = info.createEl('ul');
		resourcesList.createEl('li', {text: '📊 obsidian://vault-info - Real-time vault metadata'});
		if (this.plugin.settings.enableConcurrentSessions) {
			resourcesList.createEl('li', {text: '🔄 obsidian://session-info - Active MCP sessions and statistics'});
		}
		
		info.createEl('h4', {text: 'Claude Code Connection'});
		const commandExample = info.createDiv('protocol-command-example');
		const codeEl = commandExample.createEl('code');
		codeEl.classList.add('mcp-code-block');
		
		const claudeCommand = this.plugin.settings.dangerouslyDisableAuth ? 
			`claude mcp add --transport http obsidian http://localhost:${this.plugin.settings.httpPort}/mcp` :
			`claude mcp add --transport http obsidian http://localhost:${this.plugin.settings.httpPort}/mcp --header "Authorization: Bearer ${this.plugin.settings.apiKey}"`;
		
		codeEl.textContent = claudeCommand;
		
		info.createEl('h4', {text: 'Client Configuration (Claude Desktop, Cline, etc.)'});
		const desktopDesc = info.createEl('p', {
			text: 'Add this to your MCP client configuration file:'
		});
		
		// Option 1: Direct HTTP Transport
		info.createEl('p', {text: 'Option 1: Direct HTTP Transport (if supported by your client):'}).style.fontWeight = 'bold';
		const configExample = info.createDiv('desktop-config-example');
		const configEl = configExample.createEl('pre');
		configEl.classList.add('mcp-config-example');
		
		const configJson = this.plugin.settings.dangerouslyDisableAuth ? {
			"mcpServers": {
				"obsidian": {
					"transport": {
						"type": "http",
						"url": `http://localhost:${this.plugin.settings.httpPort}/mcp`
					}
				}
			}
		} : {
			"mcpServers": {
				"obsidian": {
					"transport": {
						"type": "http",
						"url": `http://obsidian:${this.plugin.settings.apiKey}@localhost:${this.plugin.settings.httpPort}/mcp`
					}
				}
			}
		};
		
		configEl.textContent = JSON.stringify(configJson, null, 2);
		
		// Option 2: Via mcp-remote
		info.createEl('p', {text: 'Option 2: Via mcp-remote (for Claude Desktop):'}).style.fontWeight = 'bold';
		const remoteDesc = info.createEl('p', {
			text: 'mcp-remote supports authentication headers via the --header flag:',
			cls: 'setting-item-description'
		});
		
		const remoteExample = info.createDiv('desktop-config-example');
		const remoteEl = remoteExample.createEl('pre');
		remoteEl.classList.add('mcp-config-example');
		
		const remoteJson = this.plugin.settings.dangerouslyDisableAuth ? {
			"mcpServers": {
				"obsidian-vault": {
					"command": "npx",
					"args": [
						"mcp-remote",
						`http://localhost:${this.plugin.settings.httpPort}/mcp`
					]
				}
			}
		} : {
			"mcpServers": {
				"obsidian-vault": {
					"command": "npx",
					"args": [
						"mcp-remote",
						`http://localhost:${this.plugin.settings.httpPort}/mcp`,
						"--header",
						`Authorization: Bearer ${this.plugin.settings.apiKey}`
					]
				}
			}
		};
		
		remoteEl.textContent = JSON.stringify(remoteJson, null, 2);
		
		// Add note about Windows workaround
		const windowsNote = info.createEl('p', {
			text: 'Windows Users: If you have issues with spaces, use environment variables instead:',
			cls: 'setting-item-description'
		});
		windowsNote.style.fontStyle = 'italic';
		
		const windowsExample = info.createDiv('desktop-config-example');
		const windowsEl = windowsExample.createEl('pre');
		windowsEl.classList.add('mcp-config-example');
		
		const windowsJson = this.plugin.settings.dangerouslyDisableAuth ? {
			"mcpServers": {
				"obsidian-vault": {
					"command": "npx",
					"args": [
						"mcp-remote",
						`http://localhost:${this.plugin.settings.httpPort}/mcp`
					]
				}
			}
		} : {
			"mcpServers": {
				"obsidian-vault": {
					"command": "npx",
					"args": [
						"mcp-remote",
						`http://localhost:${this.plugin.settings.httpPort}/mcp`,
						"--header",
						"Authorization:Bearer ${OBSIDIAN_API_KEY}"  // No space around colon
					],
					"env": {
						"OBSIDIAN_API_KEY": this.plugin.settings.apiKey
					}
				}
			}
		};
		
		windowsEl.textContent = JSON.stringify(windowsJson, null, 2);
		
		const configPath = info.createEl('p', {
			text: 'Configuration file location:'
		});
		configPath.classList.add('mcp-config-path');
		
		const pathList = configPath.createEl('ul');
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
				button.buttonEl.classList.remove('mcp-hidden');
				setting.setDesc(`Port for HTTP MCP server (default: 3001) - Click Apply to change to ${pendingPort}`);
			} else {
				button.buttonEl.classList.add('mcp-hidden');
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
					valueSpan.classList.remove('mcp-status-value', 'success', 'error');
					valueSpan.classList.add('mcp-status-value', info.running ? 'success' : 'error');
				} else if (text.includes('Port:') && valueSpan) {
					valueSpan.textContent = info.port.toString();
				} else if (text.includes('Connections:') && valueSpan) {
					valueSpan.textContent = info.connections.toString();
				}
			}
		}
		
		// Update protocol information section with proper auth handling
		const protocolSection = document.querySelector('.protocol-command-example');
		if (protocolSection) {
			const codeBlock = protocolSection.querySelector('code');
			if (codeBlock && info) {
				const claudeCommand = this.plugin.settings.dangerouslyDisableAuth ? 
					`claude mcp add --transport http obsidian http://localhost:${info.port}/mcp` :
					`claude mcp add --transport http obsidian http://localhost:${info.port}/mcp --header "Authorization: Bearer ${this.plugin.settings.apiKey}"`;
				
				codeBlock.textContent = claudeCommand;
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