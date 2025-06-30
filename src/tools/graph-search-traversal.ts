import { App, TFile, CachedMetadata } from 'obsidian';
import { ObsidianAPI } from '../utils/obsidian-api';
import { SearchCore } from '../utils/search-core';

export interface SearchSnippet {
    text: string;
    score: number;
    context: string;
    lineNumber?: number;
}

export interface TraversalNode {
    path: string;
    depth: number;
    snippet: SearchSnippet;
    parentPath?: string;
}

export interface GraphSearchResult {
    startNode: string;
    searchQuery: string;
    maxDepth: number;
    traversalChain: TraversalNode[];
    totalNodesVisited: number;
    executionTime: number;
}

export class GraphSearchTraversal {
    constructor(
        private app: App,
        private api: ObsidianAPI,
        private searchCore: SearchCore
    ) {}

    /**
     * Performs a search-based graph traversal starting from a document
     * 
     * @param startPath - The starting document path
     * @param searchQuery - The search query to apply at each node
     * @param maxDepth - Maximum traversal depth (default: 3)
     * @param maxSnippetsPerNode - Maximum snippets to extract per node (default: 2)
     * @param scoreThreshold - Minimum score threshold for including nodes (default: 0.5)
     */
    async searchTraverse(
        startPath: string,
        searchQuery: string,
        maxDepth: number = 3,
        maxSnippetsPerNode: number = 2,
        scoreThreshold: number = 0.5
    ): Promise<GraphSearchResult> {
        const startTime = performance.now();
        const visited = new Set<string>();
        const traversalChain: TraversalNode[] = [];
        let totalNodesVisited = 0;

        // Queue for BFS traversal: [path, depth, parentPath]
        const queue: [string, number, string | undefined][] = [[startPath, 0, undefined]];
        
        while (queue.length > 0) {
            const [currentPath, depth, parentPath] = queue.shift()!;
            
            // Skip if already visited or exceeds max depth
            if (visited.has(currentPath) || depth > maxDepth) continue;
            
            visited.add(currentPath);
            totalNodesVisited++;

            // Get the file
            const file = this.app.vault.getAbstractFileByPath(currentPath);
            // Check if it's a file (not a folder) by checking for extension property
            if (!file || !('extension' in file)) continue;

            // Search within this document
            const snippets = await this.searchInFile(file as TFile, searchQuery, maxSnippetsPerNode);
            
            // Only include nodes with snippets above threshold
            const highScoreSnippets = snippets.filter(s => s.score >= scoreThreshold);
            
            if (highScoreSnippets.length > 0) {
                // Add the best snippet to the traversal chain
                traversalChain.push({
                    path: currentPath,
                    depth,
                    snippet: highScoreSnippets[0],
                    parentPath
                });

                // Only continue traversal from nodes with good matches
                if (depth < maxDepth) {
                    const links = await this.getLinkedPaths(file as TFile);
                    for (const linkedPath of links) {
                        if (!visited.has(linkedPath)) {
                            queue.push([linkedPath, depth + 1, currentPath]);
                        }
                    }
                }
            }
        }

        const executionTime = performance.now() - startTime;

        return {
            startNode: startPath,
            searchQuery,
            maxDepth,
            traversalChain,
            totalNodesVisited,
            executionTime
        };
    }

    /**
     * Search for snippets within a file
     */
    protected async searchInFile(file: TFile, query: string, maxSnippets: number): Promise<SearchSnippet[]> {
        const content = await this.app.vault.read(file);
        const lines = content.split('\n');
        const snippets: SearchSnippet[] = [];
        
        // Simple scoring based on query term frequency and position
        const queryTerms = query.toLowerCase().split(/\s+/);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineLower = line.toLowerCase();
            
            // Calculate score based on how many query terms appear
            let score = 0;
            let matchedTerms = 0;
            
            for (const term of queryTerms) {
                if (lineLower.includes(term)) {
                    matchedTerms++;
                    // Give higher score to exact matches
                    if (lineLower.includes(' ' + term + ' ')) {
                        score += 2;
                    } else {
                        score += 1;
                    }
                }
            }
            
            // Normalize score
            if (matchedTerms > 0) {
                score = score / (queryTerms.length * 2); // Max score of 1.0
                
                // Extract context (surrounding lines)
                const contextStart = Math.max(0, i - 1);
                const contextEnd = Math.min(lines.length - 1, i + 1);
                const context = lines.slice(contextStart, contextEnd + 1).join('\n');
                
                snippets.push({
                    text: line.trim(),
                    score,
                    context,
                    lineNumber: i + 1
                });
            }
        }
        
        // Sort by score and return top snippets
        return snippets
            .sort((a, b) => b.score - a.score)
            .slice(0, maxSnippets);
    }

    /**
     * Get all linked paths from a file (both forward and backlinks)
     */
    protected async getLinkedPaths(file: TFile): Promise<string[]> {
        const linkedPaths = new Set<string>();
        
        // Get forward links
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.links) {
            for (const link of cache.links) {
                const linkedFile = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
                if (linkedFile) {
                    linkedPaths.add(linkedFile.path);
                }
            }
        }
        
        // Get backlinks from resolvedLinks
        const resolvedLinks = this.app.metadataCache.resolvedLinks;
        if (resolvedLinks) {
            // Iterate through all files to find which ones link to this file
            for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
                if (links && links[file.path]) {
                    linkedPaths.add(sourcePath);
                }
            }
        }
        
        return Array.from(linkedPaths);
    }

    /**
     * Advanced traversal with multiple search strategies
     */
    async advancedSearchTraverse(
        startPath: string,
        searchQueries: string[],
        options: {
            maxDepth?: number;
            strategy?: 'breadth-first' | 'best-first' | 'beam-search';
            beamWidth?: number;
            includeOrphans?: boolean;
            followTags?: boolean;
            filePattern?: string;
        } = {}
    ): Promise<GraphSearchResult & { strategies: string[] }> {
        const {
            maxDepth = 3,
            strategy = 'best-first',
            beamWidth = 5,
            includeOrphans = false,
            followTags = true,
            filePattern
        } = options;

        // Implementation would vary based on strategy
        // For now, use the basic search traverse
        const result = await this.searchTraverse(
            startPath,
            searchQueries.join(' '),
            maxDepth
        );

        return {
            ...result,
            strategies: [strategy]
        };
    }
}