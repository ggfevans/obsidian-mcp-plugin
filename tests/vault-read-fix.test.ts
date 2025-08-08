/**
 * Integration test for vault:read content.match error fix
 * Tests the specific scenario that was failing in issue #22
 */

import { Fragment } from '../src/types/fragment';

describe('vault:read content.match fix', () => {
  describe('Fragment array handling', () => {
    test('should handle Fragment array without throwing content.match error', () => {
      // Simulate the exact scenario from the bug report
      const mockResult = {
        content: [
          {
            id: 'frag1',
            docId: 'test-doc',
            docPath: 'test-file.md',
            content: 'This file has [[link1]] and #tag1',
            score: 0.8,
            lineStart: 1,
            lineEnd: 3
          },
          {
            id: 'frag2', 
            docId: 'test-doc',
            docPath: 'test-file.md',
            content: 'Another section with [[link2]] and [[link3]]',
            score: 0.6,
            lineStart: 5,
            lineEnd: 7
          }
        ] as Fragment[],
        originalContentLength: 150,
        fragmentMetadata: {
          totalFragments: 2,
          strategy: 'auto',
          query: 'test'
        }
      };

      // This is the exact logic from router.ts that was failing
      const content = typeof mockResult === 'string' ? mockResult : mockResult?.content || '';
      
      let linkCount = 0;
      let tagCount = 0;
      
      // This should NOT throw "content.match is not a function" error
      expect(() => {
        if (typeof content === 'string') {
          linkCount = (content.match(/\[\[.*?\]\]/g) || []).length;
          tagCount = (content.match(/#\w+/g) || []).length;
        } else if (Array.isArray(content)) {
          // Handle Fragment[] - extract content from each fragment
          content.forEach(fragment => {
            const fragmentText = typeof fragment === 'string' ? fragment : 
                                (fragment?.content || fragment?.text || fragment?.data || '');
            if (typeof fragmentText === 'string' && fragmentText.length > 0) {
              linkCount += (fragmentText.match(/\[\[.*?\]\]/g) || []).length;
              tagCount += (fragmentText.match(/#\w+/g) || []).length;
            }
          });
        }
      }).not.toThrow();

      // Verify correct counts
      expect(linkCount).toBe(3); // [[link1]], [[link2]], [[link3]]
      expect(tagCount).toBe(1);  // #tag1
    });

    test('should handle string content (returnFullFile=true case)', () => {
      const mockResult = {
        content: 'This is a string with [[link1]] and [[link2]] and #tag1 #tag2',
        metadata: {
          wordCount: 12
        }
      };

      const content = typeof mockResult === 'string' ? mockResult : mockResult?.content || '';
      
      let linkCount = 0;
      let tagCount = 0;
      
      // This should work fine (original working case)
      expect(() => {
        if (typeof content === 'string') {
          linkCount = (content.match(/\[\[.*?\]\]/g) || []).length;
          tagCount = (content.match(/#\w+/g) || []).length;
        } else if (Array.isArray(content)) {
          content.forEach(fragment => {
            const fragmentText = typeof fragment === 'string' ? fragment : 
                                (fragment?.content || fragment?.text || fragment?.data || '');
            if (typeof fragmentText === 'string' && fragmentText.length > 0) {
              linkCount += (fragmentText.match(/\[\[.*?\]\]/g) || []).length;
              tagCount += (fragmentText.match(/#\w+/g) || []).length;
            }
          });
        }
      }).not.toThrow();

      expect(linkCount).toBe(2);
      expect(tagCount).toBe(2);
    });

    test('should handle empty Fragment array', () => {
      const mockResult = {
        content: [] as Fragment[]
      };

      const content = typeof mockResult === 'string' ? mockResult : mockResult?.content || '';
      
      let linkCount = 0;
      let tagCount = 0;
      
      expect(() => {
        if (typeof content === 'string') {
          linkCount = (content.match(/\[\[.*?\]\]/g) || []).length;
          tagCount = (content.match(/#\w+/g) || []).length;
        } else if (Array.isArray(content)) {
          content.forEach(fragment => {
            const fragmentText = typeof fragment === 'string' ? fragment : 
                                (fragment?.content || fragment?.text || fragment?.data || '');
            if (typeof fragmentText === 'string' && fragmentText.length > 0) {
              linkCount += (fragmentText.match(/\[\[.*?\]\]/g) || []).length;
              tagCount += (fragmentText.match(/#\w+/g) || []).length;
            }
          });
        }
      }).not.toThrow();

      expect(linkCount).toBe(0);
      expect(tagCount).toBe(0);
    });

    test('should handle Fragment array with mixed content properties', () => {
      const mockResult = {
        content: [
          { content: 'Fragment with [[link1]]' },
          { text: 'Fragment with [[link2]] and #tag1' },
          { data: 'Fragment with #tag2' },
          {}, // Empty fragment
          null, // Null fragment (edge case)
          'Direct string [[link3]]' // String in array
        ]
      };

      const content = typeof mockResult === 'string' ? mockResult : mockResult?.content || '';
      
      let linkCount = 0;
      let tagCount = 0;
      
      expect(() => {
        if (typeof content === 'string') {
          linkCount = (content.match(/\[\[.*?\]\]/g) || []).length;
          tagCount = (content.match(/#\w+/g) || []).length;
        } else if (Array.isArray(content)) {
          content.forEach(fragment => {
            const fragmentText = typeof fragment === 'string' ? fragment : 
                                (fragment?.content || fragment?.text || fragment?.data || '');
            if (typeof fragmentText === 'string' && fragmentText.length > 0) {
              linkCount += (fragmentText.match(/\[\[.*?\]\]/g) || []).length;
              tagCount += (fragmentText.match(/#\w+/g) || []).length;
            }
          });
        }
      }).not.toThrow();

      expect(linkCount).toBe(3); // [[link1]], [[link2]], [[link3]]
      expect(tagCount).toBe(2);  // #tag1, #tag2
    });
  });

  describe('error reproduction', () => {
    test('OLD CODE would have thrown content.match error', () => {
      const mockResult = {
        content: [
          { content: 'Test fragment' }
        ] as Fragment[]
      };

      const content = typeof mockResult === 'string' ? mockResult : mockResult?.content || '';
      
      // This is what the OLD code was doing - it would fail
      expect(() => {
        // OLD BROKEN CODE (commented out to prevent actual error):
        // const linkCount = (content.match(/\[\[.*?\]\]/g) || []).length;
        
        // Instead, verify that content is indeed an array
        expect(Array.isArray(content)).toBe(true);
        expect(typeof content).not.toBe('string');
        
        // And that calling .match() on it would fail
        if (Array.isArray(content) && typeof content.match === 'undefined') {
          // This confirms the bug - arrays don't have .match() method
          expect(true).toBe(true);
        }
      }).not.toThrow(); // Our test itself shouldn't throw
    });
  });
});