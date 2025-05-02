# Repository Mapping Tool - Detailed Development Plan

## Project Overview

This project aims to create a robust, extensible NPM package that analyzes code repositories (from Git URLs or local paths), parses code structure using Tree-sitter, builds a graph representation of the codebase, and persists this graph in a Neo4j database. The system is designed to support code search, analysis, AI-powered documentation, and semantic search.

---

## System Architecture (Expanded)

The system is modular, inspired by the Potpie parsing module, with clear separation of concerns. Each module is responsible for a distinct part of the pipeline, supporting maintainability and extensibility.

### Directory Structure

```
/src/
├── graph_construction/
│   ├── code-parser.ts            # Tree-sitter parsing implementation
│   ├── graph-builder.ts          # Graph construction from parsed code
│   ├── neo4j-service.ts          # Neo4j database operations
│   ├── repo-fetcher.ts           # Repository acquisition
│   ├── repo-scanner.ts           # Directory traversal and file filtering
│   └── queries/                  # Tree-sitter query files for different languages
│       ├── javascript.scm
│       ├── typescript.scm
│       ├── python.scm
│       └── ...
├── knowledge_graph/
│   └── embedding-service.ts      # Vector embedding generation
├── types/
│   └── index.ts                  # Type definitions
├── utils/
│   └── utils.ts                  # Utility functions
└── index.ts                      # Main entry point and CLI
```

---

## Key Components (Elaborated)

### 1. graph_construction

#### a. Repository Fetcher (`repo-fetcher.ts`)

Responsible for acquiring the repository code:

- **fetchRepository**: Main function to retrieve repository content
  - Handles both remote Git repositories and local directories
  - Supports branch selection for Git repositories
  - Manages authentication for private repositories
  - Returns repository metadata (path, commit hash, etc.)

- **cloneRepository**: Clones a Git repository to a local directory
  - Uses simple-git for Git operations
  - Manages branch checkout
  - Handles authentication

- **downloadRepository**: Downloads a repository as a tarball
  - Uses axios for HTTP requests
  - Extracts archive contents
  - Handles rate limiting and authentication

- **setupLocalRepository**: Prepares a local directory for analysis
  - Validates directory existence
  - Collects repository metadata

#### b. Repository Scanner (`repo-scanner.ts`)

Traverses the repository directory and identifies relevant files:

- **scanDirectory**: Generator function that yields file paths
  - Recursively traverses directories
  - Filters files based on extension and content
  - Ignores common directories (node_modules, .git, etc.)

- **isTextFile**: Determines if a file contains text content
  - Checks file extension
  - Attempts to read file as text
  - Handles binary files gracefully

- **getFileContent**: Reads file content with proper encoding
  - Detects file encoding
  - Handles large files efficiently
  - Returns file content as string

#### c. Code Parser (`code-parser.ts`)

Parses code files using Tree-sitter to extract structural information:

- **initializeParser**: Sets up Tree-sitter parser
  - Loads language grammars
  - Initializes WASM module
  - Configures parser options

- **parseFile**: Parses a single file
  - Selects appropriate language grammar
  - Generates Abstract Syntax Tree (AST)
  - Applies language-specific queries
  - Returns parsed code elements

- **getLanguage**: Determines the programming language of a file
  - Uses file extension
  - Falls back to content analysis
  - Supports multiple languages

- **extractDefinitions**: Extracts code definitions
  - Identifies functions, classes, methods, etc.
  - Extracts name, line range, and other metadata
  - Returns structured definition objects

- **extractReferences**: Extracts code references
  - Identifies function calls, variable uses, etc.
  - Links references to definitions
  - Returns structured reference objects

#### d. graph-builder.ts (Graph Construction)
- **Purpose:** Builds an in-memory graph of the codebase from parsed data.
- **Responsibilities:**
  - Creates nodes for files, classes, functions, methods, variables, etc.
  - Adds relationships (CONTAINS, REFERENCES, CALLS, INHERITS, IMPORTS, etc.) with metadata.
  - Resolves cross-file references using symbol tables.
  - Computes graph-level statistics (node/edge counts, connected components, etc.).
- **Implementation Notes:**
  - Use `jsnetworkx` or a similar library for graph modeling.
  - Ensure unique node IDs (e.g., hash of file path + symbol name).
  - Support incremental graph updates for large repos.

#### e. neo4j-service.ts (Neo4j Database Operations)
- **Purpose:** Persists the in-memory graph to Neo4j and manages graph queries.
- **Responsibilities:**
  - Connects to Neo4j using the official driver (`neo4j-driver`).
  - Batch-creates nodes and relationships for performance.
  - Ensures indices exist for fast lookup (nodeId, repoId).
  - Supports cleanup (delete all nodes/edges for a repoId).
  - Provides Cypher query interface for advanced analytics.
- **Implementation Notes:**
  - Use transactions and batching for large graphs.
  - Handle reconnects and transient errors gracefully.
  - Support for custom Cypher queries and analytics.

#### f. queries/ (Tree-sitter Query Files)
- **Purpose:** Define language-specific patterns for extracting code structure from ASTs.
- **Responsibilities:**
  - `.scm` files for each supported language.
  - Patterns for functions, classes, methods, imports, variables, etc.
  - Easily extensible for new languages by adding new query files.
- **Implementation Notes:**
  - Use S-expression syntax as per Tree-sitter query language.
  - Document each pattern for maintainability.

### 2. knowledge_graph

#### a. inference-service.ts (AI-powered Inference)
- **Purpose:** Adds AI/LLM-powered features such as docstring generation and semantic code search.
- **Responsibilities:**
  - Generates docstrings for code elements using LLMs (e.g., GPT-4 API).
  - Manages batching and context for LLM calls.
  - Updates Neo4j nodes with generated docstrings.
  - Provides API for downstream modules to retrieve documentation.
- **Implementation Notes:**
  - Use OpenAI or similar API, with retries and rate limit handling.
  - Store docstrings in Neo4j as node properties.
  - Support for language-specific prompt templates.

#### b. embedding-service.ts (Vector Embedding Generation)
- **Purpose:** Generates vector representations of code/text for semantic search.
- **Responsibilities:**
  - Uses models like SentenceTransformer to create embeddings.
  - Stores embeddings in Neo4j for vector search.
  - Provides API for similarity search and retrieval.
- **Implementation Notes:**
  - Batch processing for performance.
  - Normalize and preprocess text for consistency.
  - Use Neo4j's vector search capabilities (or integrate with external vector DBs if needed).

### 3. types/index.ts (Type Definitions)
- **Purpose:** Centralizes all TypeScript types and interfaces for strong typing and maintainability.
- **Responsibilities:**
  - Defines node, edge, and metadata types.
  - Provides interfaces for service contracts.
  - Documents all data structures for contributors.

### 4. utils/utils.ts (Utility Functions)
- **Purpose:** Common utility functions used across modules.
- **Responsibilities:**
  - File system helpers, hash functions, error handling, logging, etc.
  - Reusable across the codebase.

### 5. index.ts (Main Entry Point & CLI)
- **Purpose:** Orchestrates the entire workflow and exposes a command-line interface.
- **Responsibilities:**
  - Parses CLI arguments (using Commander).
  - Initializes and coordinates all modules.
  - Handles error reporting and progress output.
  - Provides user feedback and usage examples.

---

## Data Model (Expanded)

### Neo4j Graph Structure

#### Node Labels & Properties
- `:NODE` (base label for all code entities)
- `:FILE`, `:CLASS`, `:FUNCTION`, `:METHOD`, `:VARIABLE`, `:INTERFACE`, `:MODULE`, `:IMPORT`
- Properties:
  - `nodeId`: Unique hash (e.g., MD5 of file path + symbol name)
  - `repoId`: Unique repo/project identifier
  - `name`: Symbol name
  - `filePath`: Source file path
  - `startLine`, `endLine`: Line range
  - `text`: Code text
  - `type`: Entity type (function, class, etc.)
  - `docstring`: AI-generated docstring (optional)
  - `embedding`: Vector embedding (optional)

#### Relationship Types & Properties
- `:CONTAINS` (file contains class/function)
- `:REFERENCES` (function calls another function)
- `:CALLS` (explicit function/method call)
- `:INHERITS` (class extends another class)
- `:IMPLEMENTS` (class implements interface)
- `:IMPORTS` (file imports module)
- Properties:
  - `repoId`: Repository identifier
  - `context`: Additional context (e.g., call site, import type)

#### Example Cypher Queries
- **Find all functions called by a given function:**
  ```cypher
  MATCH (f:FUNCTION {name: 'foo', repoId: $repoId})-[:CALLS]->(callee:FUNCTION) RETURN callee
  ```
- **Find all classes in a file:**
  ```cypher
  MATCH (file:FILE {filePath: $filePath, repoId: $repoId})-[:CONTAINS]->(c:CLASS) RETURN c
  ```
- **Find the call chain up to 3 levels deep:**
  ```cypher
  MATCH path = (f:FUNCTION {name: $name, repoId: $repoId})-[:CALLS*1..3]->(other:FUNCTION) RETURN path
  ```

---

## Implementation Plan (In-Depth)

### Phase 1: Core Infrastructure

1. **Project Setup**
   - Initialize TypeScript project
   - Configure build tools (tsc, eslint, prettier)
   - Set up dependency management
   - Create basic directory structure

2. **Repository Access**
   - Implement `repo-fetcher.ts`
   - Add support for Git repositories
   - Add support for local directories
   - Implement branch selection

3. **File Scanning**
   - Implement `repo-scanner.ts`
   - Add directory traversal
   - Implement file filtering
   - Add text file detection

### Phase 2: Code Parsing 

4. **Tree-sitter Integration**
   - Integrate web-tree-sitter, add language grammars.
   - Write queries for JavaScript, TypeScript, Python, Java, etc.
   - Implement AST parsing and query application.
   - Test with sample files for each language.

5. **Language Support**
   - Modularize language support (easy to add new grammars).
   - Implement fallback for unsupported languages.

6. **Code Element Extraction**
   - Implement extraction of definitions and references.
   - Build symbol tables for cross-file resolution.
   - Write unit tests for extraction logic.

### Phase 3: Graph Construction

7. **In-memory Graph**
   - Implement graph-builder with jsnetworkx.
   - Create node/edge creation APIs.
   - Support incremental updates for large repos.
   - Add graph statistics and validation.

8. **Neo4j Integration**
   - Implement neo4j-service for node/edge persistence.
   - Batch operations for performance.
   - Add index creation and cleanup APIs.
   - Write integration tests with a local Neo4j instance.

9. **Graph Analysis**
   - Implement PageRank and other graph algorithms.
   - Add code element ranking and traversal utilities.
   - Write analysis reports as part of output.

### Phase 4: Knowledge Enhancement 

11. **Embedding Support**
    - Integrate SentenceTransformer or similar for embeddings.
    - Store embeddings in Neo4j, enable vector search.
    - Write tests for semantic search.

### Phase 5: CLI and Finalization 

12. **Command-line Interface**
    - Implement CLI with Commander.
    - Add options for repo path, output, language, etc.
    - Add progress and error reporting.
    - Write CLI usage docs and examples.

13. **Testing and Documentation**
    - Write comprehensive unit and integration tests.
    - Document all modules, APIs, and usage patterns.
    - Provide example configs and sample outputs.

---

## Technical Considerations (Detailed)

### Performance Optimization

- **Batched Processing**: Process nodes and relationships in batches
- **Streaming**: Use generators for file traversal to minimize memory usage
- **Parallel Processing**: Implement concurrent file parsing where possible
- **Efficient Neo4j Operations**: Use optimized Cypher queries and batch operations
- **Memory Management**: Implement strategies to handle large repositories

### Security Considerations

- **Credential Management**: Securely handle Neo4j and Git credentials
- **Input Validation**: Validate all user inputs
- **File Access**: Handle file permissions properly
- **Error Handling**: Implement robust error handling

### Extensibility

- **Plugin Architecture**: Design for extensibility with language plugins
- **Configuration System**: Create flexible configuration options
- **API Design**: Design clean interfaces for component interaction
- **Modular Structure**: Maintain separation of concerns

## Dependencies

- **Core Dependencies**
  - `typescript`: Type system
  - `web-tree-sitter`: Code parsing
  - `jsnetworkx`: Graph processing
  - `neo4j-driver`: Neo4j integration
  - `simple-git`: Git operations
  - `commander`: CLI framework
  - `axios`: HTTP requests
  - `dotenv`: Environment configuration

- **Development Dependencies**
  - `eslint`: Code linting
  - `prettier`: Code formatting
  - `jest`: Testing framework
  - `ts-node`: TypeScript execution

## Milestones and Deliverables (Expanded)

### Milestone 1: Basic Repository Processing
- Fetch and scan repos (Git/local).
- Output: List of source files, repo metadata.

### Milestone 2: Code Parsing
- Parse code with Tree-sitter, extract code elements.
- Output: Parsed ASTs, extracted definitions/references.

### Milestone 3: Graph Construction
- Build in-memory graph, persist to Neo4j.
- Output: Nodes and relationships in Neo4j, Cypher queryable.

### Milestone 4: Knowledge Enhancement
- Generate docstrings and embeddings, enable semantic search.
- Output: Docstrings and embeddings stored in Neo4j, search API.

### Milestone 5: Complete CLI Tool
- Full CLI, documentation, and sample runs.
- Output: Usable npm package, docs, and example outputs.

---

## Example User Workflow

1. User installs the package and sets up .env with Neo4j credentials.
2. Runs CLI: `npx repo-mapper <repo-url-or-path> [options]`
3. Tool fetches and scans repo, parses code, builds graph, persists to Neo4j.
4. User can run Cypher queries or use provided APIs for code search/analysis.
5. (Optional) User enables AI-powered docstrings and embeddings for advanced features.

---

## Integration Points
- Can be used as a CLI tool or imported as a library in other Node.js projects.
- Supports integration with code search, documentation, and analytics platforms.
- Easily extensible for new languages, analysis features, or database backends.

---

## Next Steps
- Finalize requirements and confirm language/feature priorities.
- Set up project repository and initial codebase.
- Begin implementation following the phases above.
- Review and iterate on each milestone deliverable.

---

This detailed plan is designed to guide the implementation of a scalable, extensible, and robust repository mapping tool leveraging the best practices in code analysis, graph modeling, and modern TypeScript/Node.js development.
