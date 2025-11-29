import { cpSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const sourceDir = join(rootDir, 'src', 'generated', 'prisma');
const destDir = join(rootDir, 'build', 'generated', 'prisma');

try {
  // Check if source directory exists
  if (!existsSync(sourceDir)) {
    console.error('✗ Prisma generated files not found. Please run "prisma generate" first.');
    process.exit(1);
  }

  // Ensure destination directory exists
  mkdirSync(join(rootDir, 'build', 'generated'), { recursive: true });
  
  // Copy the entire prisma generated directory
  cpSync(sourceDir, destDir, { recursive: true, force: true });
  console.log('✓ Copied Prisma generated files to build directory');
} catch (error) {
  console.error('✗ Failed to copy Prisma generated files:', error.message);
  process.exit(1);
}

