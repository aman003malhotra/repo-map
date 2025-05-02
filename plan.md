# Code Analysis System Architecture Plan

## Overview
This document outlines the architecture and implementation plan for the code analysis system. The system will parse JavaScript files to create a graph of function definitions and their relationships.

## Core Components

### 1. Data Structures

#### Definition Tag
```typescript
interface DefinitionTag {
  name: string;
  type: string;  // class, function, method
  filePath: string;
  startLine: number;
  endLine: number;
}
```

#### Reference Tag
```typescript
interface ReferenceTag {
  name: string;
  type: string;  // functionCall
  kind: 'ref';
  filePath: string;
  line: number;
  caller: string;  // Name of the calling function
}
```

### 2. Storage Mechanisms

```typescript
// Separate storage for definitions and references
const definitions = new Map<string, DefinitionTag>();  // functionName -> definition
const references = new Map<string, ReferenceTag[]>();  // functionName -> array of references

// Edge tracking to prevent duplicates
const edges = new Set<string>();  // Unique edge identifiers
```

### 3. Parsing Process

#### Step 1: File Parsing
```typescript
async function parseFile(filePath: string): Promise<{ defTags: Tag[], refTags: Tag[] }> {
  // Parse the file
  const content = await fs.readFile(filePath, 'utf-8');
  const ast = parse(content);
  
  // Create tags
  return createTags(ast, filePath);
}
```

#### Step 2: Tag Creation
```typescript
function createTags(node: any, filePath: string): { defTags: Tag[], refTags: Tag[] } {
  const defTags: Tag[] = [];
  const refTags: Tag[] = [];
  
  // Create definition tags for function declarations
  if (isUserFunction(node)) {
    const defTag = {
      name: node.id?.name || node.key?.name,
      type: getFunctionType(node),
      kind: 'def',
      filePath,
      startLine: node.loc.start.line,
      endLine: node.loc.end.line
    };
    defTags.push(defTag);
  }
  
  // Create reference tags for function calls
  if (t.isCallExpression(node)) {
    const functionName = getFunctionName(node);
    
    // Skip built-in and library functions
    if (shouldTrackReference(functionName)) {
      const refTag = {
        name: functionName,
        type: 'functionCall',
        kind: 'ref',
        filePath,
        line: node.loc.start.line,
        caller: getCurrentFunctionName()
      };
      refTags.push(refTag);
    }
  }
  
  return { defTags, refTags };
}
```

### 4. Graph Construction

#### Step 1: Collect Tags
```typescript
async function collectTags(filePaths: string[]): Promise<void> {
  for (const file of filePaths) {
    const { defTags, refTags } = await parseFile(file);
    
    // Store definitions
    defTags.forEach(tag => {
      definitions.set(tag.name, tag);
    });
    
    // Store references (filtered)
    refTags.forEach(tag => {
      if (shouldTrackReference(tag.name)) {
        references.get(tag.name)?.push(tag);
      }
    });
  }
}
```

#### Step 2: Create Graph
```typescript
async function createGraph(filePaths: string[]): Promise<void> {
  // First pass: Collect all tags
  await collectTags(filePaths);
  
  // Second pass: Create graph
  for (const [functionName, defTag] of definitions.entries()) {
    // Create node for definition
    createNode(defTag);
    
    // Check for references
    const refs = references.get(functionName);
    if (refs) {
      // Create edges for each reference (with deduplication)
      refs.forEach(refTag => {
        createEdge(defTag, refTag);
      });
    }
  }
}
```

### 5. Edge Management

```typescript
function createEdge(from: DefinitionTag, to: ReferenceTag): void {
  // Create unique edge identifier
  const edgeId = `${from.filePath}:${from.name}->${to.filePath}:${to.name}:${to.line}`;
  
  // Only create edge if it doesn't exist
  if (!edges.has(edgeId)) {
    edges.add(edgeId);
    // Create the actual edge in your graph
    graph.addEdge(from, to);
  }
}
```

### 6. Reference Filtering

```typescript
// Built-in function blacklist
const BUILT_IN_FUNCTIONS = new Set([
  'console.log',
  'console.error',
  'console.warn',
  'JSON.stringify',
  'JSON.parse',
  'require',
  'module.exports',
  // Add more built-in functions as needed
]);

function shouldTrackReference(refName: string): boolean {
  // Check if it's a built-in function
  if (BUILT_IN_FUNCTIONS.has(refName)) {
    return false;
  }
  
  // Check if it's a library function
  if (refName.includes('lodash.') || 
      refName.includes('moment.') || 
      refName.includes('axios.')) {
    return false;
  }
  
  return true;
}
```

## Implementation Phases

### Phase 1: Basic Parsing
- Implement core parsing functionality
- Create basic tag structures
- Implement file reading and AST parsing

### Phase 2: Tag Creation
- Implement definition tag creation
- Implement reference tag creation
- Add filtering for built-in functions

### Phase 3: Graph Construction
- Implement edge deduplication
- Create node creation logic
- Implement reference resolution

### Phase 4: Optimization
- Add caching mechanisms
- Implement parallel processing
- Add memory optimizations

### Phase 5: Testing
- Unit tests for parsing
- Integration tests for graph construction
- Performance testing
- Edge case testing

## Key Features

1. **Single Pass Parsing**
   - Efficient file processing
   - Maintains accurate references
   - Handles cross-file dependencies

2. **Edge Deduplication**
   - Prevents duplicate edges
   - Maintains clean graph structure
   - Improves performance

3. **Reference Filtering**
   - Ignores built-in JavaScript functions
   - Skips common library functions
   - Focuses on meaningful relationships

4. **Memory Efficiency**
   - Separate storage for definitions and references
   - Edge tracking to prevent duplicates
   - Optimized data structures

## Future Improvements

1. **Advanced Reference Resolution**
   - Handle method overriding
   - Support dynamic imports
   - Improve alias resolution

2. **Performance Optimizations**
   - Implement streaming for large files
   - Add worker pool for parallel processing
   - Improve caching strategies

3. **Additional Features**
   - Support for TypeScript
   - Better handling of async/await
   - Improved error handling
   - More detailed code metrics

## Testing Strategy

1. **Unit Tests**
   - Test individual parsing functions
   - Verify tag creation
   - Test reference filtering

2. **Integration Tests**
   - Test complete file parsing
   - Verify graph construction
   - Test edge cases

3. **Performance Tests**
   - Test with large codebases
   - Measure memory usage
   - Test parsing speed

4. **Edge Case Tests**
   - Test circular dependencies
   - Test method overriding
   - Test dynamic imports

## Maintenance Considerations

1. **Code Updates**
   - Regular updates to built-in function list
   - Updates for new JavaScript features
   - Support for new libraries

2. **Performance Monitoring**
   - Track parsing time
   - Monitor memory usage
   - Track edge creation efficiency

3. **Documentation**
   - Maintain API documentation
   - Update usage examples
   - Keep configuration guides updated
