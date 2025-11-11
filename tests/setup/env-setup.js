// tests/setup/env-setup.js
import { config } from 'dotenv';
import { resolve } from 'path';

// 加载 test-data/credentials.env 文件
config({ path: resolve(process.cwd(), 'test-data/credentials.env') });
