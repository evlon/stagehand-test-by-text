#!/usr/bin/env node
"use strict";

import { join } from "path";
import { fileURLToPath } from "url";
import readline from "readline";
import "../../setup/env-setup.js";
import { TextTestRunner } from "../core/test-runner.js";

const __filename = fileURLToPath(import.meta.url);

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

export async function debugFile(scenarioFile) {
  const runner = new TextTestRunner();
  const testCases = runner.parseTextScenario(scenarioFile);
  if (testCases.length === 0) {
    console.log("未发现测试用例:", scenarioFile);
    return;
  }
  console.log(`🪲 单步调试: ${scenarioFile}`);

  for (const tc of testCases) {
    console.log(`\n📋 用例: ${tc.name}`);
    for (let i = 0; i < tc.steps.length; i++) {
      const stepInfo = tc.steps[i];
      console.log(`\n➡️  步骤 ${i + 1}/${tc.steps.length}: ${stepInfo.action}`);
      const action = await prompt("操作(e=执行, s=跳过, c=连续运行, q=退出): ");
      if (action === "q") return;
      if (action === "s") {
        console.log("⏭️ 已跳过该步骤");
        continue;
      }
      if (action === "c") {
        console.log("▶️ 连续运行剩余步骤...");
        for (let j = i; j < tc.steps.length; j++) {
          const r = await runner.executeStep(tc.steps[j]);
          if (!r.success) {
            console.log("❌ 失败:", r.error);
            return;
          }
        }
        break;
      }
      const result = await runner.executeStep(stepInfo);
      if (!result.success) {
        console.log("❌ 失败:", result.error);
        const retry = await prompt("是否重试该步骤? (y/n): ");
        if (retry.toLowerCase() === "y") {
          i--; // retry current index
        }
      } else {
        console.log("✅ 成功");
      }
    }
  }
}

// CLI
if (process.argv[1] && process.argv[1].endsWith("step-debugger.js")) {
  const rel = process.argv[2];
  if (!rel) {
    console.log("用法: pnpm test:debug <scenario.txt>");
    process.exit(1);
  }
  const scenarioFile = rel.match(/\//) ? rel : join(process.cwd(), "tests", "scenarios", rel);
  debugFile(scenarioFile).catch((e) => {
    console.error("调试器异常:", e);
    process.exit(1);
  });
}