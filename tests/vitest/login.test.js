import { createTestSuite } from '../../bin/vitest/test-utils.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 从文本文件生成完整的登录测试套件
const textFilePath = join(__dirname, '../scenarios/login.txt');
createTestSuite(textFilePath).generateTests();