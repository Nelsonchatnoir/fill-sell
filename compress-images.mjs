import sharp from 'sharp';
import { writeFileSync, renameSync } from 'fs';

const images = ['public/pata1.jpg', 'public/pata2.jpg'];

for (const src of images) {
  const tmp = src + '.tmp';
  let quality = 80;
  let buf;
  do {
    buf = await sharp(src).resize({ width: 800, withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
    quality -= 5;
  } while (buf.length > 200 * 1024 && quality > 20);

  writeFileSync(tmp, buf);
  renameSync(tmp, src);
  console.log(`✅ ${src} → ${(buf.length / 1024).toFixed(0)} KB (quality ${quality + 5})`);
}
