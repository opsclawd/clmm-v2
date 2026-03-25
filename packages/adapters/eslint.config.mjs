import path from 'path';
import { fileURLToPath } from 'url';
import { createNodeConfig } from '@clmm/config/eslint/node.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default createNodeConfig(path.join(__dirname, 'tsconfig.json'));
