import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const source = path.join(publicDir, 'favicon.svg');
const iconsDir = path.join(publicDir, 'icons');
const sizes = [16, 48, 128];

async function convertSvgToPng() {
    console.log('Generating extension icons from favicon.svg...');

    if (!fs.existsSync(source)) {
        console.error('✗ favicon.svg not found in public folder');
        process.exit(1);
    }

    if (!fs.existsSync(iconsDir)) {
        fs.mkdirSync(iconsDir, { recursive: true });
    }

    try {
        for (const size of sizes) {
            const output = path.join(iconsDir, `icon-${size}.png`);
            await sharp(source).resize(size, size).png().toFile(output);
            console.log(`✓ Generated icon-${size}.png`);
        }
        console.log('Icon generation complete!');
    } catch (error) {
        console.error('✗ Failed to generate icons:', error.message);
        process.exit(1);
    }
}

convertSvgToPng();
