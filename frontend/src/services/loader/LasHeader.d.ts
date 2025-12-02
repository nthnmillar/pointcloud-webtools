declare module 'las-header' {
  interface ReadFileObjectOptions {
    input: File;
  }

  interface LasHeader {
    ScaleFactorX?: number;
    ScaleFactorY?: number;
    ScaleFactorZ?: number;
    OffsetX?: number;
    OffsetY?: number;
    OffsetZ?: number;
    [key: string]: unknown;
  }

  interface LasHeaderModule {
    readFileObject(options: ReadFileObjectOptions): Promise<LasHeader>;
  }

  const lasHeader: LasHeaderModule;
  export default lasHeader;
}
