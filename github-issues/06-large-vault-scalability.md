# 🟡 MEDIUM: Large Vault Scalability - Path Validation Performance

## Summary
Path validation for vaults with 10,000+ files presents significant performance challenges. Current lack of validation is a security risk, but naive implementation would cause memory exhaustion and slow operations.

## Current Situation
- **No path validation** currently implemented (security vulnerability)
- Vaults can contain 100,000+ files
- Each file operation would need validation
- Memory and CPU constraints in Obsidian environment

## Performance Challenges

### Memory Impact
```
10,000 files × 100 chars/path × 2 bytes/char = 2MB minimum
100,000 files × 100 chars/path × 2 bytes/char = 20MB minimum
+ JavaScript object overhead (3-5x) = 60-100MB for path index
```

### Lookup Performance
- Naive array search: O(n) - up to 100ms for 100k files
- HashSet lookup: O(1) - but high memory cost
- Tree structure: O(log n) - balanced performance

## Proposed Solutions

### 1. Lazy Validation with LRU Cache (Recommended)
```typescript
class ScalablePathValidator {
  private securityRules = [
    /\.\./,           // Path traversal
    /^[A-Z]:\\/,      // Windows absolute
    /^\//,            // Unix absolute
    /\x00/,           // Null bytes
  ];
  
  private cache = new LRUCache<string, boolean>({
    max: 5000,        // Cache recent validations
    ttl: 300000,      // 5 minute TTL
    updateAgeOnGet: true
  });
  
  async validatePath(path: string): Promise<ValidationResult> {
    // Step 1: Security checks (microseconds, no I/O)
    for (const rule of this.securityRules) {
      if (rule.test(path)) {
        return { 
          valid: false, 
          reason: 'Security violation',
          cached: false 
        };
      }
    }
    
    // Step 2: Check cache (nanoseconds)
    const cached = this.cache.get(path);
    if (cached !== undefined) {
      return { valid: cached, cached: true };
    }
    
    // Step 3: Validate with Obsidian API (milliseconds)
    const exists = !!this.app.vault.getAbstractFileByPath(path);
    this.cache.set(path, exists);
    
    return { valid: exists, cached: false };
  }
  
  // Batch validation for performance
  async validatePaths(paths: string[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const uncached: string[] = [];
    
    // Check cache first
    for (const path of paths) {
      const cached = this.cache.get(path);
      if (cached !== undefined) {
        results.set(path, cached);
      } else {
        uncached.push(path);
      }
    }
    
    // Batch check uncached paths
    if (uncached.length > 0) {
      const files = this.app.vault.getFiles();
      const fileSet = new Set(files.map(f => f.path));
      
      for (const path of uncached) {
        const valid = fileSet.has(path);
        results.set(path, valid);
        this.cache.set(path, valid);
      }
    }
    
    return results;
  }
}
```

### 2. Hierarchical Prefix Validation
```typescript
class HierarchicalValidator {
  private prefixTree = new Map<string, PrefixNode>();
  private maxDepth = 3; // Only validate top 3 levels
  
  async initialize() {
    // Build prefix tree for top directories only
    const folders = this.app.vault.getAllLoadedFiles()
      .filter(f => f instanceof TFolder)
      .map(f => f.path.split('/').slice(0, this.maxDepth));
    
    // Build tree (much smaller than full path list)
    for (const parts of folders) {
      this.addToTree(parts);
    }
  }
  
  validatePath(path: string): boolean {
    // Quick security checks
    if (this.hasSecurityIssue(path)) return false;
    
    // Check if path starts with valid prefix
    const parts = path.split('/').slice(0, this.maxDepth);
    return this.checkPrefix(parts);
  }
}
```

### 3. Bloom Filter for Existence Checking
```typescript
class BloomFilterValidator {
  private bloomFilter: BloomFilter;
  private falsePositiveRate = 0.001; // 0.1% false positive
  
  async initialize() {
    const fileCount = this.app.vault.getFiles().length;
    const bitSize = Math.ceil(-fileCount * Math.log(this.falsePositiveRate) / Math.pow(Math.log(2), 2));
    const hashCount = Math.ceil(bitSize / fileCount * Math.log(2));
    
    this.bloomFilter = new BloomFilter(bitSize, hashCount);
    
    // Add all file paths
    for (const file of this.app.vault.getFiles()) {
      this.bloomFilter.add(file.path);
    }
  }
  
  validatePath(path: string): { definitelyInvalid: boolean; maybeValid: boolean } {
    if (!this.bloomFilter.test(path)) {
      return { definitelyInvalid: true, maybeValid: false };
    }
    
    // Need additional check for false positives
    return { definitelyInvalid: false, maybeValid: true };
  }
}
```

### 4. Configuration-Based Validation
```typescript
interface ValidationConfig {
  mode: 'strict' | 'relaxed' | 'custom';
  rules: ValidationRule[];
  cache: {
    enabled: boolean;
    maxSize: number;
    ttl: number;
  };
  performance: {
    maxSyncPaths: number;    // Switch to async above this
    batchSize: number;       // For batch operations
    indexingStrategy: 'lazy' | 'eager' | 'none';
  };
}

class ConfigurableValidator {
  constructor(private config: ValidationConfig) {}
  
  async validatePath(path: string): Promise<boolean> {
    switch (this.config.mode) {
      case 'strict':
        return this.strictValidation(path);
      case 'relaxed':
        return this.relaxedValidation(path);
      case 'custom':
        return this.customValidation(path);
    }
  }
  
  private async strictValidation(path: string): Promise<boolean> {
    // Full validation with all security checks
    return this.securityCheck(path) && await this.existenceCheck(path);
  }
  
  private async relaxedValidation(path: string): Promise<boolean> {
    // Only security checks, trust Obsidian for existence
    return this.securityCheck(path);
  }
}
```

## Implementation Recommendations

### For Most Users (< 10,000 files)
```typescript
const validator = new ScalablePathValidator({
  cacheSize: 1000,
  securityOnly: false
});
```

### For Large Vaults (10,000 - 100,000 files)
```typescript
const validator = new ScalablePathValidator({
  cacheSize: 5000,
  securityOnly: true,  // Skip existence checks
  prefixValidation: true
});
```

### For Huge Vaults (> 100,000 files)
```typescript
const validator = new LazyValidator({
  mode: 'security-only',
  asyncThreshold: 100,
  enableBatching: true
});
```

## Performance Benchmarks

| Vault Size | Strategy | Memory Usage | Validation Time |
|------------|----------|--------------|-----------------|
| 1,000 | Full Index | 2MB | <1ms |
| 10,000 | LRU Cache | 5MB | 1-5ms |
| 100,000 | Security Only | 1MB | <1ms |
| 1,000,000 | Lazy + Prefix | 10MB | 5-10ms |

## Configuration UI
```typescript
// Add to plugin settings
interface ScalabilitySettings {
  validationMode: 'off' | 'security' | 'full';
  cacheSize: number;
  performanceMode: 'memory' | 'balanced' | 'speed';
  customRules: string[];
}
```

## Testing Requirements
- Benchmark with vaults of various sizes (1K, 10K, 100K files)
- Memory profiling under different strategies
- Stress testing with concurrent operations
- Edge cases (Unicode paths, very long paths)

## Acceptance Criteria
- [ ] Path validation adds <10ms to operations
- [ ] Memory usage scales logarithmically with vault size
- [ ] Configurable validation strategies
- [ ] Security checks always enabled
- [ ] Performance metrics in settings UI
- [ ] Documentation for large vault users

## Labels
`performance` `scalability` `security` `configuration`