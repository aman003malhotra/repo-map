/**
 * Graph builder module
 * Constructs a graph representation of the code structure
 * and stores it in Neo4j database
 */
import * as path from 'path';
import * as fs from 'fs';
import { parseFile } from './code-parser.js';
import { RepoInfo, Tag, GraphNodeData, GraphEdgeData, Graph } from 'src/types/index.js';
import { generateNodeId } from '../utils/utils.js';
import { Neo4jService } from './neo4j-service.js';

// Helper function to check if an edge already exists
function edgeExists(edges: GraphEdgeData[], sourceId: string, targetId: string, type: string, repoId: string): boolean {
  return edges.some(edge => 
    edge.sourceId === sourceId && 
    edge.targetId === targetId && 
    edge.type === type &&
    (edge.repoId === repoId || edge.repoId === undefined)
  );
}

// Helper function to safely add an edge if it doesn't exist
function addUniqueEdge(edges: GraphEdgeData[], sourceId: string, targetId: string, type: string, repoId: string): boolean {
  // First check if we already have this exact edge
  const exactMatch = edges.some(edge => 
    edge.sourceId === sourceId && 
    edge.targetId === targetId && 
    edge.type === type &&
    edge.repoId === repoId
  );
  
  if (exactMatch) {
    return false;
  }

  // For CONTAINS relationships, also check if the reverse relationship exists
  // This prevents duplicate containment relationships in either direction
  if (type === 'CONTAINS') {
    const reverseExists = edges.some(edge =>
      edge.sourceId === targetId &&
      edge.targetId === sourceId &&
      edge.type === type &&
      edge.repoId === repoId
    );
    
    if (reverseExists) {
      return false;
    }
  }

  // If we get here, it's safe to add the edge
  edges.push({
    sourceId,
    targetId,
    type,
    repoId,
  });
  return true;
}

// Helper function to get all parent directories of a path
function getParentDirs(filePath: string, repoPath: string): string[] {
  const relativePath = path.relative(repoPath, filePath);
  const dirs: string[] = [];
  let current = path.dirname(relativePath);
  
  while (current !== '.') {
    dirs.unshift(current);
    current = path.dirname(current);
  }
  
  // Add root directory
  dirs.unshift('.');
  return dirs;
}

// Create or get a folder node
function ensureFolderNode(
  graph: GraphData,
  repoId: string,
  folderPath: string,
  repoPath: string
): string {
  // Skip if this is the root folder (handled by repository node)
  if (folderPath === '.') {
    return generateNodeId(repoId, 'repo:root');
  }

  const nodeId = generateNodeId(repoId, `folder:${folderPath}`);
  
  // If folder node already exists, return its ID
  if (graph.nodes.has(nodeId)) {
    return nodeId;
  }
  
  // Create folder node
  const folderName = path.basename(folderPath);
  const folderNode: GraphNodeData = {
    nodeId,
    repoId,
    name: folderName,
    type: 'FOLDER',
    filePath: folderPath,
    startLine: 0,
    endLine: 0,
    isDirectory: true,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  };
  graph.nodes.set(nodeId, folderNode);
  
  // Ensure parent folder exists and connect to it
  const parentPath = path.dirname(folderPath);
  const parentId = ensureFolderNode(graph, repoId, parentPath === '.' ? '.' : parentPath, repoPath);
  
  // Connect parent folder to this folder
  addUniqueEdge(graph.edges, parentId, nodeId, 'CONTAINS', repoId);
  
  if (!graph.nodes.has(nodeId)) {
    const fullPath = path.join(repoPath, folderPath);
    const stats = fs.statSync(fullPath);
    
    graph.nodes.set(nodeId, {
      nodeId,
      repoId,
      name: path.basename(folderPath) || path.basename(repoPath),
      type: 'FOLDER',
      filePath: folderPath,
      startLine: 0,
      endLine: 0,
      isDirectory: true,
      createdAt: stats.birthtime.toISOString(),
      modifiedAt: stats.mtime.toISOString()
    });
  }
  
  return nodeId;
}

// Simple in-memory storage for graph data during build
interface GraphData {
  nodes: Map<string, GraphNodeData>;
  edges: GraphEdgeData[];
}

/**
 * Implementation of the Graph interface for Neo4j storage
 * This is a read-only implementation that wraps the in-memory graph data
 * for storage in Neo4j.
 */
class Neo4jGraph implements Graph {
  constructor(
    private nodes: Map<string, GraphNodeData>,
    private edges: GraphEdgeData[]
  ) {}

  /**
   * Get all nodes in the graph
   * @returns Array of node data
   */
  getNodes(): GraphNodeData[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all edges in the graph
   * @returns Array of edge data
   */
  getEdges(): GraphEdgeData[] {
    return [...this.edges];
  }

  /**
   * Get the number of nodes in the graph
   * @returns Number of nodes
   */
  numberOfNodes(): number {
    return this.nodes.size;
  }

  /**
   * Get the number of edges in the graph
   * @returns Number of edges
   */
  numberOfEdges(): number {
    return this.edges.length;
  }

  /**
   * Add a node to the graph
   * @param nodeId Node ID
   * @param data Node data
   * @throws Error as this is a read-only implementation
   */
  addNode(nodeId: string, data: GraphNodeData): void {
    throw new Error('Cannot add nodes to Neo4jGraph - it is read-only');
  }

  /**
   * Add an edge to the graph
   * @param sourceId Source node ID
   * @param targetId Target node ID
   * @param data Edge data
   * @throws Error as this is a read-only implementation
   */
  addEdge(sourceId: string, targetId: string, data: GraphEdgeData): void {
    throw new Error('Cannot add edges to Neo4jGraph - it is read-only');
  }
}

/**
 * Build a graph representation of the code structure and store it in Neo4j
 * @param files Array of file paths
 * @param repoInfo Repository information
 * @param neo4jService Neo4j service instance (required)
 * @returns Promise that resolves with the built graph
 * @throws Error if there's an error building the graph or storing it in Neo4j
 */
export async function buildGraph(
  files: string[],
  repoInfo: RepoInfo,
  neo4jService: Neo4jService
): Promise<Neo4jGraph> {
  if (!neo4jService) {
    throw new Error('Neo4jService is required');
  }

  console.log(`\n🏗️  Building graph for ${files.length} files...`);
  
  const graph: GraphData = {
    nodes: new Map(),
    edges: [],
  };

  // Track progress
  let processedFiles = 0;
  const updateInterval = Math.max(1, Math.floor(files.length / 10)); // Update every 10% or every file if < 10 files
  const startTime = Date.now();

  // Add repository root node if it doesn't exist
  const rootNodeId = generateNodeId(repoInfo.repoId, 'repo:root');
  if (!graph.nodes.has(rootNodeId)) {
    graph.nodes.set(rootNodeId, {
      nodeId: rootNodeId,
      repoId: repoInfo.repoId,
      name: path.basename(repoInfo.localPath),
      type: 'REPOSITORY',
      filePath: '.',
      startLine: 0,
      endLine: 0,
      isDirectory: true,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    });
  }

  // Maps to track definitions and references
  const definitions = new Map<string, Tag>();
  const references: Tag[] = [];

  // Process the repository directory recursively
  await processDirectory(repoInfo.localPath, repoInfo.localPath, graph, repoInfo, rootNodeId, definitions, references);

  // Process individual files that might not have been processed by directory traversal
  for (const filePath of files) {
    // Skip if already processed by directory traversal
    const relativePath = path.relative(repoInfo.localPath, filePath);
    const fileNodeId = generateNodeId(repoInfo.repoId, `file:${relativePath}`);
    
    // Skip if already processed
    if (graph.nodes.has(fileNodeId)) {
      continue;
    }
    
    // Skip empty files
    try {
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        console.log(`   ⚠️  Skipping empty file: ${relativePath}`);
        continue;
      }
    } catch (error) {
      console.error(`   ❌ Error accessing file ${relativePath}:`, error);
      continue;
    }
    
    processedFiles++;
    const fileStartTime = Date.now();
    console.log(`\n📄 [${processedFiles}/${files.length}] Processing: ${relativePath}`);
    
    // Show overall progress
    const progress = ((processedFiles / files.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (processedFiles / ((Date.now() - startTime) / 1000)).toFixed(1);
    console.log(`📊 Progress: ${progress}% | Files: ${processedFiles}/${files.length} | Elapsed: ${elapsed}s | Rate: ${rate} files/s`);
    
    // Get the directory path and ensure folder structure exists
    const dirPath = path.dirname(relativePath);
    const parentNodeId = ensureFolderNode(graph, repoInfo.repoId, dirPath, repoInfo.localPath);
    
    // Create a file node
    const fileNode: GraphNodeData = {
      nodeId: fileNodeId,
      repoId: repoInfo.repoId,
      name: path.basename(filePath),
      type: 'FILE',
      filePath: relativePath,
      startLine: 0,
      endLine: 0,
      isDirectory: false,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString()
    };
    
    // Add file node to graph
    graph.nodes.set(fileNodeId, fileNode);
    console.log(`   ➕ Added file node: ${path.basename(filePath)}`);
    
    // Track added relationships
    let relationshipsAdded = 0;

    // Connect the file to its immediate parent directory
    if (addUniqueEdge(graph.edges, parentNodeId, fileNodeId, 'CONTAINS', repoInfo.repoId)) {
      relationshipsAdded++;
    }

    // Parse the file and get its AST and symbols
    console.log('   🔍 Parsing file...');
    const parseStartTime = Date.now();
    const tags = await parseFile(filePath, repoInfo.localPath);
    const parseTime = ((Date.now() - parseStartTime) / 1000).toFixed(2);
    
    // Count definitions and references
    const defs = tags.filter(t => t.kind === 'def');
    const refs = tags.filter(t => t.kind === 'ref');
    
    console.log(`   ✅ Parsed in ${parseTime}s | Found ${defs.length} definitions, ${refs.length} references`);

    // Process each tag in the file
    if (tags.length > 0) {
      console.log(`   🔗 Processing ${tags.length} symbols...`);
    }

    for (const tag of tags) {
      if (tag.kind === 'def') {
        // Create a node for the definition
        const nodeId = generateNodeId(repoInfo.repoId, `${filePath}:${tag.name}:${tag.startLine}`);
        
        // Add definition node to graph
        graph.nodes.set(nodeId, {
          nodeId,
          repoId: repoInfo.repoId,
          name: tag.name,
          type: tag.type,
          filePath: relativePath,
          startLine: tag.startLine,
          endLine: tag.endLine,
          text: tag.text,
        });
        
        // Add CONTAINS relationship from file to definition if it doesn't exist
        const edgeKey = `${fileNodeId}-${nodeId}-CONTAINS`;
        if (!edgeExists(graph.edges, fileNodeId, nodeId, 'CONTAINS', repoInfo.repoId)) {
          graph.edges.push({
            sourceId: fileNodeId,
            targetId: nodeId,
            type: 'CONTAINS',
            repoId: repoInfo.repoId,
          });
          relationshipsAdded++;
        } else {
          console.log(`   ⚠️  Skipping duplicate edge: ${fileNodeId} -> ${nodeId} (CONTAINS)`);
        }
        
        // Store the definition for later reference resolution
        definitions.set(`${tag.name}:${tag.type}`, tag);
      } else if (tag.kind === 'ref') {
        // Store references for later processing
        references.push(tag);
      }
    }
    // Log file processing completion
    const fileProcessTime = ((Date.now() - fileStartTime) / 1000).toFixed(2);
    console.log(`   ✔️  Processed in ${fileProcessTime}s | Added ${relationshipsAdded} relationships`);
    console.log('   ' + '─'.repeat(50));
  }
  
/**
 * Recursively processes a directory and its contents
 */
async function processDirectory(
  dirPath: string,
  repoPath: string,
  graph: GraphData,
  repoInfo: RepoInfo,
  parentNodeId: string,
  definitions: Map<string, Tag>,
  references: Tag[]
): Promise<void> {
  try {
    const dirName = path.basename(dirPath);
    const relativePath = path.relative(repoPath, dirPath) || '.';
    const dirNodeId = generateNodeId(repoInfo.repoId, `folder:${relativePath}`);
    
    // Create directory node if it doesn't exist
    if (!graph.nodes.has(dirNodeId)) {
      const stats = fs.statSync(dirPath);
      const dirNode: GraphNodeData = {
        nodeId: dirNodeId,
        repoId: repoInfo.repoId,
        name: relativePath === '.' ? path.basename(repoPath) : dirName,
        type: relativePath === '.' ? 'REPOSITORY' : 'FOLDER',
        filePath: relativePath,
        startLine: 0,
        endLine: 0,
        isDirectory: true,
        createdAt: stats.ctime.toISOString(),
        modifiedAt: stats.mtime.toISOString(),
      };
      graph.nodes.set(dirNodeId, dirNode);

      // Connect to parent if not root and not already connected
      if (relativePath !== '.' && parentNodeId !== dirNodeId) {
        if (!edgeExists(graph.edges, parentNodeId, dirNodeId, 'CONTAINS', repoInfo.repoId)) {
          graph.edges.push({
            sourceId: parentNodeId,
            targetId: dirNodeId,
            type: 'CONTAINS',
            repoId: repoInfo.repoId,
          });
        }
      }
    }

    // Process directory contents
    const entries = fs.readdirSync(dirPath);
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        // Skip node_modules and other hidden directories
        if (entry.startsWith('.') || entry === 'node_modules') {
          continue;
        }
        await processDirectory(fullPath, repoPath, graph, repoInfo, dirNodeId, definitions, references);
      } else if (stats.isFile()) {
        const ext = path.extname(entry).toLowerCase();
        // Only process source files
        if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
          await processFile(fullPath, repoPath, graph, repoInfo, dirNodeId, definitions, references);
        }
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dirPath}:`, error);
  }
}

/**
 * Processes a single file and adds its contents to the graph
 */
async function processFile(
  filePath: string,
  repoPath: string,
  graph: GraphData,
  repoInfo: RepoInfo,
  parentNodeId: string,
  definitions: Map<string, Tag>,
  references: Tag[]
): Promise<void> {
  const relativePath = path.relative(repoPath, filePath);
  const fileName = path.basename(filePath);
  const fileNodeId = generateNodeId(repoInfo.repoId, `file:${relativePath}`);
  
  // Create file node if it doesn't exist
  if (!graph.nodes.has(fileNodeId)) {
    const stats = fs.statSync(filePath);
    const fileNode: GraphNodeData = {
      nodeId: fileNodeId,
      repoId: repoInfo.repoId,
      name: fileName,
      type: 'FILE',
      filePath: relativePath,
      startLine: 0,
      endLine: 0,
      isDirectory: false,
      createdAt: stats.ctime.toISOString(),
      modifiedAt: stats.mtime.toISOString(),
    };
    graph.nodes.set(fileNodeId, fileNode);

    // Connect to parent folder
    addUniqueEdge(graph.edges, parentNodeId, fileNodeId, 'CONTAINS', repoInfo.repoId);
  }

  // Process file contents
  try {
    const tags = await parseFile(filePath, repoPath);
    
    for (const tag of tags) {
      if (tag.kind === 'def') {
        const nodeId = generateNodeId(repoInfo.repoId, `${filePath}:${tag.name}:${tag.startLine}`);
        
        // Add definition node to graph
        graph.nodes.set(nodeId, {
          nodeId,
          repoId: repoInfo.repoId,
          name: tag.name,
          type: tag.type,
          filePath: relativePath,
          startLine: tag.startLine,
          endLine: tag.endLine,
          text: tag.text,
        });
        
        // Connect file to definition
        if (!edgeExists(graph.edges, fileNodeId, nodeId, 'CONTAINS', repoInfo.repoId)) {
          graph.edges.push({
            sourceId: fileNodeId,
            targetId: nodeId,
            type: 'CONTAINS',
            repoId: repoInfo.repoId,
          });
        }
        
        // Store definition for reference resolution
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

  // Process references to connect them with their definitions
  const resolvedRefs = new Set<string>();
  let resolvedCount = 0;
  let missingDefinitions = 0;
  let missingNodes = 0;

  for (const ref of references) {
    try {
      // Find the corresponding definition
      const defKey = `${ref.name}:${ref.type}`;
      const def = definitions.get(defKey);
      
      if (!def) {
        missingDefinitions++;
        continue;
      }
      
      // Generate consistent IDs for reference and definition
      const refNodeId = generateNodeId(repoInfo.repoId, `ref:${ref.filePath}:${ref.name}:${ref.startLine}`);
      const defNodeId = generateNodeId(repoInfo.repoId, `def:${def.filePath}:${def.name}:${def.startLine}`);
      
      // Skip if reference or definition nodes don't exist
      if (!graph.nodes.has(refNodeId)) {
        // Create reference node if it doesn't exist
        const refNode: GraphNodeData = {
          nodeId: refNodeId,
          repoId: repoInfo.repoId,
          name: ref.name,
          type: ref.type,
          filePath: ref.filePath,
          startLine: ref.startLine,
          endLine: ref.endLine,
          text: ref.text,
          isReference: true,
        };
        graph.nodes.set(refNodeId, refNode);
        
        // Connect reference to its containing file
        const refFileNodeId = generateNodeId(repoInfo.repoId, `file:${ref.filePath}`);
        if (graph.nodes.has(refFileNodeId)) {
          addUniqueEdge(graph.edges, refFileNodeId, refNodeId, 'CONTAINS', repoInfo.repoId);
        } else {
          missingNodes++;
          continue;
        }
      }
      
      // Skip if definition node doesn't exist
      if (!graph.nodes.has(defNodeId)) {
        missingNodes++;
        continue;
      }
      
      // Add reference relationship if it doesn't exist
      const refKey = `${refNodeId}-${defNodeId}-REFERENCES`;
      if (!resolvedRefs.has(refKey)) {
        if (addUniqueEdge(graph.edges, refNodeId, defNodeId, 'REFERENCES', repoInfo.repoId)) {
          resolvedCount++;
          resolvedRefs.add(refKey);
        }
      }
    } catch (error) {
      console.error(`❌ Error processing reference ${ref.name}:`, error);
    }
  }
  
  // Log reference resolution summary
  if (missingDefinitions > 0) {
    console.log(`   ⚠️  ${missingDefinitions} references had no matching definitions`);
  }
  if (missingNodes > 0) {
    console.log(`   ⚠️  ${missingNodes} references couldn't be connected (missing nodes)`);
  }
  console.log(`   ✅ Resolved ${resolvedCount} references to ${definitions.size} definitions`);

  // Print final progress
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Graph built in ${totalTime}s`);
  console.log(`   - Nodes: ${graph.nodes.size}`);
  console.log(`   - Edges: ${graph.edges.length}`);

  // Create a read-only graph for storage
  const neo4jGraph = new Neo4jGraph(graph.nodes, graph.edges);
  
  // Store in Neo4j if service is available
  if (neo4jService) {
    console.log('💾 Storing graph in Neo4j...');
    console.log(`Storing ${graph.nodes.size} nodes and ${graph.edges.length} edges in Neo4j...`);
    await neo4jService.storeGraph(neo4jGraph, repoInfo.repoId);
    console.log('Successfully stored graph in Neo4j');
    return neo4jGraph;
  } else {
    throw new Error('Neo4jService is required');
  }
}

