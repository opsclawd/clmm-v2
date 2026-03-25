import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReactNativeConfig } from '@clmm/config/eslint/react-native.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default createReactNativeConfig(path.join(__dirname, 'tsconfig.json'));
