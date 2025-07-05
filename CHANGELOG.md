# Changelog

All notable changes to the Obsidian MCP Plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.8a] - 2025-01-05

### Added
- **Concurrent Sessions Support**: Multiple AI agents can now work simultaneously
  - Session-based connection pooling with up to 32 concurrent operations
  - Each MCP client gets a unique session ID for isolation
  - Session tracking and automatic cleanup after 1 hour of inactivity
  - New `obsidian://session-info` resource for monitoring active sessions
  
- **Worker Thread Infrastructure**: Foundation for parallel processing
  - Worker manager for handling CPU-intensive operations
  - Prepared infrastructure for offloading search and graph traversal
  - Non-blocking architecture to keep Obsidian UI responsive
  
- **Enhanced Connection Pool**: Improved request handling
  - Queue-based processing with configurable limits
  - Session-aware request routing
  - Automatic resource cleanup and error recovery

### Changed
- Updated MCP server to support session headers (`Mcp-Session-Id`)
- Enhanced debug logging to include session information
- Improved request processing pipeline for better concurrency

### Technical Details
- Added `ConnectionPool` class for managing concurrent requests
- Added `SessionManager` for tracking and expiring sessions
- Added `WorkerManager` for future worker thread operations
- Prepared semantic worker script for parallel processing

## Previous Versions

See git history for changes before v0.5.8a