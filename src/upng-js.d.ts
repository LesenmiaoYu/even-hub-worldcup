declare module 'upng-js' {
  const UPNG: {
    encode(rgbaBuffers: ArrayBuffer[], w: number, h: number, cnum: number): ArrayBuffer
    decode(buffer: ArrayBuffer): unknown
  }
  export default UPNG
}
