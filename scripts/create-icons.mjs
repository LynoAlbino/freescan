import { deflateSync } from "node:zlib";
import { writeFile, mkdir } from "node:fs/promises";
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type),
    length = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function distance(x, y, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)),
    );
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
const paths = [
  [
    [172, 128],
    [128, 128],
    [128, 172],
  ],
  [
    [340, 128],
    [384, 128],
    [384, 172],
  ],
  [
    [128, 340],
    [128, 384],
    [172, 384],
  ],
  [
    [340, 384],
    [384, 384],
    [384, 340],
  ],
  [
    [196, 173],
    [316, 173],
    [316, 339],
    [196, 339],
    [196, 173],
  ],
  [
    [224, 222],
    [288, 222],
  ],
  [
    [224, 258],
    [288, 258],
  ],
  [
    [224, 294],
    [262, 294],
  ],
];
await mkdir("public/icons", { recursive: true });
for (const size of [192, 512]) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x / size) * 512,
        py = (y / size) * 512;
      let white = false;
      for (let j = 0; j < paths.length; j++)
        for (let i = 1; i < paths[j].length; i++)
          if (
            distance(px, py, paths[j][i - 1], paths[j][i]) <
            (j < 4 ? 12 : j === 4 ? 8 : 6)
          )
            white = true;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      rows[o] = white ? 255 : 20;
      rows[o + 1] = white ? 255 : 125;
      rows[o + 2] = white ? 255 : 100;
      rows[o + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  await writeFile(
    `public/icons/icon-${size}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(rows)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
