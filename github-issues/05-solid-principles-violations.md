# 🟡 MEDIUM: Code Quality - SOLID Principles Violations

## Summary
The codebase violates multiple SOLID principles, leading to tight coupling, difficult maintenance, and challenges in extending functionality. Major classes exceed 500 lines with multiple responsibilities.

## Current Issues

### 1. Single Responsibility Principle (SRP) Violations

#### SemanticRouter Class (1600+ lines)
- Handles routing, state management, context tracking, error handling
- Contains business logic for 6+ different operations
- Manages fragment retrieval and indexing

#### MCPHttpServer Class (600+ lines)  
- Manages HTTP server lifecycle
- Handles MCP protocol
- Manages sessions and connection pooling
- Contains business logic

#### ObsidianAPI Class (800+ lines)
- 40+ public methods in single class
- Mixes read/write operations
- Contains image processing logic
- Handles file system operations

### 2. Open/Closed Principle (OCP) Violations

#### Hard-coded Operation Mapping
```typescript
// router.ts:99-117
switch (operation) {
  case 'vault':
    return this.executeVaultOperation(action, params);
  case 'edit':
    return this.executeEditOperation(action, params);
  // Adding new operations requires modifying this switch
}
```

#### No Plugin Architecture
- Cannot extend operations without modifying core code
- No way to register custom handlers
- Tightly coupled operation implementations

### 3. Liskov Substitution Principle (LSP) Issues
- Inconsistent return types across similar operations
- Some methods throw, others return error objects
- Subclasses would break existing behavior

### 4. Interface Segregation Principle (ISP) Violations
```typescript
// All clients must depend on entire interface
interface ObsidianAPI {
  getFile(): Promise<any>;
  createFile(): Promise<any>;
  updateFile(): Promise<any>;
  deleteFile(): Promise<any>;
  // ... 40+ more methods
}
```

### 5. Dependency Inversion Principle (DIP) Violations
- Direct dependencies on concrete classes
- No dependency injection
- Tight coupling to Obsidian's internal APIs

## Proposed Refactoring

### 1. Break Down Large Classes

#### Operation Handlers (SRP)
```typescript
// Separate handler for each operation type
interface OperationHandler {
  canHandle(operation: string): boolean;
  execute(action: string, params: any): Promise<any>;
}

class VaultOperationHandler implements OperationHandler {
  constructor(private fileService: FileService) {}
  
  canHandle(operation: string): boolean {
    return operation === 'vault';
  }
  
  async execute(action: string, params: any): Promise<any> {
    switch (action) {
      case 'read': return this.fileService.read(params.path);
      case 'write': return this.fileService.write(params.path, params.content);
      default: throw new Error(`Unknown action: ${action}`);
    }
  }
}
```

#### Service Layer Pattern
```typescript
// Separate services for different concerns
interface FileService {
  read(path: string): Promise<FileContent>;
  write(path: string, content: string): Promise<void>;
}

interface SearchService {
  search(query: string): Promise<SearchResult[]>;
  searchByTag(tag: string): Promise<SearchResult[]>;
}

interface ValidationService {
  validatePath(path: string): ValidationResult;
  validateContent(content: string): ValidationResult;
}
```

### 2. Plugin Architecture (OCP)

```typescript
class OperationRegistry {
  private handlers = new Map<string, OperationHandler>();
  
  register(operation: string, handler: OperationHandler): void {
    this.handlers.set(operation, handler);
  }
  
  async execute(operation: string, action: string, params: any): Promise<any> {
    const handler = this.handlers.get(operation);
    if (!handler) {
      throw new Error(`No handler for operation: ${operation}`);
    }
    return handler.execute(action, params);
  }
}

// Easy to add new operations
registry.register('custom', new CustomOperationHandler());
```

### 3. Interface Segregation

```typescript
// Segregated interfaces
interface FileReader {
  read(path: string): Promise<FileContent>;
  exists(path: string): Promise<boolean>;
}

interface FileWriter {
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
}

interface FileManager {
  move(from: string, to: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  delete(path: string): Promise<void>;
}

// Clients can depend only on what they need
class ReadOnlyClient {
  constructor(private reader: FileReader) {}
}
```

### 4. Dependency Injection (DIP)

```typescript
// Dependency injection container
class DIContainer {
  private services = new Map<string, any>();
  
  register<T>(token: string, factory: () => T): void {
    this.services.set(token, factory);
  }
  
  resolve<T>(token: string): T {
    const factory = this.services.get(token);
    if (!factory) {
      throw new Error(`Service not registered: ${token}`);
    }
    return factory();
  }
}

// Usage
container.register('FileService', () => new ObsidianFileService(app));
container.register('ValidationService', () => new PathValidationService());

class VaultOperationHandler {
  private fileService: FileService;
  private validator: ValidationService;
  
  constructor(container: DIContainer) {
    this.fileService = container.resolve('FileService');
    this.validator = container.resolve('ValidationService');
  }
}
```

### 5. Event-Driven Architecture

```typescript
// Decouple components with events
class EventBus {
  private handlers = new Map<string, Function[]>();
  
  on(event: string, handler: Function): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }
  
  emit(event: string, data: any): void {
    const handlers = this.handlers.get(event) || [];
    handlers.forEach(handler => handler(data));
  }
}

// Usage
eventBus.on('file.created', async (data) => {
  await indexingService.indexFile(data.path);
});
```

## Implementation Plan

### Phase 1: Extract Services (2 weeks)
- [ ] Create FileService, SearchService, ValidationService
- [ ] Extract methods from ObsidianAPI
- [ ] Add unit tests for each service

### Phase 2: Implement Handlers (1 week)
- [ ] Create OperationHandler interface
- [ ] Implement handlers for each operation type
- [ ] Create OperationRegistry

### Phase 3: Dependency Injection (1 week)
- [ ] Implement DIContainer
- [ ] Register all services
- [ ] Refactor constructors to use DI

### Phase 4: Plugin Architecture (2 weeks)
- [ ] Design plugin API
- [ ] Create plugin loader
- [ ] Document plugin development

## Benefits
- Easier to test individual components
- New features don't require core changes
- Clear separation of concerns
- Better code reusability
- Improved maintainability

## Metrics
- Reduce average class size from 800+ to <200 lines
- Achieve 90%+ unit test coverage
- Reduce coupling metrics by 50%
- Enable adding new operations without core changes

## Acceptance Criteria
- [ ] No class exceeds 300 lines
- [ ] All operations use handler pattern
- [ ] Dependency injection implemented
- [ ] Plugin system documented
- [ ] 90% unit test coverage
- [ ] Performance unchanged or improved

## Labels
`code-quality` `refactoring` `architecture` `technical-debt`