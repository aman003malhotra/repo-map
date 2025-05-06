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
import * as fs from 'fs/promises';
import * as path from 'path';
import type { RepoInfo as BaseRepoInfo } from './types/index.js';

// Load environment variables from .env file
dotenv.config();

interface RepoInfo extends BaseRepoInfo {
  remoteUrl: string;
  branch: string;
}

/**
 * Check if a string is a GitHub repository URL
 */
function isGitHubUrl(url: string): boolean {
  return /^(https?:\/\/)?(www\.)?github\.com\/[^/\s]+\/[^/\s]+(\/[^/\s]*)*$/.test(url);
}

/**
 * Get repository information from a local path
 */
async function getLocalRepoInfo(localPath: string): Promise<RepoInfo> {
  const absolutePath = path.resolve(localPath);
  
  // Check if path exists and is a directory
  try {
    const stats = await fs.stat(absolutePath);
    if (!stats.isDirectory()) {
      throw new Error(`Path ${absolutePath} is not a directory`);
    }
  } catch (error) {
    throw new Error(`Error accessing directory ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    repoId: absolutePath, // Use absolute path as ID for local repos
    localPath: absolutePath,
    isGit: false,
    remoteUrl: '',
    branch: 'main'
  };
}

/**
 * Main function to create a repository map
 * @param source Either a GitHub repository URL or a local directory path
 * @param outputDir Directory to store the repository (for GitHub) or output files
 * @param options Additional options
 */
async function createRepoMap(
  source: string,
  outputDir: string,
  options: {
    branch?: string;
    clearExistingData?: boolean;
    neo4jService?: Neo4jService;
  } = {}
): Promise<void> {
  const { branch, clearExistingData = false, neo4jService: existingNeo4jService } = options;
  
  console.log(`Starting repository map generation for: ${source}`);
  
  let neo4jService: Neo4jService | null = existingNeo4jService || null;
  let repoInfo: RepoInfo;
  let files: string[] = [];

  try {
    // Initialize Neo4j Service if not provided
    if (!neo4jService) {
      console.log("Initializing Neo4j service...");
      neo4jService = new Neo4jService();
      await neo4jService.connect();
      await neo4jService.ensureIndex();
    }

    // Clear existing data if requested
    if (clearExistingData && neo4jService) {
      const repoId = isGitHubUrl(source) ? source : path.resolve(source);
      console.warn(`Clearing existing Neo4j data for repoId: ${repoId}`);
      await neo4jService.deleteRepoData(repoId);
      console.log("Existing data cleared.");
    }

    // Handle GitHub URL or local path
    if (isGitHubUrl(source)) {
      // Fetch GitHub repository
      console.log("Detected GitHub repository URL");
      const fetchedRepoInfo = await fetchRepository(source, outputDir, branch);
      repoInfo = {
        ...fetchedRepoInfo,
        remoteUrl: source,
        branch: branch || 'main',
        isGit: true
      };
    } else {
      // Use local directory
      console.log("Detected local directory path");
      const localRepoInfo = await getLocalRepoInfo(source);
      repoInfo = {
        ...localRepoInfo,
        remoteUrl: `file://${localRepoInfo.localPath}`,
        branch: branch || 'main',
        isGit: false
      };
    }

    console.log(`Processing repository at: ${repoInfo.localPath}`);

    // Scan repository for files
    console.log("Scanning repository for files...");
    for await (const filePath of scanDirectory(repoInfo.localPath)) {
      files.push(filePath);
    }
    console.log("Files to be analyzed:");
    for (const file of files) {
      console.log(`  - ${file}`);
    }

    console.log(`Found ${files.length} files to analyze.`);

    // Build Graph
    console.log("Building code graph...");
    
    const graph = await buildGraph(files, repoInfo, neo4jService || undefined);
    console.log(`Graph built with ${graph.numberOfNodes()} nodes and ${graph.numberOfEdges()} edges.`);

    // Store Graph in Neo4j if service is available
    if (neo4jService) {
      console.log("Storing graph in Neo4j...");
      await neo4jService.storeGraph(graph, repoInfo.repoId);
      console.log("Graph stored successfully.");

      // Generate embeddings for the graph
      console.log("Generating embeddings...");
      await generateEmbeddings(neo4jService, repoInfo.repoId);
      console.log("Embeddings generated successfully.");
    }
  } catch (error) {
    console.error("Error creating repository map:", error);
    throw error;
  } finally {
    // Close Neo4j connection if we created it
    if (neo4jService && !existingNeo4jService) {
      await neo4jService.close();
    }
  }
}

// Command Line Interface Setup
// const program = new Command();

// program
//   .name('repo-map')
//   .description('Analyzes a code repository, generates a structural map, and stores it in Neo4j.')

// program
//   .argument('<repoUrl>', 'URL or local path of the repository')
//   .option('-o, --output <dir>', 'Output directory for clone/download', './repo_map_output')
//   .option('-b, --branch <branch>', 'Specific branch to checkout')
//   .option('--clear', 'Clear existing data for this repository in Neo4j before processing', false)
//   .action((repoUrl, options) => {
//     createRepoMap(repoUrl, options.output, {
//       branch: options.branch,
//       clearExistingData: options.clear
//     })
//     .catch(err => {
//       console.error(err);
//       process.exitCode = 1;
//     });
//   });

// program.parse(process.argv);

// Export the main function if you want to use it as a library
export { createRepoMap };
