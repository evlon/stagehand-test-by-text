#!/usr/bin/env node

import { execSync } from 'child_process';
import {glob } from 'glob';
const args = process.argv.slice(2);

let testPattern = 'tests/vitest/';
if (args.length > 0) {
  const input = args[0].toLowerCase();
  
  testPattern =  `**/*${input}*.test.js`;
}

console.log(`Running tests matching: ${testPattern}`);
// 如果能找到对应的测试文件，则执行测试，否则打印提示信息

const files =  glob.sync(testPattern, { cwd: process.cwd() });
if (files.length === 0) {
  console.log(`No tests found matching: ${testPattern}`);
  process.exit(1);
}

// 逐个执行测试文件
files.forEach((file) => {
    execSync(`pnpm vitest run ${file}`, { stdio: 'inherit' });
});
// execSync(`pnpm vitest run tests/vitest/${testPattern}`, { stdio: 'inherit' });