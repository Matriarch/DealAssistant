"use strict";

const { crc32, deflateSync } = require("node:zlib");

const QR_FILENAME = "receiving-address.png";
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

async function createAddressQr(address) {
  const { encodeQR } = await import("qr");
  const rows = encodeQR(address, "raw", { border: 4, scale: 7 });
  const size = rows.length;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // Eight-bit grayscale, with the other IHDR fields set to zero.

  const stride = size + 1;
  const pixels = Buffer.alloc(size * stride);
  for (const [y, row] of rows.entries()) {
    // A zero filter byte precedes each row of black and white pixels.
    for (const [x, dark] of row.entries()) {
      pixels[y * stride + x + 1] = dark ? 0 : 255;
    }
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

module.exports = { createAddressQr, QR_FILENAME };
