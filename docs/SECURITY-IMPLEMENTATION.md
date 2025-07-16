# Security Implementation Guide

This document outlines the security implementation plan for fixing path traversal vulnerabilities and adding operation permissions to the Obsidian MCP Plugin.

## 🎯 Objectives

1. **Fix Critical Path Traversal Vulnerability** (Issue #10)
2. **Implement Operation Permissions** (Issue #15)
3. **Create Unified Security Architecture**

## 📋 Implementation Checklist

### Phase 1: Core Path Validation (Critical - Immediate)

- [ ] Create `SecurePathValidator` class
  - [ ] Implement 7-layer validation approach
  - [ ] Add dangerous pattern detection
  - [ ] Implement path normalization
  - [ ] Add vault boundary validation
  - [ ] Optional: Real path verification
- [ ] Create `SecurityError` custom error class
- [ ] Integration with ObsidianAPI
  - [ ] Wrap `getFile()` method
  - [ ] Wrap `createFile()` method
  - [ ] Wrap `updateFile()` method
  - [ ] Wrap `deleteFile()` method
  - [ ] Wrap `appendToFile()` method
  - [ ] Wrap `patchVaultFile()` method
  - [ ] Wrap `listFiles()` method
  - [ ] Wrap `openFile()` method
  - [ ] Wrap move/rename/copy operations
- [ ] Add security logging
  - [ ] Log validation failures
  - [ ] Log suspicious patterns
  - [ ] Create audit trail

### Phase 2: Operation Permissions System

- [ ] Create `VaultSecurityManager` class
- [ ] Implement `OperationPermissions` class
  - [ ] READ permission
  - [ ] CREATE permission
  - [ ] UPDATE permission
  - [ ] DELETE permission
  - [ ] MOVE/RENAME permission
  - [ ] EXECUTE permission (open in Obsidian)
- [ ] Add permission checks to all operations
- [ ] Create permission presets
  - [ ] Read-only mode
  - [ ] Safe mode (no delete)
  - [ ] Full access
- [ ] Settings integration
  - [ ] Add to plugin settings interface
  - [ ] Store in plugin configuration

### Phase 3: Advanced Security Features

- [ ] TypeScript branded types
  ```typescript
  type ValidatedPath = string & { readonly __brand: 'ValidatedPath' };
  ```
- [ ] Path allowlist/blocklist
  - [ ] Implement allowlist validation
  - [ ] Implement blocklist validation
  - [ ] Pattern matching support
- [ ] Rate limiting
  - [ ] Track operation attempts
  - [ ] Implement sliding window
  - [ ] Configurable thresholds
- [ ] Sandbox mode
  - [ ] Restrict to specific folder
  - [ ] Virtual chroot implementation

### Phase 4: User Interface

- [ ] Security settings tab
  - [ ] Path validation toggle
  - [ ] Permission checkboxes
  - [ ] Quick presets dropdown
  - [ ] Path rules editor
- [ ] Status indicators
  - [ ] Security status in status bar
  - [ ] Visual feedback for blocked operations
- [ ] Audit log viewer
  - [ ] Display recent security events
  - [ ] Export capability

### Phase 5: Testing & Documentation

- [ ] Unit tests
  - [ ] Path validation edge cases
  - [ ] Permission system tests
  - [ ] Integration tests
- [ ] Security test suite
  ```typescript
  const maliciousInputs = [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\config\\sam',
    'valid/path/../../secret.txt',
    '%2e%2e%2f%2e%2e%2fsecret.txt',
    'C:\\Windows\\System32\\config\\',
    '/etc/passwd',
    '\\\\server\\share\\file.txt',
    'path\x00.txt',
    '.../.../.../.../etc/passwd',
    '..%252f..%252f..%252fetc%252fpasswd'
  ];
  ```
- [ ] Documentation
  - [ ] Security configuration guide
  - [ ] API changes documentation
  - [ ] Migration guide for users
- [ ] Security advisory
  - [ ] CVE documentation
  - [ ] Disclosure timeline

## 🏗️ Architecture Overview

```typescript
// Core Security Architecture
class VaultSecurityManager {
  private validator: PathValidator;
  private permissions: OperationPermissions;
  private auditLog: SecurityAuditLog;
  
  async validateOperation(operation: VaultOperation): Promise<ValidatedOperation> {
    // 1. Check operation permission
    // 2. Validate and normalize path
    // 3. Check path-based permissions
    // 4. Log operation
    return validatedOperation;
  }
}

// Integration Point
class SecureObsidianAPI extends ObsidianAPI {
  private security: VaultSecurityManager;
  
  async getFile(path: string): Promise<ObsidianFileResponse> {
    const validated = await this.security.validateOperation({
      type: OperationType.READ,
      path: path
    });
    return super.getFile(validated.path);
  }
}
```

## 🔒 Security Layers

1. **Input Validation** - Reject dangerous patterns
2. **Path Type Validation** - Reject absolute paths
3. **Framework Normalization** - Use Obsidian's `normalizePath`
4. **Path Resolution** - Resolve to absolute path
5. **Path Normalization** - Remove any remaining `../`
6. **Boundary Validation** - Ensure path stays within vault
7. **Real Path Verification** - Prevent symlink attacks (optional)

## 📊 Security Settings Structure

```typescript
interface SecuritySettings {
  // Path validation
  pathValidation: 'strict' | 'moderate' | 'disabled';
  allowedPaths?: string[];
  blockedPaths?: string[];
  
  // Operation permissions
  permissions: {
    read: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
    move: boolean;
    rename: boolean;
    execute: boolean;
  };
  
  // Advanced options
  logSecurityEvents: boolean;
  notifyOnBlocked: boolean;
  rateLimitEnabled: boolean;
  sandboxMode?: string; // Restrict to specific folder
}
```

## 🚨 Security Considerations

1. **Backward Compatibility**: Ensure existing functionality works with security enabled
2. **Performance Impact**: Path validation should be fast (<1ms per operation)
3. **User Experience**: Clear error messages for blocked operations
4. **Audit Trail**: All security events must be logged
5. **Default Security**: Ship with secure defaults, allow users to relax if needed

## 📅 Timeline

- **Week 1**: Phase 1 & 2 (Critical security fix)
- **Week 2**: Phase 3 & 4 (Enhanced features and UI)
- **Week 3**: Phase 5 (Testing and documentation)

## 🔗 References

- [OWASP Path Traversal Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Path_Traversal_Defense_Cheat_Sheet.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Issue #10: Path Traversal Vulnerability](https://github.com/aaronsb/obsidian-mcp-plugin/issues/10)
- [Issue #15: Operation Permissions](https://github.com/aaronsb/obsidian-mcp-plugin/issues/15)