"use strict";

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { StepExecutor } from "./executor/step-executor.js";
import StagehandManager from "../../setup/stagehand-setup.js";
import "../../setup/env-setup.js"; // 加载 .env 与测试凭据，提供 %TEST_*% 变量

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class TextTestRunner {
  constructor() {
    this.stagehandManager = new StagehandManager();
    this.stepExecutor = new StepExecutor();
    this.results = [];
    this.currentTestCase = null;
  }

  parseTextScenario(filePath) {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const testCases = [];

    let currentTestCase = null;
    let currentComment = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("## ")) {
        if (currentTestCase) testCases.push(currentTestCase);
        currentTestCase = { name: trimmed.replace("## ", ""), steps: [], comments: [] };
        currentComment = null;
      } else if (trimmed.startsWith("# ") && currentTestCase) {
        currentComment = trimmed.replace("# ", "");
        currentTestCase.comments.push(currentComment);
      } else if (currentTestCase && trimmed) {
        const [step, comment] = this.parseStepLine(trimmed);
        if (step) {
          currentTestCase.steps.push({ action: step, comment: comment || currentComment, workflow: this.determineWorkflow(step, currentTestCase.name) });
          currentComment = null;
        }
      }
    }
    if (currentTestCase) testCases.push(currentTestCase);
    return testCases;
  }

  parseStepLine(line) {
    if (line.startsWith("#")) return [null, null];
    const commentMatch = line.match(/^(.*?)\s*#\s*(.+)$/);
    if (commentMatch) return [commentMatch[1].trim(), commentMatch[2].trim()];
    return [line.trim(), null];
  }

  determineWorkflow(step, testCaseName) {
    const scenariosDir = join(process.cwd(), "tests", "scenarios");
    const available = [];
    if (existsSync(scenariosDir)) {
      readdirSync(scenariosDir).forEach((file) => {
        if (file.endsWith(".txt")) {
          const name = `${file.replace(".txt", "")}-flow`;
          available.push({ name, keywords: [file.replace(".txt", "").toLowerCase()] });
        }
      });
    }
    available.push({ name: "shared-actions", keywords: ["shared", "common", "通用", "共享"] });
    const stepLower = step.toLowerCase();
    for (const wf of available) {
      for (const kw of wf.keywords) {
        if (stepLower.includes(kw)) return wf.name;
      }
    }
    const caseLower = testCaseName.toLowerCase();
    for (const wf of available) {
      for (const kw of wf.keywords) {
        if (caseLower.includes(kw) && kw !== "shared" && kw !== "common") return wf.name;
      }
    }
    return "shared-actions";
  }

  async executeStep(stepInfo) { return await this.stepExecutor.executeStep(stepInfo); }

  async runTestCase(testCase) {
    this.currentTestCase = testCase.name;
    const caseResults = { name: testCase.name, steps: [], passed: true, startTime: Date.now() };
    console.log(`\n📋 开始测试: ${testCase.name}`);
    if (testCase.comments.length > 0) {
      console.log("   📝 用例说明:");
      testCase.comments.forEach((c) => console.log(`     - ${c}`));
    }
    for (const stepInfo of testCase.steps) {
      const r = await this.executeStep(stepInfo);
      caseResults.steps.push(r);
      if (!r.success) { caseResults.passed = false; caseResults.error = r.error; break; }
    }
    caseResults.endTime = Date.now();
    caseResults.duration = caseResults.endTime - caseResults.startTime;
    console.log(caseResults.passed ? `   ✅ 测试通过 (${caseResults.duration}ms)` : `   ❌ 测试失败 (${caseResults.duration}ms)`);
    this.results.push(caseResults);
    return caseResults;
  }
}

export function createTestSuite(textFilePath) {
  const runner = new TextTestRunner();
  const testCases = runner.parseTextScenario(textFilePath);
  const suiteName = `文本测试: ${textFilePath.split("/").pop().replace(".txt", "").replace(/^(.)/, (m) => m.toUpperCase())}`;
  return {
    runner,
    testCases,
    suiteName,
    async generateTests() {
      const { describe, test, beforeAll, afterAll, afterEach } = await import("vitest");
      describe(this.suiteName, () => {
        beforeAll(async () => { console.log(`\n🚀 初始化测试套件: ${this.suiteName}`); });
        afterEach(async () => {});
        afterAll(async () => { await runner.stagehandManager.closeAll(); });
        this.testCases.forEach((tc, i) => {
          test(`TC${i + 1}: ${tc.name}`, async () => {
            const result = await runner.runTestCase(tc);
            if (!result.passed) {
              const failed = result.steps.find((s) => !s.success);
              throw new Error(`测试失败: ${failed?.error || "未知错误"}\n失败步骤: ${failed?.action}`);
            }
          }, 120000);
        });
      });
    },
  };
}