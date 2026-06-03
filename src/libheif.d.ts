declare module 'libheif-js/wasm-bundle' {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(
      displayData: { data: Uint8ClampedArray; width: number; height: number },
      callback: (result: unknown) => void,
    ): void;
  }
  interface HeifDecoderInstance {
    decode(data: Uint8Array): HeifImage[];
  }
  interface LibHeif {
    HeifDecoder: new () => HeifDecoderInstance;
  }
  const libheif: LibHeif;
  export default libheif;
}
