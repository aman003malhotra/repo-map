#!/usr/bin/env node
/**
 * Main entry point for the Repo Map CLI
 */
import * as dotenv from 'dotenv';
import { Command } from 'commander';
import { fetchRepository } from './graph_construction/repo-fetcher.js';
import { scanDirectory } from './graph_construction/repo-scanner.js';
import { buildGraph } from './graph_construction/graph-builder.js';
import { Neo4jService } from './graph_construction/neo4j-service.js';
import { generateEmbeddings } from './knowledge_graph/embedding-service.js';

// Load environment variables from .env file
dotenv.config();

/**
 * Main function to create a repository map
 */
async function createRepoMap(
  repoUrl: string, 
  outputDir: string, 
  branch?: string, 
  clearExistingData: boolean = false
): Promise<void> {
  console.log(`Starting repository map generation for: ${repoUrl}`);
  const repoId = repoUrl; // Use the repoUrl as the unique identifier for this repo in Neo4j
  let neo4jService: Neo4jService | null = null;

  try {
    // Initialize Neo4j Service
    console.log("Initializing Neo4j service...");
    neo4jService = new Neo4jService();
    await neo4jService.connect();
    await neo4jService.ensureIndex();

    // Optional: Clear existing data for this repoId
    if (clearExistingData) {
      console.warn(`Clearing existing Neo4j data for repoId: ${repoId}`);
      await neo4jService.deleteRepoData(repoId);
      console.log("Existing data cleared.");
    }

    // Fetch Repository Code
    const repoInfo = await fetchRepository(repoUrl, outputDir, branch);
    console.log(`Repository available at: ${repoInfo.localPath}`);

    // Scan repository for files
    console.log("Scanning repository for files...");
    const files: string[] = [];
    for await (const filePath of scanDirectory(repoInfo.localPath)) {
      files.push(filePath);
    }
    console.log(`Found ${files.length} files to analyze.`);

    // Build Graph
    console.log("Building code graph...");
    const graph = await buildGraph(files, repoInfo, neo4jService);
    console.log(`Graph built with ${graph.numberOfNodes()} nodes and ${graph.numberOfEdges()} edges.`);

    // Store Graph in Neo4j
    console.log("Storing graph in Neo4j...");
    await neo4jService.storeGraph(graph, repoId);
    console.log("Graph stored successfully.");

    // Generate Embeddings (optional)
    console.log("Generating embeddings for semantic search...");
    await generateEmbeddings(neo4jService, repoId);
    console.log("Embeddings generated successfully.");

    console.log("Repository map generation completed successfully.");
  } catch (error) {
    console.error("Error creating repository map:", error);
    throw error;
  } finally {
    // Close Neo4j Connection
    if (neo4jService) {
      await neo4jService.close();
    }
  }
}

// Command Line Interface Setup
const program = new Command();

program
  .name('repo-map')
  .description('Analyzes a code repository, generates a structural map, and stores it in Neo4j.')

program
  .argument('<repoUrl>', 'URL or local path of the repository')
  .option('-o, --output <dir>', 'Output directory for clone/download', './repo_map_output')
  .option('-b, --branch <branch>', 'Specific branch to checkout')
  .option('--clear', 'Clear existing data for this repository in Neo4j before processing', false)
  .action((repoUrl, options) => {
    createRepoMap(repoUrl, options.output, options.branch, options.clear)
      .catch(err => {
        console.error(err);
        process.exitCode = 1;
      });
  });

program.parse(process.argv);

// Export the main function if you want to use it as a library
export { createRepoMap };
