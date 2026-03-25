import path from 'path';
import { fileURLToPath } from 'url';
import { createReactNativeConfig } from '@clmm/config/eslint/react-native.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default createReactNativeConfig(path.join(__dirname, 'tsconfig.json'));
