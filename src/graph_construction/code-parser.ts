/**
 * Code parser module
 * Uses Tree-sitter to parse code files and extract structural information
 */
import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import * as t from '@babel/types';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import type { Tag } from '../types/index.js';

// Maps of symbols and their locations
const IMPORTED_IDENTIFIERS = new Set<string>();
const DEFINED_SYMBOLS = new Map<string, {file: string, line: number}>();
const EXPORT_MAP = new Map<string, Set<string>>();
const FILE_REFERENCES = new Map<string, string>(); // Tracks sourceFile -> targetFile references
const IMPORT_RESOLVER = new Map<string, string>();

import JavaScript from 'tree-sitter-javascript';
import globals from 'globals';

function getBuiltinPrototypeMethods() {
  const prototypes = [
    String.prototype,
    Array.prototype,
    Object.prototype,
    Number.prototype,
    Boolean.prototype,
    Function.prototype,
    RegExp.prototype,
    Date.prototype,
    Map.prototype,
    Set.prototype,
    WeakMap.prototype,
    WeakSet.prototype,
    Promise.prototype,
    Symbol.prototype,
    BigInt.prototype,
  ];

  const methodSet = new Set();

  for (const proto of prototypes) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc && typeof desc.value === 'function') {
        methodSet.add(key);
      }
    }
  }

  return methodSet;
}

// Get the browser globals
const browserGlobals = new Set(Object.keys(globals.browser));

// Get the Node.js globals
const nodeGlobals = new Set(Object.keys(globals.node));

// Get the ES2021 globals
const esGlobals = new Set(Object.keys(globals.es2021));

const allGlobals = new Set([
  ...browserGlobals,
  ...nodeGlobals,
  ...esGlobals,
]);

const __dirname = dirname(fileURLToPath(import.meta.url));

export type SourceLocation = t.SourceLocation | null;

export type ASTNode =
  | FunctionNode
  | ClassNode
  | VariableNode;

export type FunctionNode = {
  type: 'function';
  name: string;
  async?: boolean;
  generator?: boolean;
  loc?: SourceLocation;
};

export type ClassNode = {
  type: 'class';
  name: string;
  loc?: SourceLocation;
};

export type VariableNode = {
  type: 'variable';
  name: string;
  kind: any;
  isFunction?: boolean;
  isArrowFunction?: boolean | undefined | null;
  loc?: SourceLocation;
};

export type TypeAliasNode = {
  type: 'typeAlias';
  name: string;
};

export type FileNode = {
  filePath: string;
  nodes: ASTNode[];
};

export async function parseFile(filePath: string, repoRoot: string): Promise<Tag[]> {
  return new Promise((resolve, reject) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const extension = path.extname(filePath).toLowerCase();
      const relPath = path.relative(repoRoot, filePath);
      let currentClass: string | null = null;

      if (['.js', '.ts', '.tsx', '.jsx'].includes(extension)) {
        const ast = parse(content, {
          sourceType: 'module',
          plugins: [
            'jsx', 'typescript', 'classProperties', 'decorators-legacy',
            'objectRestSpread', 'dynamicImport', 'exportDefaultFrom',
            'optionalChaining', 'nullishCoalescingOperator'
          ],
        });

        const tags: Tag[] = [];

      // Helper function to get the current function name
      function getCurrentFunctionName(): string {
        if (currentClass) {
          return currentClass;
        }
        return 'global';
      }

      // Helper function to get the function name from a node
      function getFunctionName(node: t.Node): string {
        if (t.isIdentifier(node)) {
          return node.name;
        }
        if (t.isMemberExpression(node)) {
          const property = node.property;
          if (t.isIdentifier(property)) {
            return property.name;
          }
          return '';
        }
        if (t.isCallExpression(node) && !shouldIgnoreFunctionCall(node)) {
          const callee = node.callee;
          if (t.isIdentifier(callee)) {
            return callee.name;
          }
          if (t.isMemberExpression(callee)) {
            const property = callee.property;
            if (t.isIdentifier(property)) {
              return property.name;
            }
          }
        }
        return '';
      }

      // Helper function to get the object name from a node
      function getObjectName(node: any): string {
        if (t.isIdentifier(node)) {
          return node.name;
        }
        if (t.isMemberExpression(node)) {
          const object = node.object;
          if (t.isIdentifier(object)) {
            return object.name;
          }
          return '';
        }
        return '';
      }

      // Traverse the AST once
      traverse.default(ast, {
        enter(path) {
          const node = path.node;

          // Track imports
          if (t.isImportDeclaration(node)) {
            const sourceFile = node.source.value;
            node.specifiers.forEach(spec => {
              const localName = t.isImportSpecifier(spec) ? spec.local.name : 
                                t.isImportDefaultSpecifier(spec) ? spec.local.name :
                                spec.local.name;
              
              if (EXPORT_MAP.has(sourceFile)) {
                const exportedName = t.isImportSpecifier(spec) ? 
                  (t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value) :
                  'default';
                
                if (EXPORT_MAP.get(sourceFile)!.has(exportedName)) {
                  IMPORT_RESOLVER.set(localName, `${sourceFile}#${exportedName}`);
                }
              }
            });
          }

          // Track class declarations
          if (t.isClassDeclaration(node) && node.id) {
            currentClass = node.id.name;
            
            // Create definition tag for class
            tags.push({
              name: node.id.name,
              type: 'class',
              kind: 'def',
              filePath: relPath,
              startLine: node.loc?.start.line || 0,
              endLine: node.loc?.end.line || 0
            });
          }
          
          // Track function declarations
          if (t.isFunctionDeclaration(node) && node.id) {
            const functionName = t.isIdentifier(node.id) ? node.id.name : '';
            if (functionName) {
              tags.push({
                name: functionName,
                type: 'function',
                kind: 'def',
                filePath: relPath,
                startLine: node.loc?.start.line || 0,
                endLine: node.loc?.end.line || 0
              });
            }
          }
          
          // Track method definitions
          if (t.isClassMethod(node)) {
            const isStatic = node.static;
            const methodName = t.isIdentifier(node.key) 
              ? node.key.name
              : t.isStringLiteral(node.key) 
                ? node.key.value
                : '[computed]';
                
            tags.push({
              name: isStatic ? `${currentClass}.${methodName}` : methodName,
              type: isStatic ? 'staticMethod' : 'method',
              kind: 'def',
              filePath: relPath,
              startLine: node.loc?.start.line || 0,
              endLine: node.loc?.end.line || 0,
              parent: {
                name: currentClass,
                type: 'class',
                location: {
                  filePath: relPath,
                  startLine: node.loc?.start.line || 0
                }
              }
            });
          }
          
          // Track private methods
          if (t.isClassPrivateMethod(node)) {
            tags.push({
              name: `#${node.key.id.name}`,
              type: 'privateMethod',
              kind: 'def',
              filePath: relPath,
              startLine: node.loc?.start.line || 0,
              endLine: node.loc?.end.line || 0,
              parent: {
                name: currentClass,
                type: 'class',
                location: {
                  filePath: relPath,
                  startLine: node.loc?.start.line || 0
                }
              }
            });
          }

          // Track function calls
          if (t.isCallExpression(node)) {
            const functionName = getFunctionName(node);
            
            if (shouldIgnoreFunctionCall(node)) {
              return;
            }
            console.log(node);
            // Create reference tag
            tags.push({
              name: functionName,
              type: 'functionCall',
              kind: 'ref',
              filePath: relPath,
              startLine: node.loc?.start.line || 0,
              endLine: node.loc?.end.line || 0,
              parent: {
                name: currentClass ? `${currentClass}.${getCurrentFunctionName()}` : getCurrentFunctionName(),
                type: currentClass ? 'method' : 'function',
                location: {
                  filePath: relPath,
                  startLine: node.loc?.start.line || 0
                }
              }
            });

            // Handle import resolution
            if (t.isIdentifier(node.callee)) {
              const resolvedName = IMPORT_RESOLVER.get(node.callee.name) || node.callee.name;
              
              if (DEFINED_SYMBOLS.has(resolvedName) || resolvedName.includes('#')) {
                const targetFile = resolvedName.includes('#') 
                  ? resolvedName.split('#')[0] 
                  : DEFINED_SYMBOLS.get(resolvedName)?.file;
                
                if (targetFile && !FILE_REFERENCES.has(`${relPath}:${targetFile}`)) {
                  FILE_REFERENCES.set(`${relPath}:${targetFile}`, targetFile);
                  tags.push({
                    name: node.callee.name,
                    type: 'functionCall',
                    kind: 'ref',
                    filePath: relPath,
                    targetFile,
                    startLine: node.loc?.start.line || 0,
                    endLine: node.loc?.end.line || 0
                  });
                }
              }
            }
            else if (t.isMemberExpression(node.callee)) {
              const objectName = getObjectName(node.callee.object);
              if (DEFINED_SYMBOLS.has(objectName)) {
                const targetFile = DEFINED_SYMBOLS.get(objectName)?.file;
                const methodName = t.isIdentifier(node.callee.property) 
                  ? node.callee.property.name
                  : '[computed]';
                
                if (targetFile && !FILE_REFERENCES.has(`${relPath}:${targetFile}:${objectName}.${methodName}`)) {
                  FILE_REFERENCES.set(`${relPath}:${targetFile}:${objectName}.${methodName}`, targetFile);
                  tags.push({
                    name: `${objectName}.${methodName}`,
                    type: 'methodCall',
                    kind: 'ref',
                    filePath: relPath,
                    targetFile,
                    startLine: node.loc?.start.line || 0,
                    endLine: node.loc?.end.line || 0
                  });
                }
              }
            }
          }

          // Track constructor calls
          if (t.isNewExpression(node) && t.isIdentifier(node.callee)) {
            if (shouldIgnoreFunctionCall(node)) {
              return;
            }
            tags.push({
              name: node.callee.name,
              type: 'constructorCall',
              kind: 'ref',
              filePath: relPath,
              startLine: node.loc?.start.line || 0,
              endLine: node.loc?.end.line || 0
            });
          }
        },
        
        exit(path) {
          const node = path.node;
          
          // Reset current class when exiting
          if (t.isClassDeclaration(node)) {
            currentClass = null;
          }
        }
      });
      // console.log(tags);
      resolve(tags);
    }
    return [];
  } catch (err) {
    reject(err);
  }
})
};

// Check if a function call should be ignored
function shouldIgnoreFunctionCall(node: t.Node): boolean {

  if (t.isThrowStatement(node)) {
    const argument = node.argument;
    if (t.isNewExpression(argument) && t.isIdentifier(argument.callee) && 
        (argument.callee.name === 'Error')) {
      return true;
    }
  }

  // Check for standalone Error constructor calls
  if (t.isNewExpression(node) && t.isIdentifier(node.callee) && 
      (node.callee.name === 'Error')) {
    return true;
  }

  if (t.isCallExpression(node)) {
    const callee = node.callee;
    if (t.isMemberExpression(callee)) {
      const object = callee.object;
      const property = callee.property;
      if (t.isIdentifier(object) && t.isIdentifier(property)) {
        // Check if this is a global object method call
        if (allGlobals.has(object.name) || allGlobals.has(property.name)) {
          return true;
        }
        return false;
      }
    } else if (t.isIdentifier(callee)) {
      // Check both the standalone name and the console.* version
      const name = callee.name;
      // Check if this is a global function call
      if (allGlobals.has(name)) {
        return true;
      }
      return false;
    }
  }
  return false;
}

function extractTags(rootNode: any, content: string, filePath: string, language: string, query: any, kind: 'def' | 'ref'): Tag[] {
  if (!query) return [];
  const tags: Tag[] = [];
  const matches = query.captures(rootNode);
  for (const match of matches) {
    if (!match.captures || match.captures.length === 0) continue;
    // Try to find a name and a definition/reference capture
    const nameCapture = match.captures.find((c: any) => c.name.includes('name'));
    const scopeCapture = match.captures.find((c: any) => c.name.includes('definition') || c.name.includes('reference'));
    if (!nameCapture || !scopeCapture) continue;
    
    const name = nameCapture.node.text;
    const type = extractTypeFromCaptureName(scopeCapture.name);
    
    // Skip ignored function calls
    if (type === 'functionCall' && shouldIgnoreFunctionCall(nameCapture.node)) {
      continue;
    }
    
    const startLine = scopeCapture.node.startPosition.row;
    const endLine = scopeCapture.node.endPosition.row;
    tags.push({
      name,
      type,
      kind,
      filePath,
      startLine,
      endLine,
      text: content.substring(scopeCapture.node.startIndex, scopeCapture.node.endIndex),
      parent: undefined // (optional: add parent extraction logic)
    });
  }
  return tags;
}

function extractTypeFromCaptureName(captureName: string): string {
  const parts = captureName.split('.');
  const typePart = parts.find(part =>
    ['function', 'class', 'method', 'variable', 'constant', 'module', 'import', 'constructor'].includes(part)
  );
  return typePart || 'unknown';
}
