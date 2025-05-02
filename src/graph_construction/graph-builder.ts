/**
 * Graph builder module
 * Constructs an in-memory graph representation of the code structure
 */
import * as path from 'path';
import { MultiDiGraph } from 'jsnetworkx';
import { parseFile } from './code-parser.js';
import { RepoInfo, Tag, Graph, GraphNodeData, GraphEdgeData} from 'src/types/index.js';
import { generateNodeId } from '../utils/utils.js';
import { Neo4jService } from './neo4j-service.js';

/**
 * Implementation of the Graph interface using jsnetworkx
 */
class CodeGraph implements Graph {
  private graph: MultiDiGraph;

  constructor() {
    this.graph = new MultiDiGraph();
  }

  /**
   * Add a node to the graph
   * @param nodeId Node ID
   * @param data Node data
   */
  addNode(nodeId: string, data: GraphNodeData): void {
    this.graph.addNode(nodeId, { data });
  }

  /**
   * Add an edge to the graph
   * @param sourceId Source node ID
   * @param targetId Target node ID
   * @param data Edge data
   */
  addEdge(sourceId: string, targetId: string, data: GraphEdgeData): void {
    this.graph.addEdge(sourceId, targetId, { data });
  }

  /**
   * Get all nodes in the graph
   * @returns Array of node data
   */
  getNodes(): GraphNodeData[] {
    return Array.from(this.graph.nodes()).map(nodeId => {
      return this.graph.get(nodeId).data;
    });
  }

  /**
   * Get all edges in the graph
   * @returns Array of edge data
   */
  getEdges(): GraphEdgeData[] {
    const edges: GraphEdgeData[] = [];
    
    for (const [sourceId, targetId, key] of this.graph.edges(true)) {
      edges.push(this.graph.get(sourceId, targetId, key).data);
    }
    
    return edges;
  }

  /**
   * Get the number of nodes in the graph
   * @returns Number of nodes
   */
  numberOfNodes(): number {
    return this.graph.numberOfNodes();
  }

  /**
   * Get the number of edges in the graph
   * @returns Number of edges
   */
  numberOfEdges(): number {
    return this.graph.numberOfEdges();
  }

  /**
   * Calculate PageRank for nodes in the graph
   * @param alpha Damping factor (default: 0.85)
   * @returns Map of node IDs to PageRank scores
   */
  calculatePageRank(alpha: number = 0.85): Map<string, number> {
    const pagerank = new Map<string, number>();
    
    // In a real implementation, we would use jsnetworkx's pagerank algorithm
    // For now, we'll just return an empty map
    
    return pagerank;
  }
}

/**
 * Build a graph representation of the code structure
 * @param files Array of file paths
 * @param repoInfo Repository information
 * @param neo4jService Neo4j service instance (optional)
 * @returns Graph instance
 */
export async function buildGraph(
  files: string[],
  repoInfo: RepoInfo,
  neo4jService?: Neo4jService
): Promise<Graph> {
  const graph = new CodeGraph();
  
  // Maps to track definitions and references
  const definitions = new Map<string, Tag>();
  const references: Tag[] = [];
  
  // Process each file
  for (const filePath of files) {
    try {
      // Create a file node
      const fileNodeId = generateNodeId(repoInfo.repoId, filePath);
      const relativePath = path.relative(repoInfo.localPath, filePath);
      
      graph.addNode(fileNodeId, {
        nodeId: fileNodeId,
        repoId: repoInfo.repoId,
        name: path.basename(filePath),
        type: 'FILE',
        filePath: relativePath,
        startLine: 0,
        endLine: 0,
      });
      
      // Parse the file
      const tags = await parseFile(filePath, repoInfo.localPath);
      
      // Process definitions
      for (const tag of tags) {
        if (tag.kind === 'def') {
          // Create a node for the definition
          const nodeId = generateNodeId(repoInfo.repoId, `${filePath}:${tag.name}:${tag.startLine}`);
          
          graph.addNode(nodeId, {
            nodeId,
            repoId: repoInfo.repoId,
            name: tag.name,
            type: tag.type,
            filePath: relativePath,
            startLine: tag.startLine,
            endLine: tag.endLine,
            text: tag.text,
          });
          
          // Create a CONTAINS relationship from file to definition
          graph.addEdge(fileNodeId, nodeId, {
            sourceId: fileNodeId,
            targetId: nodeId,
            type: 'CONTAINS',
            repoId: repoInfo.repoId,
          });
          
          // Store the definition for later reference resolution
          definitions.set(`${tag.name}:${tag.type}`, tag);
        } else if (tag.kind === 'ref') {
          // Store references for later processing
          references.push(tag);
        }
      }
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }
  
  // Process references
  for (const ref of references) {
    try {
      // Find the corresponding definition
      const def = definitions.get(`${ref.name}:${ref.type}`);
      
      if (def) {
        // Create a REFERENCES relationship
        const sourceId = generateNodeId(repoInfo.repoId, `${ref.filePath}:${ref.name}:${ref.startLine}`);
        const targetId = generateNodeId(repoInfo.repoId, `${def.filePath}:${def.name}:${def.startLine}`);
        
        graph.addEdge(sourceId, targetId, {
          sourceId,
          targetId,
          type: 'REFERENCES',
          repoId: repoInfo.repoId,
        });
      }
    } catch (error) {
      console.error(`Error processing reference ${ref.name}:`, error);
    }
  }
  
  return graph;
}
