declare module 'jsnetworkx' {
  export class MultiDiGraph {
    constructor();
    addNode(node: string, attributes?: any): void;
    addEdge(u: string, v: string, attributes?: any): void;
    nodes(): IterableIterator<string>;
    edges(data?: boolean): IterableIterator<[string, string, number]>;
    get(node: string): any;
    get(u: string, v: string, key: number): any;
    numberOfNodes(): number;
    numberOfEdges(): number;
  }
}
