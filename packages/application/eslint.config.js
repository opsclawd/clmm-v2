import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBaseConfig } from '@clmm/config/eslint/base.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default createBaseConfig(path.join(__dirname, 'tsconfig.json'));
