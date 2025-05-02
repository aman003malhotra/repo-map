/**
 * Repository scanner module
 * Recursively scans a directory and yields paths to files matching filter criteria
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { isLikelyTextFile } from '../utils/utils.js';

/**
 * Default directories to ignore during scanning
 */
const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.svn',
  'dist',
  'build',
  'out',
  'vendor',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.vscode',
  '.idea',
];

/**
 * Recursively scans a directory and yields paths to files matching the filter criteria
 * @param dirPath The root directory to scan
 * @param filterFn Optional function that takes a file path and returns true if the file should be included
 * @param ignorePatterns Optional array of directory names to ignore
 * @returns AsyncGenerator that yields file paths
 */
export async function* scanDirectory(
  dirPath: string,
  filterFn: (filePath: string) => boolean = isLikelyTextFile,
  ignorePatterns: string[] = DEFAULT_IGNORE_PATTERNS
): AsyncGenerator<string> {
  const resolvedIgnore = new Set(ignorePatterns.map(p => path.basename(p)));

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const baseName = path.basename(fullPath);
      
      if (resolvedIgnore.has(baseName)) {
        // Skip ignored directories/files
        continue;
      }
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        yield* scanDirectory(fullPath, filterFn, ignorePatterns);
      } else if (entry.isFile() && filterFn(fullPath)) {
        // Yield file paths that match the filter
        yield fullPath;
      }
    }
  } catch (error: any) {
    // Log errors but continue if possible
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      console.warn(`Permission denied accessing: ${dirPath}`);
    } else if (error.code === 'ENOENT') {
      console.warn(`Directory not found: ${dirPath}`);
    } else {
      console.error(`Error scanning directory ${dirPath}:`, error);
    }
  }
}

/**
 * Gets the content of a file as a string
 * @param filePath Path to the file
 * @returns File content as a string
 */
export async function getFileContent(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return '';
  }
}

/**
 * Counts the number of files in a directory (recursive)
 * @param dirPath The root directory to scan
 * @param filterFn Optional function that takes a file path and returns true if the file should be included
 * @param ignorePatterns Optional array of directory names to ignore
 * @returns Number of files
 */
export async function countFiles(
  dirPath: string,
  filterFn: (filePath: string) => boolean = isLikelyTextFile,
  ignorePatterns: string[] = DEFAULT_IGNORE_PATTERNS
): Promise<number> {
  let count = 0;
  for await (const _ of scanDirectory(dirPath, filterFn, ignorePatterns)) {
    count++;
  }
  return count;
}
