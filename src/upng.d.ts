declare module 'upng-js' {
  interface UPNGImage {
    width: number;
    height: number;
    depth: number;
    ctype: number;
    frames: unknown[];
    tabs: unknown;
    data: Uint8Array;
  }
  const UPNG: {
    decode(buffer: ArrayBuffer): UPNGImage;
    toRGBA8(img: UPNGImage): ArrayBuffer[];
    encode(bufs: ArrayBuffer[], w: number, h: number, cnum: number): ArrayBuffer;
  };
  export default UPNG;
}
