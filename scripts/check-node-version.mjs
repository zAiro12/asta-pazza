import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const requiredNode = packageJson.engines?.node;

if (!requiredNode) {
  console.error('Missing "engines.node" in package.json.');
  process.exit(1);
}

const currentNodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
const requiredMatch = requiredNode.match(/^(\d+)(?:\.x)?$/);

if (!requiredMatch) {
  console.error(`Unsupported engines.node format: ${requiredNode}`);
  process.exit(1);
}

const requiredNodeMajor = Number.parseInt(requiredMatch[1], 10);

if (currentNodeMajor !== requiredNodeMajor) {
  console.error(`Node ${requiredNode} required. Current version: ${process.versions.node}. Run: nvm use ${requiredNodeMajor}`);
  process.exit(1);
}