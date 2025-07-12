# 🟠 HIGH: Insecure Session Management Implementation

## Summary
The session management system uses predictable client-provided session IDs without cryptographic validation, enabling session hijacking and unauthorized access.

## Current Behavior
- Sessions use client-provided UUIDs without validation
- No cryptographic session tokens
- No session integrity verification
- Sessions can be hijacked by guessing/brute-forcing UUIDs
- No rate limiting on session creation

## Security Impact
- **Severity**: HIGH
- **Attack Vector**: Session ID manipulation
- **Impact**: Session hijacking, unauthorized access, impersonation

## Vulnerable Code
```typescript
// mcp-server.ts:328-329
// Client can provide any session ID!
const sessionId = req.headers['mcp-session-id'] as string | undefined;

// mcp-server.ts:366-368
// New session with predictable UUID
effectiveSessionId = randomUUID();
transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => effectiveSessionId!
});
```

```typescript
// session-manager.ts:64-111
getOrCreateSession(sessionId: string): SessionInfo {
  // No validation of sessionId format or authenticity!
  let session = this.sessions.get(sessionId);
  
  if (session) {
    session.lastActivityAt = now;
    session.requestCount++;
    return session;
  }
  
  // Creates session with any provided ID
  session = {
    sessionId,  // Trusts client-provided ID!
    createdAt: now,
    lastActivityAt: now,
    requestCount: 1
  };
}
```

## Attack Scenarios
1. **Session Hijacking**: Guess active session UUIDs
2. **Session Fixation**: Force server to use attacker-chosen session ID
3. **Brute Force**: Try common UUID patterns
4. **Session Replay**: Reuse discovered session IDs
5. **DoS via Session Flooding**: Create unlimited sessions

## Proposed Solution

### Secure Session Management
```typescript
import { randomBytes, createHmac } from 'crypto';

interface SecureSession {
  id: string;
  token: string;
  createdAt: number;
  lastActivity: number;
  fingerprint: string;
  metadata: {
    clientInfo: string;
    permissions: string[];
  };
}

class SecureSessionManager {
  private sessions = new Map<string, SecureSession>();
  private sessionTokens = new Map<string, string>(); // token -> sessionId
  private secretKey: Buffer;
  
  constructor() {
    // Generate or load persistent secret key
    this.secretKey = this.loadOrGenerateSecret();
  }
  
  createSession(clientInfo: string): { id: string; token: string } {
    // Generate cryptographically secure session ID
    const sessionId = randomBytes(32).toString('hex');
    
    // Generate signed session token
    const tokenPayload = {
      sid: sessionId,
      iat: Date.now(),
      exp: Date.now() + 3600000, // 1 hour
      nonce: randomBytes(16).toString('hex')
    };
    
    const token = this.signToken(tokenPayload);
    
    // Create session with fingerprint
    const session: SecureSession = {
      id: sessionId,
      token: token,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      fingerprint: this.generateFingerprint(clientInfo),
      metadata: {
        clientInfo,
        permissions: ['read', 'write'] // Based on auth
      }
    };
    
    this.sessions.set(sessionId, session);
    this.sessionTokens.set(token, sessionId);
    
    return { id: sessionId, token };
  }
  
  validateSession(token: string, clientInfo: string): SecureSession | null {
    // Verify token signature
    if (!this.verifyToken(token)) {
      return null;
    }
    
    // Get session
    const sessionId = this.sessionTokens.get(token);
    if (!sessionId) return null;
    
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    // Verify fingerprint (prevents token theft)
    if (session.fingerprint !== this.generateFingerprint(clientInfo)) {
      this.logSecurityEvent('fingerprint_mismatch', { sessionId, clientInfo });
      return null;
    }
    
    // Check expiration
    if (Date.now() - session.lastActivity > 3600000) {
      this.removeSession(sessionId);
      return null;
    }
    
    // Update activity
    session.lastActivity = Date.now();
    return session;
  }
  
  private signToken(payload: any): string {
    const data = JSON.stringify(payload);
    const hmac = createHmac('sha256', this.secretKey);
    hmac.update(data);
    const signature = hmac.digest('hex');
    return Buffer.from(data).toString('base64') + '.' + signature;
  }
  
  private verifyToken(token: string): boolean {
    try {
      const [data, signature] = token.split('.');
      const payload = JSON.parse(Buffer.from(data, 'base64').toString());
      
      // Check expiration
      if (payload.exp < Date.now()) return false;
      
      // Verify signature
      const hmac = createHmac('sha256', this.secretKey);
      hmac.update(Buffer.from(data, 'base64').toString());
      const expectedSignature = hmac.digest('hex');
      
      return signature === expectedSignature;
    } catch {
      return false;
    }
  }
}
```

### Integration with Rate Limiting
```typescript
class SessionRateLimiter {
  private attempts = new Map<string, number[]>();
  private readonly maxAttempts = 10;
  private readonly windowMs = 60000; // 1 minute
  
  checkLimit(identifier: string): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(identifier) || [];
    
    // Remove old attempts
    const recentAttempts = attempts.filter(t => now - t < this.windowMs);
    
    if (recentAttempts.length >= this.maxAttempts) {
      return false; // Rate limit exceeded
    }
    
    recentAttempts.push(now);
    this.attempts.set(identifier, recentAttempts);
    return true;
  }
}
```

## Implementation Steps

1. **Phase 1: Token-Based Sessions**
   - Replace UUID sessions with signed tokens
   - Add token validation middleware
   - Implement session expiration

2. **Phase 2: Security Hardening**
   - Add client fingerprinting
   - Implement rate limiting
   - Add security event logging

3. **Phase 3: Advanced Features**
   - Session refresh tokens
   - Concurrent session limits
   - Session revocation API

## Configuration
```json
{
  "session": {
    "timeout": 3600000,
    "maxConcurrent": 5,
    "requireSecureTransport": true,
    "tokenAlgorithm": "HS256",
    "refreshEnabled": true,
    "refreshWindow": 300000
  }
}
```

## Breaking Changes
- Session header changes from `Mcp-Session-Id` to `Authorization: Bearer <token>`
- Session creation requires authentication
- Existing sessions invalidated on upgrade

## Testing Requirements
- Security tests for token validation
- Load tests for session creation
- Penetration tests for session hijacking
- Unit tests for all security functions

## Acceptance Criteria
- [ ] Cryptographic session tokens implemented
- [ ] Client fingerprinting added
- [ ] Rate limiting on session operations
- [ ] Security event logging
- [ ] Session expiration and cleanup
- [ ] Documentation for new session model

## Labels
`security` `high-priority` `session-management` `breaking-change`