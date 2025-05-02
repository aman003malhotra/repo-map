declare module 'web-tree-sitter' {
  export default class Parser {
    static init(): Promise<void>;
    constructor();
    setLanguage(language: Language): void;
    parse(input: string): Tree;
  }

  export class Language {
    static load(path: string): Promise<Language>;
    query(source: string): Query;
  }

  export class Tree {
    rootNode: SyntaxNode;
  }

  export interface Point {
    row: number;
    column: number;
  }

  export interface Node {
    type: string;
    startPosition: Point;
    endPosition: Point;
    startIndex: number;
    endIndex: number;
    text: string;
    children: (Node | null)[];
    parent: Node | null;
    childCount: number;
    namedChildCount: number;
    
    child(index: number): Node | null;
    namedChild(index: number): Node | null;
    firstChild: Node | null;
    lastChild: Node | null;
    firstNamedChild: Node | null;
    lastNamedChild: Node | null;
    
    toString(): string;
  }

  // SyntaxNode is an alias for Node to maintain compatibility
  export type SyntaxNode = Node;

  export class Query {
    matches(node: SyntaxNode): QueryMatch[];
    captures(node: SyntaxNode): QueryCapture[];
  }

  export interface QueryMatch {
    pattern: number;
    captures: QueryCapture[];
  }

  export interface QueryCapture {
    name: string;
    node: Node;
  }
}
