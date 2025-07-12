# 🟠 HIGH: Missing Input Validation Across All Operations

## Summary
The plugin lacks comprehensive input validation for file content, search queries, and operation parameters, leading to potential crashes, DoS attacks, and unexpected behavior.

## Current Behavior
- No validation of file content size or format
- Search queries accept regex without sanitization
- No limits on batch operations
- Missing validation for special characters in filenames
- No protection against malformed JSON/YAML in frontmatter

## Security Impact
- **Severity**: HIGH
- **Attack Vector**: Malicious input via MCP protocol
- **Impact**: DoS, memory exhaustion, application crashes, data corruption

## Vulnerable Areas

### 1. File Content Operations
```typescript
// No size limits!
async createFile(path: string, content: string): Promise<any> {
  await this.ensureDirectoryExists(path);
  const file = await this.app.vault.create(path, content);
  return { path: file.path };
}
```

### 2. Search Operations
```typescript
// Unvalidated regex can cause ReDoS
async searchSimple(query: string): Promise<any[]> {
  const results = await this.search(query);  // No regex validation
  return results;
}
```

### 3. Batch Operations
```typescript
// No limits on array size
case 'combine': {
  const { paths, destination } = params;  // paths could be 10,000 items!
  // ... processing without limits
}
```

## Attack Scenarios
1. **Memory Exhaustion**: Create file with 1GB of content
2. **ReDoS Attack**: Search with `(a+)+b` pattern
3. **CPU DoS**: Combine 10,000 files in one operation
4. **Path Injection**: Filename with `../../` embedded
5. **Data Corruption**: Invalid UTF-8 sequences in content

## Proposed Solution

### Input Validator Framework
```typescript
interface ValidationRule {
  field: string;
  validators: Validator[];
}

class InputValidator {
  private rules: Map<string, ValidationRule[]> = new Map();
  
  constructor() {
    // Define validation rules
    this.rules.set('vault.create', [
      {
        field: 'path',
        validators: [
          new LengthValidator(1, 255),
          new PatternValidator(/^[^<>:"|?*]+$/),
          new PathSafetyValidator()
        ]
      },
      {
        field: 'content',
        validators: [
          new SizeValidator(0, 10 * 1024 * 1024), // 10MB max
          new UTF8Validator(),
          new ContentTypeValidator()
        ]
      }
    ]);
  }
  
  validate(operation: string, params: any): ValidationResult {
    const rules = this.rules.get(operation);
    if (!rules) return { valid: true };
    
    const errors: ValidationError[] = [];
    
    for (const rule of rules) {
      const value = params[rule.field];
      for (const validator of rule.validators) {
        const result = validator.validate(value);
        if (!result.valid) {
          errors.push({
            field: rule.field,
            message: result.message,
            code: result.code
          });
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

### Specific Validators Needed

1. **File Size Limits**
   ```typescript
   class FileSizeValidator {
     validate(content: string): ValidationResult {
       const sizeInBytes = Buffer.byteLength(content, 'utf8');
       if (sizeInBytes > this.maxSize) {
         return {
           valid: false,
           message: `File size ${sizeInBytes} exceeds limit ${this.maxSize}`
         };
       }
       return { valid: true };
     }
   }
   ```

2. **Safe Regex Validator**
   ```typescript
   class SafeRegexValidator {
     validate(pattern: string): ValidationResult {
       try {
         // Check for dangerous patterns
         if (this.hasExponentialComplexity(pattern)) {
           return {
             valid: false,
             message: 'Regex pattern has exponential complexity'
           };
         }
         new RegExp(pattern);
         return { valid: true };
       } catch (e) {
         return {
           valid: false,
           message: 'Invalid regex pattern'
         };
       }
     }
   }
   ```

3. **Batch Operation Limits**
   ```typescript
   class BatchLimitValidator {
     validate(items: any[]): ValidationResult {
       if (items.length > this.maxBatchSize) {
         return {
           valid: false,
           message: `Batch size ${items.length} exceeds limit ${this.maxBatchSize}`
         };
       }
       return { valid: true };
     }
   }
   ```

## Implementation Plan

### Phase 1: Critical Validators
- Path safety (prevent injection)
- File size limits
- Basic content validation

### Phase 2: Operation Validators  
- Search query safety
- Batch operation limits
- Parameter type checking

### Phase 3: Advanced Validation
- Content type detection
- Encoding validation
- Rate limiting

## Configuration
```json
{
  "validation": {
    "maxFileSize": 10485760,
    "maxBatchSize": 100,
    "maxPathLength": 255,
    "allowedFileTypes": [".md", ".txt", ".pdf"],
    "regexTimeout": 1000,
    "strictMode": true
  }
}
```

## Testing Requirements
- Unit tests for each validator
- Fuzzing tests with malformed input
- Performance tests with large inputs
- Integration tests for all operations

## Acceptance Criteria
- [ ] Input validation framework implemented
- [ ] All operations validate input
- [ ] Clear error messages for validation failures
- [ ] Configurable validation rules
- [ ] Performance impact < 5ms per operation
- [ ] Documentation for validation rules

## Labels
`security` `high-priority` `input-validation` `dos-prevention`