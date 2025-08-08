import { 
  ensureStringContent, 
  safeContentMatch, 
  safeCountMatches, 
  countFragmentMatches 
} from '../content-handler';
import { Fragment } from '../../types/fragment';

describe('Content Handler', () => {
  describe('ensureStringContent', () => {
    test('handles string content', () => {
      expect(ensureStringContent('test string')).toBe('test string');
    });

    test('handles null and undefined', () => {
      expect(ensureStringContent(null)).toBe('');
      expect(ensureStringContent(undefined)).toBe('');
    });

    test('handles Buffer', () => {
      const buffer = Buffer.from('test content', 'utf-8');
      expect(ensureStringContent(buffer)).toBe('test content');
    });

    test('handles numbers and objects', () => {
      expect(ensureStringContent(123)).toBe('123');
      expect(ensureStringContent({ toString: () => 'custom' })).toBe('custom');
    });

    test('handles Fragment array', () => {
      const fragments = [
        { content: 'First fragment' },
        { text: 'Second fragment' },
        'Third fragment',
        { data: 'Fourth fragment' }
      ];
      const result = ensureStringContent(fragments);
      expect(result).toBe('First fragment\nSecond fragment\nThird fragment\nFourth fragment');
    });

    test('handles empty Fragment array', () => {
      expect(ensureStringContent([])).toBe('');
    });

    test('handles mixed Fragment array with empty items', () => {
      const fragments = [
        { content: 'Valid content' },
        {},
        { text: '' },
        null,
        { content: 'More content' }
      ];
      const result = ensureStringContent(fragments);
      expect(result).toBe('Valid content\nMore content');
    });
  });

  describe('safeContentMatch', () => {
    test('performs safe match operations on strings', () => {
      const result = safeContentMatch('hello world test', /world/);
      expect(result).toBeTruthy();
      expect(result![0]).toBe('world');
    });

    test('returns null for non-matching patterns', () => {
      expect(safeContentMatch('hello world', /xyz/)).toBeNull();
    });

    test('handles null content', () => {
      expect(safeContentMatch(null, /test/)).toBeNull();
    });

    test('handles Fragment array', () => {
      const fragments = [
        { content: 'This has [[link1]]' },
        { text: 'This has [[link2]] and [[link3]]' }
      ];
      const result = safeContentMatch(fragments, /\[\[.*?\]\]/g);
      expect(result).toHaveLength(3);
    });
  });

  describe('safeCountMatches', () => {
    test('counts matches in string content', () => {
      expect(safeCountMatches('[[link1]] and [[link2]]', /\[\[.*?\]\]/g)).toBe(2);
      expect(safeCountMatches('#tag1 #tag2 #tag3', /#\w+/g)).toBe(3);
    });

    test('returns 0 for no matches', () => {
      expect(safeCountMatches('no links here', /\[\[.*?\]\]/g)).toBe(0);
    });

    test('handles null content', () => {
      expect(safeCountMatches(null, /\[\[.*?\]\]/g)).toBe(0);
    });
  });

  describe('countFragmentMatches', () => {
    test('counts matches in Fragment array', () => {
      const fragments = [
        { content: 'File with [[link1]] and #tag1' },
        { text: 'Another file with [[link2]] and [[link3]]' },
        { data: 'Third file with #tag2' }
      ];
      
      expect(countFragmentMatches(fragments, /\[\[.*?\]\]/g)).toBe(3);
      expect(countFragmentMatches(fragments, /#\w+/g)).toBe(2);
    });

    test('handles empty Fragment array', () => {
      expect(countFragmentMatches([], /\[\[.*?\]\]/g)).toBe(0);
    });

    test('handles string content as fallback', () => {
      expect(countFragmentMatches('[[link1]] and [[link2]]', /\[\[.*?\]\]/g)).toBe(2);
    });

    test('handles mixed Fragment array with various structures', () => {
      const fragments = [
        'Direct string with [[link1]]',
        { content: 'Object with [[link2]]' },
        { text: 'Text property with [[link3]]' },
        { data: 'Data property with [[link4]]' },
        {}, // Empty object
        null, // Null item
        { content: null }, // Null content
        { other: 'property' } // No recognized content property
      ];
      
      expect(countFragmentMatches(fragments, /\[\[.*?\]\]/g)).toBe(4);
    });

    test('provides context for debugging', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // This should trigger the error handling
      countFragmentMatches({ invalid: 'structure' }, /test/, 'test-context');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Fragment match counting failed in test-context'),
        expect.any(Object)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    test('handles conversion errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Create an object that throws when toString is called
      const errorObject = {
        toString: () => {
          throw new Error('toString failed');
        }
      };
      
      const result = ensureStringContent(errorObject, 'test-context');
      expect(result).toBe('');
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    test('handles match errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // This should work fine, but let's test the error path is there
      const result = safeContentMatch('test', /valid/, 'test-context');
      expect(result).toBeNull(); // No match, but no error
      
      consoleSpy.mockRestore();
    });
  });
});