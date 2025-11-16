"use strict";

import { readFileSync, existsSync, readdirSync ,mkdirSync} from "fs";
import path, { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { StepExecutor } from "./executor/step-executor.js";
import StagehandManager from "../../setup/stagehand-setup.js";
import "../../setup/env-setup.js"; // 加载 .env 与测试凭据，提供 %TEST_*% 变量
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


function shallowStringify(obj, options = {}) {
    // 处理非对象类型
    if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj);
    }
    
    const result = {};
    const {
        maxDepth = 1,
        exclude = [],
        include = null,
        handleFunctions = 'skip', // 'skip', 'stringify', 'replace'
        handleUndefined = 'skip'  // 'skip', 'null'
    } = options;
    
    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            // 排除特定属性
            if (exclude.includes(key)) continue;
            
            // 如果指定了包含列表，只包含指定的属性
            if (include && !include.includes(key)) continue;
            
            const value = obj[key];
            
            // 处理不同类型的值
            if (value === undefined) {
                if (handleUndefined === 'null') {
                    result[key] = null;
                }
                // 如果 handleUndefined === 'skip'，则跳过
            } else if (typeof value === 'function') {
                if (handleFunctions === 'stringify') {
                    result[key] = value.toString();
                } else if (handleFunctions === 'replace') {
                    result[key] = '[Function]';
                }
                // 如果 handleFunctions === 'skip'，则跳过
            } else if (typeof value === 'object' && value !== null) {
                if (maxDepth > 1) {
                    // 递归处理，但减少深度
                    result[key] = JSON.parse(shallowStringify(value, {
                        ...options,
                        maxDepth: maxDepth - 1
                    }));
                } else {
                    // 达到最大深度，只显示类型信息
                    if (Array.isArray(value)) {
                        result[key] = `[Array: ${value.length} items]`;
                    } else if (value instanceof Date) {
                        result[key] = value.toISOString();
                    } else {
                        result[key] = `[Object: ${Object.keys(value).length} keys]`;
                    }
                }
            } else {
                // 基本类型直接赋值
                result[key] = value;
            }
        }
    }
    
    return JSON.stringify(result, null, options.space);
}

function determineWorkflow(textFilePath){
  const scenariosDir = resolve(process.env.TEST_CACHE_DIR || "cache");
  let lowFilename = path.basename(textFilePath).replace(/\.txt$/i, "").toLowerCase().toLowerCase();

  let workflow = lowFilename + "-flow";
  let workflowDir = path.join(scenariosDir, workflow);
  if (!existsSync(workflowDir)) {
    mkdirSync(workflowDir, { recursive: true });
  }

  return workflow;  
}

function createTestSuite(textFilePath) {
  const runner = new TextTestRunner();
  const workflow = determineWorkflow(textFilePath);
  const testCases = runner.parseTextScenario(textFilePath,workflow);
  const suiteName = `文本测试: ${textFilePath.split("/").pop().replace(/\.txt$/i, "").replace(/^(.)/, (m) => m.toUpperCase())}`;
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
            const result = await runner.runTestCase(runnerContext,tc);
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

function generateTestSuite(textFilePath,templateConfig) {
  const runner = new TextTestRunner();
  const workflow = determineWorkflow(textFilePath);
  const testCases = runner.parseTextScenario(textFilePath,workflow);
  const suiteName = `文本测试: ${textFilePath.split("/").pop().replace(".txt", "").replace(/^(.)/, (m) => m.toUpperCase())}`;
  const testContent = [];


  const test_template_each = [];
  testCases.forEach((testCase, index) => {
      const templateEachVal = {testcase: testCase, index: index + 1, "testcase:name": testCase.name, "testcase:jsonstring": JSON.stringify(testCase)};
      test_template_each.push(templateConfig.translation.test_template_each.replace(/\$\{[\w:]+\}/g, (match) => {
        const key = match.replace(/^\$\{|\}$/g, "");
        return templateEachVal[key] || match;
      }));

      // testContent.push(`  test("TC${index + 1}: ${testCase.name}", async () => {`);
      // testContent.push(`    const result = await runner.runTestCase(this,${JSON.stringify(testCase)});`);
      // testContent.push(`    if (!result.passed) {`);
      // testContent.push(`      const failed = result.steps.find((s) => !s.success);`);
      // testContent.push(`      throw new Error(\`测试失败: \${failed?.error || "未知错误"}\\n失败步骤: \${failed?.action}\`);`);
      // testContent.push(`    }`);
      // testContent.push(`  }, 120000);`);


   });

  const templateVal = {"suite:name": suiteName, test_template_each: test_template_each.join("\n")}

  testContent.push(templateConfig.translation.test_template.replace(/\$\{[\w:]+\}/g, (match) => {
    const key = match.replace(/^\$\{|\}$/g, "");
    return templateVal[key] || match;
  }));

  // testContent.push(`import { describe, test, beforeAll, afterAll, afterEach, expect } from "vitest";`);
  // testContent.push(`import { TextTestRunner} from "../../bin/itest/core/test-runner.js";`);
  // testContent.push(`import fs from "fs";`);
  // testContent.push(`import path from "path";`);
  // testContent.push(`import { z } from "zod";`);
  // testContent.push(`const runner = new TextTestRunner();`);
  // testContent.push(`describe("${suiteName}", () => {`);
  // testContent.push(`  beforeAll(async () => { console.log("\\n🚀 初始化测试套件: ${suiteName}"); });`);
  // testContent.push(`  afterEach(async () => {});`);
  // testContent.push(`  afterAll(async () => { await runner.stagehandManager.closeAll(); });`);
  // testCases.forEach((testCase, index) => {
  //     testContent.push(`  test("TC${index + 1}: ${testCase.name}", async () => {`);
  //     testContent.push(`    const result = await runner.runTestCase(this,${JSON.stringify(testCase)});`);
  //     testContent.push(`    if (!result.passed) {`);
  //     testContent.push(`      const failed = result.steps.find((s) => !s.success);`);
  //     testContent.push(`      throw new Error(\`测试失败: \${failed?.error || "未知错误"}\\n失败步骤: \${failed?.action}\`);`);
  //     testContent.push(`    }`);
  //     testContent.push(`  }, 120000);`);


  //  });
  //  testContent.push(`});`);
   return testContent.join("\n");
}

class TextTestRunner {
  constructor() {
    this.stagehandManager = new StagehandManager();
    this.stepExecutor = new StepExecutor();
    this.results = [];
    this.currentTestCase = null;
  }

  parseTextScenario(filePath,workflow) {
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
          currentTestCase.steps.push({ action: step, comment: comment || currentComment, workflow: workflow });
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

  // determineWorkflow(step, testCaseName) {
  //   const scenariosDir = join(process.cwd(), "tests", "scenarios");
  //   const available = [];
  //   if (existsSync(scenariosDir)) {
  //     readdirSync(scenariosDir).forEach((file) => {
  //       if (file.endsWith(".txt")) {
  //         const name = `${file.replace(".txt", "")}-flow`;
  //         available.push({ name, keywords: [file.replace(".txt", "").toLowerCase()] });
  //       }
  //     });
  //   }
  //   available.push({ name: "shared-actions", keywords: ["shared", "common", "通用", "共享"] });
  //   const stepLower = step.toLowerCase();
  //   for (const wf of available) {
  //     for (const kw of wf.keywords) {
  //       if (stepLower.includes(kw)) return wf.name;
  //     }
  //   }
  //   const caseLower = testCaseName.toLowerCase();
  //   for (const wf of available) {
  //     for (const kw of wf.keywords) {
  //       if (caseLower.includes(kw) && kw !== "shared" && kw !== "common") return wf.name;
  //     }
  //   }
  //   return "shared-actions";
  // }

  async executeStep(runnerContext,stepInfo) { 

    const r = await this.stepExecutor.executeStep(runnerContext,stepInfo); 
    r.result = r.result ? shallowStringify(r.result, {
        maxDepth : 2,
        exclude :[],
        include : null,
        handleFunctions :'skip', // 'skip', 'stringify', 'replace'
        handleUndefined : 'skip'  // 'skip', 'null'
    }): undefined;
    return r;
  }

  async runTestCase(runnerContext, testCase) {
    this.currentTestCase = testCase.name;
    const caseResults = { name: testCase.name, steps: [], passed: true, startTime: Date.now() };
    console.log(`\n📋 开始测试: ${testCase.name}`);
    if (testCase.comments.length > 0) {
      console.log("   📝 用例说明:");
      testCase.comments.forEach((c) => console.log(`     - ${c}`));
    }
    for (const stepInfo of testCase.steps) {
      const r = await this.executeStep(runnerContext,stepInfo);
      caseResults.steps.push(r);
      if (!r.success) { 
        caseResults.passed = false;
        caseResults.error = r.error; 
        break; 
      }
    }
    caseResults.endTime = Date.now();
    caseResults.duration = caseResults.endTime - caseResults.startTime;
    console.log(caseResults.passed ? `   ✅ 测试通过 (${caseResults.duration}ms)` : `   ❌ 测试失败 (${caseResults.duration}ms)`);
    this.results.push(caseResults);
    return caseResults;
  }
}

export { createTestSuite ,generateTestSuite,TextTestRunner ,shallowStringify ,determineWorkflow};