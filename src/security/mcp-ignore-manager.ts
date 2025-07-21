import { App } from 'obsidian';
import { Minimatch } from 'minimatch';

/**
 * MCPIgnoreManager - Handles .mcpignore file-based path exclusions
 * 
 * Uses .gitignore-style patterns to exclude files and directories from MCP operations.
 * Patterns are stored in .obsidian/plugins/obsidian-mcp-plugin/.mcpignore
 */
export class MCPIgnoreManager {
  private app: App;
  private ignorePath: string;
  private patterns: string[] = [];
  private matchers: Minimatch[] = [];
  private isEnabled: boolean = false;
  private lastModified: number = 0;

  constructor(app: App) {
    this.app = app;
    this.ignorePath = '.obsidian/plugins/obsidian-mcp-plugin/.mcpignore';
  }

  /**
   * Enable or disable path exclusions
   */
  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (enabled) {
      this.loadIgnoreFile();
    }
  }

  /**
   * Check if path exclusions are enabled
   */
  getEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Load and parse the .mcpignore file
   */
  async loadIgnoreFile(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      const adapter = this.app.vault.adapter;
      const stat = await adapter.stat(this.ignorePath);
      
      // Only reload if file has been modified
      if (stat && stat.mtime === this.lastModified) {
        return;
      }

      const content = await adapter.read(this.ignorePath);
      this.parseIgnoreContent(content);
      this.lastModified = stat?.mtime || Date.now();
      
      console.log(`MCPIgnore: Loaded ${this.patterns.length} exclusion patterns`);
    } catch (error) {
      // File doesn't exist or can't be read - no exclusions
      this.patterns = [];
      this.matchers = [];
      this.lastModified = 0;
      console.log('MCPIgnore: No .mcpignore file found, no exclusions active');
    }
  }

  /**
   * Parse .gitignore-style content into patterns
   */
  private parseIgnoreContent(content: string): void {
    const lines = content.split('\n');
    const validPatterns: string[] = [];
    const matchers: Minimatch[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Handle negation patterns (!)
      let pattern = trimmed;
      let negate = false;
      if (pattern.startsWith('!')) {
        negate = true;
        pattern = pattern.substring(1);
      }

      try {
        // Create minimatch instance with gitignore-compatible options
        const matcher = new Minimatch(pattern, {
          dot: true,           // Match files starting with .
          nobrace: false,      // Enable {a,b} expansion
          noglobstar: false,   // Enable ** patterns
          noext: false,        // Enable extended matching
          nonegate: false,     // Allow negation
          flipNegate: negate   // Handle ! prefix
        });

        validPatterns.push(trimmed);
        matchers.push(matcher);
      } catch (error) {
        console.warn(`MCPIgnore: Invalid pattern "${trimmed}": ${error}`);
      }
    }

    this.patterns = validPatterns;
    this.matchers = matchers;
  }

  /**
   * Check if a file path should be excluded
   * @param path - File path relative to vault root
   * @returns true if path should be excluded
   */
  isExcluded(path: string): boolean {
    if (!this.isEnabled || this.matchers.length === 0) {
      return false;
    }

    // Normalize path (remove leading slash, use forward slashes)
    const normalizedPath = path.replace(/^\/+/, '').replace(/\\/g, '/');
    
    let excluded = false;
    
    // Process patterns in order - later patterns can override earlier ones
    for (const matcher of this.matchers) {
      if (matcher.negate) {
        // Negation pattern - include if it matches
        if (matcher.match(normalizedPath)) {
          excluded = false;
        }
      } else {
        // Normal pattern - exclude if it matches
        if (matcher.match(normalizedPath)) {
          excluded = true;
        }
      }
    }

    return excluded;
  }

  /**
   * Get current exclusion patterns
   */
  getPatterns(): string[] {
    return [...this.patterns];
  }

  /**
   * Get statistics about current exclusions
   */
  getStats(): {
    enabled: boolean;
    patternCount: number;
    lastModified: number;
    filePath: string;
  } {
    return {
      enabled: this.isEnabled,
      patternCount: this.patterns.length,
      lastModified: this.lastModified,
      filePath: this.ignorePath
    };
  }

  /**
   * Create a default .mcpignore file template
   */
  async createDefaultIgnoreFile(): Promise<void> {
    const template = `# MCP Plugin Exclusions
# Syntax: https://git-scm.com/docs/gitignore
# Lines starting with # are comments
# Use ! to negate/whitelist patterns

# === EXAMPLES (remove # to activate) ===

# Private directories
# private/
# personal/**
# journal/

# Sensitive files by extension
# *.secret
# *.private
# *.confidential

# Specific sensitive files
# passwords.md
# api-keys.md
# secrets.txt

# Work/company separation
# work/confidential/
# company-internal/

# Obsidian system files (if desired)
# .obsidian/workspace*
# .obsidian/graph.json

# Temporary and backup files
# *.tmp
# *.backup
# *.bak
# temp/
# drafts/

# === WHITELIST EXCEPTIONS ===
# Use ! to include files that would otherwise be excluded
# !private/shared-notes.md
# !work/public-docs/
# !*.public.secret

# === YOUR PATTERNS BELOW ===
# Add your custom exclusion patterns here

`;

    try {
      await this.app.vault.adapter.write(this.ignorePath, template);
      console.log(`MCPIgnore: Created default .mcpignore file at ${this.ignorePath}`);
    } catch (error) {
      console.error(`MCPIgnore: Failed to create .mcpignore file: ${error}`);
      throw error;
    }
  }

  /**
   * Check if .mcpignore file exists
   */
  async ignoreFileExists(): Promise<boolean> {
    try {
      await this.app.vault.adapter.stat(this.ignorePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Filter an array of file paths, removing excluded ones
   */
  filterPaths(paths: string[]): string[] {
    if (!this.isEnabled) return paths;
    return paths.filter(path => !this.isExcluded(path));
  }

  /**
   * Force reload the ignore file (for manual refresh)
   */
  async forceReload(): Promise<void> {
    this.lastModified = 0;
    await this.loadIgnoreFile();
  }
}