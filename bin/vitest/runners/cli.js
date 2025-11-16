#!/usr/bin/env node
"use strict";

import { execSync } from "child_process";
import { existsSync, read, readFileSync } from "fs";
import { join ,resolve} from "path";
import chokidar from "chokidar";
import fs from "fs";
import yaml from "js-yaml";
import readline from "readline";
import { IncrementalExecutor } from "../core/executor/incremental-executor.js";
import { TextTestRunner,determineWorkflow, shallowStringify } from "../core/test-runner.js";
import { generateTestSuite } from '../core/test-runner.js';
const args = process.argv.slice(2);
const cmd = args[0];

function run(cmdline) {
  execSync(cmdline, { stdio: "inherit" });
}

function usage() {
  console.log(`
itest CLI 命令：

  pnpm test                    运行所有测试
  pnpm test:file <name>.txt    运行单个文件（模糊匹配）
  pnpm test:case "用例名"      运行单个测试用例 (grep)
  pnpm test:changed            只运行变化的测试
  pnpm test:watch              监控模式，文件变化自动运行
  pnpm test:debug <file.txt>   交互式调试单个文件
  pnpm test:step "用例名"     单步调试测试用例 (近似)

  pnpm config:view             查看当前配置
  pnpm config:validate         验证配置有效性
`);
}

try {
  switch (cmd) {
    case undefined:
    case "test":
      run(`pnpm vitest run`);
      break;

    case "test:file": {
      const file = args[1];
      if (!file) { usage(); process.exit(1); }
      const base = file.replace(/\.txt$/, "").toLowerCase();
      const path = `tests/vitest/${base}.test.js`;
      if(existsSync(path)){
        run(`pnpm vitest run ${path}`);
      }
      else{
        console.log(`未找到文件 ${path}`);
      }
      
      break;
    }

    case "test:case": {
      const name = args.slice(1).join(" ");
      if (!name) { usage(); process.exit(1); }
      run(`pnpm vitest run --grep "${name}"`);
      break;
    }

    case "test:watch": {

      const corePath = join(process.cwd(), "config", "core.yaml");
      const coreConfig = yaml.load(readFileSync(corePath, "utf-8"));



      console.log(`监听目录: ${join("tests", "scenarios")}`);
      console.log('按 q 或 Ctrl-C 退出\n');

      const buildTestSuite = (file) => {
        const base = file.split("/").pop().replace(/\.txt$/, "");
        const testContent = generateTestSuite(file,coreConfig);
        const testFile = join(process.cwd(), "tests", "vitest", base + ".test.js");
        fs.writeFileSync(testFile, testContent); 
        console.log(`生成测试文件 ${testFile}`);
      }


      chokidar
        .watch( "./tests/scenarios/", {
          // ignored: /(?<!\.txt)$/,
          persistent: true,
          ignoreInitial: false,       // 启动时不触发 add 事件
          awaitWriteFinish: {        // 写完再触发，避免临时文件抖动
            stabilityThreshold: 300,
            pollInterval: 100
          }
        })
        .on('add',    p => {
          if(p.match(/(?<!\.txt)$/i))
            return;
          console.log(`[+] ${p}`)
          if(fs.existsSync(join(process.cwd(), "tests", "vitest", p.split("/").pop().replace(/\.txt$/, "") + ".test.js")))
            return;

          buildTestSuite(p);
      })
        .on('change',  p => {
          if(p.match(/(?<!\.txt)$/i))
            return;
          console.log(`[*] ${p}`)
          buildTestSuite(p);
      })
        .on('unlink',  p => {
          if(p.match(/(?<!\.txt)$/i))
            return;
          console.log(`[-] ${p}`)
          fs.unlinkSync(join(process.cwd(), "tests", "vitest", p.split("/").pop().replace(/\.txt$/, "") + ".test.js"));
      })
        .on('error',  e => console.error('监听出错:', e));

      process.stdin.setRawMode(true);
      process.stdin.on('data', c => {
        if (c.toString() === 'q' || c[0] === 3) {
          console.log('\nbye');
          process.exit(0);
        }
      });
      process.stdin.resume();
   
      break;
    }

    case "test:watch:test":
      run(`pnpm vitest`);
      break;

    case "test:build": {
      const file = args[1];
      if (!file) { usage(); process.exit(1); }
      const base = file.replace(/\.txt$/, "").toLowerCase();
      const scenarioFile = join(process.cwd(), "tests", "scenarios", base + ".txt");

      const corePath = join(process.cwd(), "config", "core.yaml");
      const coreConfig = yaml.load(readFileSync(corePath, "utf-8"));

      const testContent = generateTestSuite(scenarioFile,coreConfig);
      const testFile = join(process.cwd(), "tests", "vitest", base + ".test.js");
      fs.writeFileSync(testFile, testContent); 
      console.log(`生成测试文件 ${testFile}`);
      break;
    }

    case "test:debug": {
      const file = args[1];
      if (!file) { usage(); process.exit(1); }
      run(`node bin/vitest/ui/step-debugger.js ${file}`);
      break;
    }

    case "test:step": {
      const name = args.slice(1).join(" ");
      if (!name) { usage(); process.exit(1); }
      // Approximate single-step via grep and UI
      run(`pnpm vitest run --grep "${name}"`);
      break;
    }

    case "config:view": {
      const corePath = join(process.cwd(), "config", "core.yaml");
      const rulesPath = join(process.cwd(), "config", "translation-rules.yaml");
      if (existsSync(corePath)) {
        console.log("\n# config/core.yaml\n" + readFileSync(corePath, "utf-8"));
      } else {
        console.log("缺少 config/core.yaml");
      }
      if (existsSync(rulesPath)) {
        console.log("\n# config/translation-rules.yaml\n" + readFileSync(rulesPath, "utf-8"));
      } else {
        console.log("缺少 config/translation-rules.yaml");
      }
      break;
    }

    case "config:validate": {
      const corePath = join(process.cwd(), "config", "core.yaml");
      const rulesPath = join(process.cwd(), "config", "translation-rules.yaml");
      let ok = true;
      try {
        if (existsSync(corePath)) yaml.load(readFileSync(corePath, "utf-8"));
        else {
          ok = false; console.log("缺少 core.yaml");
        }
      } catch (e) { ok = false; console.log("core.yaml 无效:", e.message); }
      try {
        if (existsSync(rulesPath)) yaml.load(readFileSync(rulesPath, "utf-8"));
        else {
          ok = false; console.log("缺少 translation-rules.yaml");
        }
      } catch (e) { ok = false; console.log("translation-rules.yaml 无效:", e.message); }
      console.log(ok ? "✅ 配置文件有效" : "❌ 配置存在问题");
      break;
    }

    default:
      usage();
  }
} catch (e) {
  console.error("运行失败:", e.message);
  process.exit(1);
}