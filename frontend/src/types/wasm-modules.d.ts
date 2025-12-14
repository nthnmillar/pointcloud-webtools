interface ToolsWasmModule {
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

// Global type declaration for WASM modules
// This will be used by TypeScript when importing WASM modules

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

// Declare module for any path ending with tools_cpp.js
declare module '*tools_cpp.js' {
  const factory: (options?: {
    locateFile?: (path: string) => string;
  }) => Promise<ToolsWasmModule>;
  export default factory;
  export const ToolsModule: (options?: {
    locateFile?: (path: string) => string;
  }) => Promise<ToolsWasmModule>;
}

