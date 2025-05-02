/**
 * Utility functions for the repo-map project
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Common text file extensions
 */
const TEXT_FILE_EXTENSIONS = new Set([
  // Programming languages
  '.ts', '.js', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.go', '.rb', '.php', '.swift', '.kt', '.scala', '.rs', '.sh',
  '.bash', '.zsh', '.fish', '.pl', '.pm', '.t', '.lua', '.groovy', '.r',
  '.m', '.mm', '.f', '.f90', '.f95', '.for', '.tcl', '.vb', '.vbs', '.ps1',
  '.psm1', '.psd1', '.asm', '.s', '.sql', '.d', '.clj', '.cljs', '.cljc',
  '.edn', '.hs', '.lhs', '.elm', '.ex', '.exs', '.erl', '.hrl', '.ml',
  '.mli', '.fs', '.fsi', '.fsx', '.fsscript',
  
  // Web
  '.html', '.htm', '.xhtml', '.css', '.scss', '.sass', '.less', '.svg',
  '.xml', '.json', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf',
  
  // Documentation
  '.md', '.markdown', '.txt', '.rst', '.asciidoc', '.adoc', '.tex',
  
  // Configuration
  '.gitignore', '.dockerignore', '.env', '.editorconfig', '.eslintrc',
  '.prettierrc', '.babelrc', '.stylelintrc',
  
  // Other
  '.csv', '.tsv', '.graphql', '.gql', '.proto',
]);

/**
 * Determines if a file is likely to be a text file based on its extension
 * @param filePath Path to the file
 * @returns True if the file is likely to be a text file, false otherwise
 */
export function isLikelyTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  
  // Check if the extension is in our list of text file extensions
  if (TEXT_FILE_EXTENSIONS.has(ext)) {
    return true;
  }
  
  // For files without extension or with uncommon extensions,
  // try to read the first few bytes to check if it's binary
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4096);
    const bytesRead = fs.readSync(fd, buffer, 0, 4096, 0);
    fs.closeSync(fd);
    
    // Check for null bytes which indicate binary content
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Error checking if file ${filePath} is text:`, error);
    return false;
  }
}

/**
 * Generates a unique node ID based on the repository ID and node path
 * @param repoId Repository ID
 * @param nodePath Node path (e.g., file path, class name, function name)
 * @returns Unique node ID
 */
export function generateNodeId(repoId: string, nodePath: string): string {
  return crypto.createHash('md5').update(`${repoId}:${nodePath}`).digest('hex');
}

/**
 * Extracts the file extension from a file path
 * @param filePath Path to the file
 * @returns File extension (with the dot) or empty string if no extension
 */
export function getFileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

/**
 * Gets the programming language based on file extension
 * @param filePath Path to the file
 * @returns Programming language or undefined if unknown
 */
export function getLanguageFromExtension(ext: string): string | undefined {
  const languageMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.go': 'go',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.rs': 'rust',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.json': 'json',
    '.md': 'markdown',
    '.xml': 'xml',
    '.sql': 'sql',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'bash',
  };
  
  return languageMap[ext];
}

/**
 * Formats a file size in bytes to a human-readable string
 * @param bytes File size in bytes
 * @returns Human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}
