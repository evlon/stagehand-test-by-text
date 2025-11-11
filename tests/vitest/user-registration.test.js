import { createTestSuite } from './test-utils.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 从文本文件生成完整的用户注册测试套件
const textFilePath = join(__dirname, '../scenarios/user-registration.txt');
createTestSuite(textFilePath).generateTests();