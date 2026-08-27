import { deflateSync, crc32 } from "node:zlib";

function u32be(n: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(n >>> 0, 0);
  return buf;
}

function chunk(type: string, data: Buffer): Buffer {
  const tipo = Buffer.from(type, "ascii");
  const crc = crc32(Buffer.concat([tipo, data]));
  return Buffer.concat([u32be(data.length), tipo, data, u32be(crc)]);
}

/** PNG 8-bit grayscale (preto = 0, branco = 255). */
export function grayscaleParaPng(
  width: number,
  height: number,
  pixels: Buffer,
): Buffer {
  if (width <= 0 || height <= 0 || pixels.length < width * height) {
    throw new Error("Imagem de digital inválida.");
  }
  const stride = width + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    pixels.copy(raw, y * stride + 1, y * width, y * width + width);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function grayscaleParaDataUrl(
  width: number,
  height: number,
  pixels: Buffer,
): string {
  const png = grayscaleParaPng(width, height, pixels);
  return `data:image/png;base64,${png.toString("base64")}`;
}
