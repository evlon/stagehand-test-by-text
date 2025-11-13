#!/usr/bin/env node
"use strict";

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import { IncrementalExecutor } from "../core/executor/incremental-executor.js";

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
      run(`pnpm vitest run ${path}`);
      break;
    }

    case "test:case": {
      const name = args.slice(1).join(" ");
      if (!name) { usage(); process.exit(1); }
      run(`pnpm vitest run --grep "${name}"`);
      break;
    }

    case "test:changed": {
      const inc = new IncrementalExecutor();
      const changes = inc.getChangedTests();
      if (changes.length === 0) {
        console.log("✨ 无变化的测试文件");
        break;
      }
      for (const ch of changes) {
        const base = ch.file.split("/").pop().replace(/\.txt$/, "");
        const path = `tests/vitest/${base}.test.js`;
        try {
          run(`pnpm vitest run ${path}`);
        } catch {}
      }
      inc.markRun(changes.map((c) => c.file));
      break;
    }

    case "test:watch":
      run(`pnpm vitest`);
      break;

    case "test:debug": {
      const file = args[1];
      if (!file) { usage(); process.exit(1); }
      run(`node bin/itest/ui/step-debugger.js ${file}`);
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