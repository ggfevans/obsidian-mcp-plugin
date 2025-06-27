// Jest setup file for Obsidian plugin testing

// Mock performance API if not available
if (!global.performance) {
  global.performance = {
    now: () => Date.now(),
  } as any;
}