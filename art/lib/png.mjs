// Original dependency-free PNG codec: RGBA8, non-interlaced, CRC checked.
// Deliberately writes filter 0 for reproducible tiny pixel-art files.
import { deflateSync, inflateSync } from 'node:zlib';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const name = Buffer.from(type), header = Buffer.alloc(4), checksum = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, bytes])));
  return Buffer.concat([header, name, bytes, checksum]);
}
export function encodePNG({ width, height, data }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 4_194_304 || data.length !== width * height * 4) throw new Error('invalid PNG size or data');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) scanlines.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
export function decodePNG(input) {
  const bytes = Buffer.from(input);
  if (!bytes.subarray(0, 8).equals(signature)) throw new Error('invalid PNG signature');
  let offset = 8, width, height, ended = false;
  const compressed = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('truncated PNG chunk');
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    if (offset + length + 12 > bytes.length) throw new Error('truncated PNG chunk data');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) throw new Error(`PNG CRC mismatch in ${type}`);
    if (type === 'IHDR') {
      if (width !== undefined || offset !== 8 || length !== 13) throw new Error('invalid PNG IHDR');
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (!width || !height || width * height > 4_194_304 || data[8] !== 8 || data[9] !== 6 || data[10] || data[11] || data[12]) throw new Error('PNG requires non-interlaced RGBA8');
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') { ended = true; offset += length + 12; break; }
    else if (type[0] === type[0].toUpperCase()) throw new Error(`unsupported PNG chunk ${type}`);
    offset += length + 12;
  }
  if (!ended || !width || offset !== bytes.length || !compressed.length) throw new Error('incomplete PNG data');
  const stride = width * 4, scan = inflateSync(Buffer.concat(compressed), { maxOutputLength: height * (stride + 1) });
  if (scan.length !== height * (stride + 1)) throw new Error('invalid PNG scanline size');
  const output = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = scan[y * (stride + 1)];
    if (filter > 4) throw new Error('invalid PNG filter');
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x, left = x >= 4 ? output[at - 4] : 0, up = y ? output[at - stride] : 0, corner = y && x >= 4 ? output[at - stride - 4] : 0;
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, corner)][filter];
      output[at] = (scan[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  return { width, height, data: output };
}
