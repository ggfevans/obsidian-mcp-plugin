import { App } from 'obsidian';

/**
 * Utility for detecting and checking the status of Obsidian community plugins
 */
export class PluginDetector {
  constructor(private app: App) {}

  /**
   * Check if a plugin is installed and enabled
   */
  isPluginEnabled(pluginId: string): boolean {
    // Check if plugin is loaded and enabled
    const plugins = (this.app as any).plugins;
    return plugins?.enabledPlugins?.has(pluginId) || false;
  }

  /**
   * Check if a plugin is installed (but may not be enabled)
   */
  isPluginInstalled(pluginId: string): boolean {
    const plugins = (this.app as any).plugins;
    return plugins?.manifests?.hasOwnProperty(pluginId) || false;
  }

  /**
   * Get plugin instance if available
   */
  getPlugin(pluginId: string): any | null {
    if (!this.isPluginEnabled(pluginId)) {
      return null;
    }
    const plugins = (this.app as any).plugins;
    return plugins?.plugins?.[pluginId] || null;
  }

  /**
   * Check if Dataview plugin is available
   */
  isDataviewAvailable(): boolean {
    return this.isPluginEnabled('dataview');
  }

  /**
   * Get Dataview plugin instance
   */
  getDataviewPlugin(): any | null {
    return this.getPlugin('dataview');
  }

  /**
   * Check if Dataview API is accessible
   */
  isDataviewAPIReady(): boolean {
    const dataview = this.getDataviewPlugin();
    if (!dataview) return false;
    
    // Check if the Dataview API is available
    return dataview.api !== null && dataview.api !== undefined;
  }

  /**
   * Get Dataview API instance
   */
  getDataviewAPI(): any | null {
    const dataview = this.getDataviewPlugin();
    return dataview?.api || null;
  }

  /**
   * Get information about Dataview plugin status
   */
  getDataviewStatus(): {
    installed: boolean;
    enabled: boolean;
    apiReady: boolean;
    version?: string;
  } {
    const installed = this.isPluginInstalled('dataview');
    const enabled = this.isPluginEnabled('dataview');
    const apiReady = this.isDataviewAPIReady();
    
    const plugin = this.getDataviewPlugin();
    const version = plugin?.manifest?.version;

    return {
      installed,
      enabled,
      apiReady,
      version
    };
  }
}