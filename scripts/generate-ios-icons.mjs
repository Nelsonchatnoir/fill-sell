import sharp from 'sharp';
import { writeFileSync } from 'fs';
import path from 'path';

const src = 'public/icon-512x512.png';
const dest = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';

const sizes = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];

for (const size of sizes) {
  const filename = `AppIcon-${size}.png`;
  await sharp(src).resize(size, size).png().toFile(path.join(dest, filename));
  console.log(`✓ ${filename} (${size}x${size})`);
}

console.log('\nAll icons generated!');
