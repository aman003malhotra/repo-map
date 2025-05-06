/**
 * Neo4j service module
 * Handles Neo4j database operations for storing and querying the code graph
 */
import neo4j, { Driver, Session, Result } from 'neo4j-driver';
import { Graph, Neo4jNodeData, Neo4jRelationshipData } from 'src/types/index.js';

/**
 * Neo4j service class
 */
export class Neo4jService {
  private driver: Driver | null = null;
  private uri: string;
  private username: string;
  private password: string;

  /**
   * Constructor
   */
  constructor() {
    // Load configuration from environment variables
    this.uri = process.env.NEO4J_URI || 'neo4j://localhost:7687';
    this.username = process.env.NEO4J_USER || 'neo4j';
    this.password = process.env.NEO4J_PASSWORD || 'password';
  }

  /**
   * Connect to Neo4j
   */
  async connect(): Promise<void> {
    try {
      console.log(`Neo4j Service configured for URI: ${this.uri}`);
      this.driver = neo4j.driver(
        this.uri,
        neo4j.auth.basic(this.username, this.password)
      );

      // Verify connection
      await this.driver.verifyConnectivity();
      console.log('Successfully connected to Neo4j.');
    } catch (error) {
      console.error('Failed to connect to Neo4j:', error);
      throw error;
    }
  }

  /**
   * Close the Neo4j connection
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      console.log('Neo4j connection closed.');
    }
  }

  /**
   * Ensure that the necessary index exists
   */
  async ensureIndex(): Promise<void> {
    if (!this.driver) {
      throw new Error('Not connected to Neo4j. Call connect() first.');
    }

    const session = this.driver.session();
    try {
      console.log('Ensuring Neo4j index exists on :NODE(nodeId, repoId)...');
      await session.run(`
        CREATE INDEX node_id_repo_idx IF NOT EXISTS
        FOR (n:NODE)
        ON (n.nodeId, n.repoId)
      `);
      console.log('Neo4j index check complete.');
    } catch (error) {
      console.error('Failed to create index:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Delete all nodes and relationships for a repository
   * @param repoId Repository ID
   */
  async deleteRepoData(repoId: string): Promise<void> {
    if (!this.driver) {
      throw new Error('Not connected to Neo4j. Call connect() first.');
    }

    const session = this.driver.session();
    try {
      console.log(`Deleting Neo4j data for repoId: ${repoId}`);
      await session.run(
        `MATCH (n {repoId: $repoId})
         DETACH DELETE n`,
        { repoId }
      );
      console.log(`Deleted Neo4j data for repoId: ${repoId}`);
    } catch (error) {
      console.error(`Failed to delete data for repoId ${repoId}:`, error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Store a graph in Neo4j
   * @param graph Graph instance
   * @param repoId Repository ID
   */
  async storeGraph(graph: Graph, repoId: string): Promise<void> {
    if (!this.driver) {
      throw new Error('Not connected to Neo4j. Call connect() first.');
    }

    const session = this.driver.session();
    try {
      // Get nodes and edges from the graph
      const nodes = graph.getNodes();
      const edges = graph.getEdges();

      console.log(`Storing ${nodes.length} nodes and ${edges.length} edges in Neo4j...`);

      // Store nodes in batches
      const batchSize = 1000;
      for (let i = 0; i < nodes.length; i += batchSize) {
        const batch = nodes.slice(i, i + batchSize);
        const nodeData = batch.map(node => ({
          nodeId: node.nodeId,
          repoId: node.repoId,
          properties: {
            name: node.name,
            filePath: node.filePath,
            startLine: node.startLine,
            endLine: node.endLine,
            text: node.text || '',
            type: node.type,
          },
          labels: ['NODE', node.type],
        }));

        await this.createNodes(nodeData);
        console.log(`Stored ${i + batch.length}/${nodes.length} nodes.`);
      }

      // Store edges in batches
      for (let i = 0; i < edges.length; i += batchSize) {
        const batch = edges.slice(i, i + batchSize);
        const edgeData = batch.map(edge => ({
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          type: edge.type,
          properties: {
            repoId: edge.repoId,
          },
        }));

        await this.createRelationships(edgeData);
        console.log(`Stored ${i + batch.length}/${edges.length} edges.`);
      }

      console.log('Graph stored successfully in Neo4j.');
    } catch (error) {
      console.error('Failed to store graph in Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Create nodes in Neo4j
   * @param nodes Array of node data
   */
  private async createNodes(nodes: Neo4jNodeData[]): Promise<void> {
    if (!this.driver) {
      throw new Error('Not connected to Neo4j. Call connect() first.');
    }

    if (nodes.length === 0) {
      return;
    }

    const session = this.driver.session();
    try {
      // Use UNWIND with MERGE to prevent duplicate nodes
      await session.run(
        `UNWIND $nodes AS node
         MERGE (n:NODE {nodeId: node.nodeId, repoId: node.repoId})
         SET n += node.properties
         WITH n, node
         CALL apoc.create.addLabels(id(n), node.labels) YIELD node AS n2
         RETURN count(*)`,
        { nodes }
      );
    } catch (error) {
      console.error('Failed to create nodes:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Create relationships in Neo4j
   * @param relationships Array of relationship data
   */
  private async createRelationships(relationships: Neo4jRelationshipData[]): Promise<void> {
    if (!this.driver) {
      throw new Error('Not connected to Neo4j. Call connect() first.');
    }

    if (relationships.length === 0) {
      return;
    }

    const session = this.driver.session();
    try {
      // Group relationships by type for efficient creation
      const relationshipsByType = new Map<string, Neo4jRelationshipData[]>();
      
      for (const rel of relationships) {
        if (!relationshipsByType.has(rel.type)) {
          relationshipsByType.set(rel.type, []);
        }
        relationshipsByType.get(rel.type)!.push(rel);
      }

      // Create relationships for each type
      for (const [type, rels] of relationshipsByType.entries()) {
        await session.run(
          `UNWIND $relationships AS rel
           MATCH (source:NODE {nodeId: rel.sourceId, repoId: rel.properties.repoId})
           MATCH (target:NODE {nodeId: rel.targetId, repoId: rel.properties.repoId})
           MERGE (source)-[r:${type}]->(target)
           SET r = rel.properties
           RETURN count(*)`,
          { relationships: rels }
        );
      }
    } catch (error) {
      console.error('Failed to create relationships:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Execute a Cypher query
   * @param query Cypher query
   * @param params Query parameters
   * @returns Query result
   */
  async query(query: string, params: Record<string, any> = {}): Promise<Result> {
    if (!this.driver) {
      throw new Error('Not connected to Neo4j. Call connect() first.');
    }

    const session = this.driver.session();
    try {
      return await session.run(query, params);
    } catch (error) {
      console.error('Failed to execute query:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Get a node by ID
   * @param nodeId Node ID
   * @param repoId Repository ID
   * @returns Node data or null if not found
   */
  async getNodeById(nodeId: string, repoId: string): Promise<Record<string, any> | null> {
    if (!this.driver) {
      throw new Error('Not connected to Neo4j. Call connect() first.');
    }

    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (n:NODE {nodeId: $nodeId, repoId: $repoId})
         RETURN n`,
        { nodeId, repoId }
      );

      if (result.records.length === 0) {
        return null;
      }

      return result.records[0].get('n').properties;
    } catch (error) {
      console.error('Failed to get node by ID:', error);
      throw error;
    } finally {
      await session.close();
    }
  }
}
