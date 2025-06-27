import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { BrowserMCPServer } from './browser-mcp-server';

interface MCPPluginSettings {
	httpEnabled: boolean;
	httpPort: number;
	httpsPort: number;
	enableSSL: boolean;
	debugLogging: boolean;
}

const DEFAULT_SETTINGS: MCPPluginSettings = {
	httpEnabled: false, // Start disabled to avoid server startup issues
	httpPort: 3001,
	httpsPort: 3002,
	enableSSL: false,
	debugLogging: false
};

export default class ObsidianMCPPlugin extends Plugin {
	settings!: MCPPluginSettings;
	private mcpServer?: BrowserMCPServer;

	async onload() {
		console.log('🚀 Starting Obsidian MCP Plugin v0.1.4');
		
		try {
			await this.loadSettings();
			console.log('✅ Settings loaded');

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

			// Start MCP server if enabled
			if (this.settings.httpEnabled) {
				await this.startMCPServer();
			}

			// Add status bar item
			this.updateStatusBar();
			console.log('✅ Status bar added');

			console.log('🎉 Obsidian MCP Plugin loaded successfully');
		} catch (error) {
			console.error('❌ Error loading Obsidian MCP Plugin:', error);
			throw error; // Re-throw to show in Obsidian's plugin list
		}
	}

	async onunload() {
		console.log('👋 Unloading Obsidian MCP Plugin');
		await this.stopMCPServer();
	}

	private async startMCPServer(): Promise<void> {
		try {
			console.log(`🚀 Starting MCP server on port ${this.settings.httpPort}...`);
			this.mcpServer = new BrowserMCPServer(this.app, this.settings.httpPort);
			await this.mcpServer.start();
			this.updateStatusBar();
			console.log('✅ MCP server started successfully');
		} catch (error) {
			console.error('❌ Failed to start MCP server:', error);
			this.updateStatusBar();
		}
	}

	private async stopMCPServer(): Promise<void> {
		if (this.mcpServer) {
			console.log('🛑 Stopping MCP server...');
			await this.mcpServer.stop();
			this.mcpServer = undefined;
			this.updateStatusBar();
			console.log('✅ MCP server stopped');
		}
	}

	private updateStatusBar(): void {
		const statusBarItemEl = this.addStatusBarItem();
		
		if (!this.settings.httpEnabled) {
			statusBarItemEl.setText('MCP: Disabled');
		} else if (this.mcpServer?.isServerRunning()) {
			statusBarItemEl.setText(`MCP: :${this.settings.httpPort}`);
		} else {
			statusBarItemEl.setText('MCP: Error');
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
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

		new Setting(containerEl)
			.setName('Enable HTTP Server')
			.setDesc('Enable the HTTP server for MCP access (requires restart)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.httpEnabled)
				.onChange(async (value) => {
					this.plugin.settings.httpEnabled = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('HTTP Port')
			.setDesc('Port for HTTP MCP server (default: 3001)')
			.addText(text => text
				.setPlaceholder('3001')
				.setValue(this.plugin.settings.httpPort.toString())
				.onChange(async (value) => {
					const port = parseInt(value);
					if (!isNaN(port) && port > 0 && port < 65536) {
						this.plugin.settings.httpPort = port;
						await this.plugin.saveSettings();
					}
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
}