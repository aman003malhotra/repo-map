/**
 * Type definitions for the repo-map project
 */

/**
 * Repository information
 */
export interface RepoInfo {
  /** Repository ID (URL or local path) */
  repoId: string;
  /** Local path where the repository is stored */
  localPath: string;
  /** Remote repository URL */
  remoteUrl: string;
  /** Branch name */
  branch: string;
  /** Whether the repository is a Git repository */
  isGit: boolean;
  /** Commit SHA (for Git repositories) */
  commitSha?: string;
}

/**
 * Code element tag
 */
export interface Tag {
  /** Name of the code element */
  name: string;
  /** Type of the code element (class, function, method, etc.) */
  type: string;
  /** Kind of tag (definition or reference) */
  kind: 'def' | 'ref';
  /** File path where the tag is located */
  filePath: string;
  /** Target file for references */
  targetFile?: string;
  /** Starting line number */
  startLine: number;
  /** Ending line number */
  endLine: number;
  /** Source code text */
  text?: string;
  /** Parent element (for nested elements) */
  parent?: {
    name: any;
    type: string;
    location: {
      filePath: string;
      startLine: number;
    };
  };
}

/**
 * Graph node data
 */
export interface GraphNodeData {
  /** Node ID */
  nodeId: string;
  /** Repository ID */
  repoId: string;
  /** Node name */
  name: string;
  /** Node type */
  type: string;
  /** File path */
  filePath: string;
  /** Starting line number */
  startLine: number;
  /** Ending line number */
  endLine: number;
  /** Source code text */
  text?: string;
  /** Whether the node represents a directory */
  isDirectory?: boolean;
  /** File size in bytes (for files) */
  size?: number;
  /** Creation timestamp */
  createdAt?: string;
  /** Last modification timestamp */
  modifiedAt?: string;
  /** Whether the node represents a reference (as opposed to a definition) */
  isReference?: boolean;
}

/**
 * Graph edge data
 */
export interface GraphEdgeData {
  /** Source node ID */
  sourceId: string;
  /** Target node ID */
  targetId: string;
  /** Relationship type */
  type: string;
  /** Repository ID */
  repoId: string;
}

/**
 * Neo4j node data
 */
export interface Neo4jNodeData {
  /** Node ID */
  nodeId: string;
  /** Repository ID */
  repoId: string;
  /** Node properties */
  properties: Record<string, any>;
  /** Node labels */
  labels: string[];
}

/**
 * Neo4j relationship data
 */
export interface Neo4jRelationshipData {
  /** Source node ID */
  sourceId: string;
  /** Target node ID */
  targetId: string;
  /** Relationship type */
  type: string;
  /** Relationship properties */
  properties: Record<string, any>;
}

/**
 * Graph interface
 */
export interface Graph {
  /** Add a node to the graph */
  addNode(nodeId: string, data: GraphNodeData): void;
  /** Add an edge to the graph */
  addEdge(sourceId: string, targetId: string, data: GraphEdgeData): void;
  /** Get all nodes in the graph */
  getNodes(): GraphNodeData[];
  /** Get all edges in the graph */
  getEdges(): GraphEdgeData[];
  /** Get the number of nodes in the graph */
  numberOfNodes(): number;
  /** Get the number of edges in the graph */
  numberOfEdges(): number;
}
