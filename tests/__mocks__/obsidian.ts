// Mock Obsidian API for testing

export abstract class TAbstractFile {
  path!: string;
  name!: string;
}

export class TFile extends TAbstractFile {
  extension!: string;
}

export class App {
  vault: Vault;
  workspace: Workspace;

  constructor() {
    this.vault = new Vault();
    this.workspace = new Workspace();
  }
}

export class Vault {
  getName(): string {
    return 'test-vault';
  }

  getRoot(): any {
    return {
      children: []
    };
  }

  getAbstractFileByPath(path: string): any {
    return null;
  }

  read(file: any): Promise<string> {
    return Promise.resolve('test content');
  }

  readBinary(file: any): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }
}

export class Workspace {
  getActiveFile(): any {
    return {
      name: 'test-file.md',
      path: 'test-file.md',
      stat: { mtime: Date.now() }
    };
  }
}

export class Plugin {
  app: App;
  settings: any = {};

  constructor(app: App, manifest: any) {
    this.app = app;
  }

  addSettingTab(tab: any): void {}
  addCommand(command: any): void {}
  addStatusBarItem(): any {
    return {
      setText: jest.fn()
    };
  }
  loadData(): Promise<any> {
    return Promise.resolve({});
  }
  saveData(data: any): Promise<void> {
    return Promise.resolve();
  }
}

export class PluginSettingTab {
  constructor(app: App, plugin: Plugin) {}
}

export class Setting {
  constructor(containerEl: any) {}
  setName(name: string) { return this; }
  setDesc(desc: string) { return this; }
  addToggle(cb: any) { return this; }
  addText(cb: any) { return this; }
}