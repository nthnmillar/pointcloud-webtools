// Global type declaration for WASM modules
export interface ToolsWasmModule {
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPF32: Float32Array;
  cwrap?(
    name: string,
    returnType: string,
    argTypes: string[]
  ): (...args: number[]) => number;
  ccall?(
    name: string,
    returnType: string,
    argTypes: string[],
    args: number[]
  ): number;
}

// Declare module for WASM imports using a pattern TypeScript will match
// This uses a glob pattern that matches any path containing tools_cpp.js
declare module '*/tools_cpp.js' {
  const factory: (options?: {
    locateFile?: (path: string) => string;
  }) => Promise<ToolsWasmModule>;
  export default factory;
  export const ToolsModule: (options?: {
    locateFile?: (path: string) => string;
  }) => Promise<ToolsWasmModule>;
}

// Also declare for absolute paths from public directory
declare module '/wasm/cpp/tools_cpp.js' {
  const factory: (options?: {
    locateFile?: (path: string) => string;
  }) => Promise<ToolsWasmModule>;
  export default factory;
  export const ToolsModule: (options?: {
    locateFile?: (path: string) => string;
  }) => Promise<ToolsWasmModule>;
}
