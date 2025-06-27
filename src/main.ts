import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface MCPPluginSettings {
	httpEnabled: boolean;
	httpPort: number;
	httpsPort: number;
	enableSSL: boolean;
	debugLogging: boolean;
}

const DEFAULT_SETTINGS: MCPPluginSettings = {
	httpEnabled: true,
	httpPort: 27123,
	httpsPort: 27124,
	enableSSL: true,
	debugLogging: false
};

export default class ObsidianMCPPlugin extends Plugin {
	settings!: MCPPluginSettings;

	async onload() {
		await this.loadSettings();

		console.log('Loading Obsidian MCP Plugin v1.0.0');

		// Add settings tab
		this.addSettingTab(new MCPSettingTab(this.app, this));

		// Add command to restart server
		this.addCommand({
			id: 'restart-mcp-server',
			name: 'Restart MCP Server',
			callback: () => {
				console.log('MCP Server restart requested');
				// TODO: Implement server restart
			}
		});

		// Add status bar item
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('MCP: Ready');

		console.log('Obsidian MCP Plugin loaded successfully');
	}

	onunload() {
		console.log('Unloading Obsidian MCP Plugin');
		// TODO: Stop HTTP server
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
			.setDesc('Enable the HTTP server for REST API and MCP access')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.httpEnabled)
				.onChange(async (value) => {
					this.plugin.settings.httpEnabled = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('HTTP Port')
			.setDesc('Port for HTTP server (default: 27123)')
			.addText(text => text
				.setPlaceholder('27123')
				.setValue(this.plugin.settings.httpPort.toString())
				.onChange(async (value) => {
					const port = parseInt(value);
					if (!isNaN(port) && port > 0 && port < 65536) {
						this.plugin.settings.httpPort = port;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('HTTPS Port')
			.setDesc('Port for HTTPS server (default: 27124)')
			.addText(text => text
				.setPlaceholder('27124')
				.setValue(this.plugin.settings.httpsPort.toString())
				.onChange(async (value) => {
					const port = parseInt(value);
					if (!isNaN(port) && port > 0 && port < 65536) {
						this.plugin.settings.httpsPort = port;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Enable SSL')
			.setDesc('Enable HTTPS with self-signed certificate')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableSSL)
				.onChange(async (value) => {
					this.plugin.settings.enableSSL = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Debug Logging')
			.setDesc('Enable detailed debug logging')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugLogging)
				.onChange(async (value) => {
					this.plugin.settings.debugLogging = value;
					await this.plugin.saveSettings();
				}));
	}
}