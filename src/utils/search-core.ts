import { App, TFile, SearchResult, SearchMatches } from 'obsidian';

/**
 * Core search functionality that wraps Obsidian's search API
 */
export class SearchCore {
    constructor(private app: App) {}

    /**
     * Search for files containing the query
     */
    async search(query: string): Promise<SearchResult[]> {
        // Use Obsidian's search API
        const searchResults = await this.app.vault.search(query);
        return searchResults;
    }

    /**
     * Get search matches within a specific file
     */
    async searchInFile(file: TFile, query: string): Promise<SearchMatches | null> {
        const searchResults = await this.app.vault.search(query);
        
        // Find matches for this specific file
        for (const result of searchResults) {
            if (result.file === file) {
                return result.matches || null;
            }
        }
        
        return null;
    }

    /**
     * Simple text search within content
     */
    searchInContent(content: string, query: string): Array<{line: number, match: string, score: number}> {
        const lines = content.split('\n');
        const results: Array<{line: number, match: string, score: number}> = [];
        const queryLower = query.toLowerCase();
        const queryTerms = queryLower.split(/\s+/);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineLower = line.toLowerCase();
            
            let score = 0;
            let matchedTerms = 0;
            
            for (const term of queryTerms) {
                if (lineLower.includes(term)) {
                    matchedTerms++;
                    // Higher score for exact word matches
                    const wordBoundaryRegex = new RegExp(`\\b${term}\\b`, 'i');
                    if (wordBoundaryRegex.test(line)) {
                        score += 2;
                    } else {
                        score += 1;
                    }
                }
            }
            
            if (matchedTerms > 0) {
                // Normalize score
                score = score / (queryTerms.length * 2);
                results.push({
                    line: i + 1,
                    match: line.trim(),
                    score
                });
            }
        }
        
        // Sort by score descending
        return results.sort((a, b) => b.score - a.score);
    }
}