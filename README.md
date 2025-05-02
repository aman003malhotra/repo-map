# Repo Map

A TypeScript tool to parse code repositories and generate a graph-based map in Neo4j.

## Features

- Parse local and remote Git repositories
- Extract code structure using Tree-sitter
- Build a graph representation of code elements and their relationships
- Store the graph in Neo4j for querying and analysis
- Generate vector embeddings for semantic code search

## Installation

```bash
npm install repo-map
```

## Usage

```bash
# Analyze a GitHub repository
npx repo-map https://github.com/username/repo

# Analyze a local directory
npx repo-map /path/to/local/repo

# Specify output directory
npx repo-map /path/to/repo -o ./output

# Specify branch (for Git repositories)
npx repo-map https://github.com/username/repo -b main
```

## Requirements

- Node.js 14+
- Neo4j database (local or remote)

## Configuration

Create a `.env` file with your Neo4j credentials:

```
NEO4J_URI=neo4j+s://your-neo4j-instance
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev

# Lint the code
npm run lint

# Format the code
npm run format
```

## License

MIT