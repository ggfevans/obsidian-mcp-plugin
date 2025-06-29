# Graph Traversal Search Tool

The Obsidian MCP Plugin now includes powerful graph traversal capabilities that allow you to explore the connections between your notes using Obsidian's internal link graph.

## Overview

Obsidian maintains a graph of all links between your notes through its `MetadataCache`. The graph traversal tool leverages this to:

- Explore connected notes up to a specified depth
- Find paths between any two notes
- Analyze link statistics (incoming/outgoing links)
- Discover related content through backlinks and forward links
- Navigate your knowledge graph programmatically

## Graph Concepts

### Nodes and Edges

- **Nodes**: Individual files/notes in your vault
- **Edges**: Links between files
  - **Forward Links**: Links from a file to other files
  - **Backlinks**: Links from other files to this file
  - **Tag Connections**: Files sharing common tags

### Obsidian's Link Storage

Obsidian stores link relationships in `metadataCache.resolvedLinks`:
```javascript
{
  "source-file.md": {
    "target-file1.md": 2,  // 2 links from source to target1
    "target-file2.md": 1   // 1 link from source to target2
  }
}
```

## Available Operations

### 1. Traverse - Explore Connected Nodes

Performs breadth-first traversal from a starting file to discover connected notes.

```json
{
  "operation": "graph",
  "action": "traverse",
  "sourcePath": "Daily Notes/2024-01-15.md",
  "maxDepth": 3,
  "maxNodes": 50,
  "followBacklinks": true,
  "followForwardLinks": true
}
```

**Parameters:**
- `sourcePath` (required): Starting file path
- `maxDepth`: How many hops to traverse (default: 3)
- `maxNodes`: Maximum nodes to return (default: 50)
- `followBacklinks`: Include incoming links (default: true)
- `followForwardLinks`: Include outgoing links (default: true)
- `followTags`: Include tag-based connections (default: false)
- `fileFilter`: Regex pattern to filter files
- `folderFilter`: Limit to specific folder

### 2. Neighbors - Get Direct Connections

Returns all files directly linked to/from a specific file.

```json
{
  "operation": "graph",
  "action": "neighbors",
  "sourcePath": "Projects/MyProject.md"
}
```

### 3. Path - Find Paths Between Files

Finds the shortest path and optionally all paths between two files.

```json
{
  "operation": "graph",
  "action": "path",
  "sourcePath": "Concepts/AI.md",
  "targetPath": "Projects/ChatBot.md",
  "maxDepth": 5
}
```

### 4. Statistics - Get Link Counts

Returns detailed link statistics for a file.

```json
{
  "operation": "graph",
  "action": "statistics",
  "sourcePath": "index.md"
}
```

**Returns:**
- `inDegree`: Number of files linking to this file
- `outDegree`: Number of files this file links to
- `totalDegree`: Total connections
- `unresolvedCount`: Number of broken links
- `tagCount`: Number of tags

### 5. Backlinks - Get Incoming Links

Lists all files that link to the specified file.

```json
{
  "operation": "graph",
  "action": "backlinks",
  "sourcePath": "Important Concepts/Knowledge Management.md"
}
```

### 6. Forward Links - Get Outgoing Links

Lists all files that the specified file links to.

```json
{
  "operation": "graph",
  "action": "forwardlinks",
  "sourcePath": "MOCs/Programming MOC.md"
}
```

## Example Use Cases

### 1. Find Related Notes

To discover notes related to a topic:
```json
{
  "operation": "graph",
  "action": "traverse",
  "sourcePath": "Topics/Machine Learning.md",
  "maxDepth": 2,
  "maxNodes": 30
}
```

### 2. Analyze Note Importance

To find the most linked-to notes:
```json
{
  "operation": "graph",
  "action": "statistics",
  "sourcePath": "index.md"
}
```

### 3. Trace Knowledge Paths

To understand how two concepts are connected:
```json
{
  "operation": "graph",
  "action": "path",
  "sourcePath": "Basics/Python.md",
  "targetPath": "Advanced/Neural Networks.md"
}
```

### 4. Explore Project Dependencies

To find all notes referenced by a project:
```json
{
  "operation": "graph",
  "action": "traverse",
  "sourcePath": "Projects/BigProject.md",
  "maxDepth": 1,
  "followBacklinks": false,
  "followForwardLinks": true
}
```

## Response Format

### Traverse/Neighbors Response
```json
{
  "operation": "traverse",
  "sourcePath": "example.md",
  "nodes": [
    {
      "path": "note1.md",
      "title": "Note 1",
      "type": "file",
      "tags": ["tag1", "tag2"],
      "links": {
        "forward": 5,
        "backward": 3,
        "total": 8
      }
    }
  ],
  "edges": [
    {
      "source": "example.md",
      "target": "note1.md",
      "type": "link",
      "count": 2
    }
  ],
  "graphStats": {
    "totalNodes": 15,
    "totalEdges": 23,
    "maxDepthReached": 3,
    "traversalTime": 45
  },
  "workflow": {
    "message": "Found 15 connected nodes",
    "suggested_next": [...]
  }
}
```

### Path Finding Response
```json
{
  "operation": "path",
  "sourcePath": "start.md",
  "targetPath": "end.md",
  "paths": [
    ["start.md", "middle1.md", "end.md"],
    ["start.md", "middle2.md", "middle3.md", "end.md"]
  ],
  "message": "Found 2 paths. Shortest path has 3 nodes."
}
```

## Technical Implementation

### Core Classes

1. **GraphTraversal**: Core graph algorithms
   - Breadth-first search for traversal
   - Shortest path using BFS
   - All paths using DFS
   - Local neighborhood queries

2. **GraphSearchTool**: MCP tool interface
   - Parameter validation
   - Response formatting
   - Workflow suggestions

3. **Integration**: 
   - Uses Obsidian's `metadataCache.resolvedLinks`
   - Accesses file metadata through `getFileCache()`
   - Leverages native Obsidian APIs for performance

### Performance Considerations

- Graph operations are memory-intensive for large vaults
- Use `maxDepth` and `maxNodes` to limit scope
- Traversal is optimized using BFS for shortest paths
- Results are cached during a single operation

## Future Enhancements

1. **Weighted Paths**: Consider link frequency as edge weights
2. **Semantic Similarity**: Combine with content analysis
3. **Graph Visualization**: Export to graph visualization formats
4. **Community Detection**: Find clusters of related notes
5. **Link Prediction**: Suggest potential connections