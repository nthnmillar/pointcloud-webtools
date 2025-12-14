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

declare module '../../../../public/wasm/cpp/tools_cpp.js' {
  const factory: (options?: {
    locateFile?: (path: string) => string;
  }) => Promise<ToolsWasmModule>;
  export default factory;
  export const ToolsModule: (options?: {
    locateFile?: (path: string) => string;
  }) => Promise<ToolsWasmModule>;
}
