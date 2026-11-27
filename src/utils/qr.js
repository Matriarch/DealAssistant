"use strict";

const QR_FILENAME = "receiving-address.gif";

async function createAddressQr(address) {
  const { encodeQR } = await import("qr");
  return Buffer.from(encodeQR(address, "gif", { border: 4, scale: 7 }));
}

module.exports = { createAddressQr, QR_FILENAME };
