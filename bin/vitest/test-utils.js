'use strict'
import { readFileSync, existsSync, rmSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { describe, test, beforeAll, afterAll, afterEach } from "vitest";
import { StepExecutor } from "./step-executor.js";
import StagehandManager from "../setup/stagehand-setup.js";
import "../setup/env-setup.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class TextTestRunner {
  constructor() {
    this.stagehandManager = new StagehandManager();
    this.stepExecutor = new StepExecutor(this.stagehandManager);
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
        currentTestCase = {
          name: trimmed.replace("## ", ""),
          steps: [],
          comments: [],
        };
        currentComment = null;
      } else if (trimmed.startsWith("# ") && currentTestCase) {
        currentComment = trimmed.replace("# ", "");
        currentTestCase.comments.push(currentComment);
      } else if (currentTestCase && trimmed) {
        const [step, comment] = this.parseStepLine(trimmed);
        if (step) {
          currentTestCase.steps.push({
            action: step,
            comment: comment || currentComment,
            workflow: this.determineWorkflow(step, currentTestCase.name),
          });
          currentComment = null;
        }
      }
    }

    if (currentTestCase) testCases.push(currentTestCase);
    return testCases;
  }

  parseStepLine(line) {
    if (line.startsWith("#")) return [null, null];

    const commentMatch = line.match(/^(.+?)\s*#\s*(.+)$/);
    if (commentMatch) {
      return [commentMatch[1].trim(), commentMatch[2].trim()];
    }

    return [line.trim(), null];
  }

  determineWorkflow(step, testCaseName) {
    const stepLower = step.toLowerCase();

    // 自动扫描 scenarios 目录获取可用的工作流
    const scenariosDir = join(process.cwd(), "tests", "scenarios");
    const availableWorkflows = [];

    if (existsSync(scenariosDir)) {
      const files = readdirSync(scenariosDir);
      files.forEach((file) => {
        if (file.endsWith(".txt")) {
          const workflowName = `${file.replace(".txt", "")}-flow`;
          availableWorkflows.push({
            name: workflowName,
            keywords: [file.replace(".txt", "").toLowerCase()],
          });
        }
      });
    }

    // 添加共享操作工作流
    availableWorkflows.push({
      name: "shared-actions",
      keywords: ["shared", "common", "通用", "共享"],
    });

    // 动态匹配工作流
    for (const workflow of availableWorkflows) {
      for (const keyword of workflow.keywords) {
        if (stepLower.includes(keyword)) {
          console.log(`   🔍 步骤 "${step}" 匹配到工作流: ${workflow.name}`);
          return workflow.name;
        }
      }
    }

    // 如果测试用例名称包含场景信息，尝试匹配
    const testCaseLower = testCaseName.toLowerCase();
    for (const workflow of availableWorkflows) {
      for (const keyword of workflow.keywords) {
        if (
          testCaseLower.includes(keyword) &&
          keyword !== "shared" &&
          keyword !== "common"
        ) {
          console.log(
            `   🔍 测试用例 "${testCaseName}" 匹配到工作流: ${workflow.name}`
          );
          return workflow.name;
        }
      }
    }

    // 默认使用共享操作工作流
    console.log(`   🔍 步骤 "${step}" 未匹配到特定工作流，使用共享操作`);
    return "shared-actions";
  }

  async executeStep(stepInfo) {
    return await this.stepExecutor.executeStep(stepInfo); 
  }
  async runTestCase(testCase) {
    this.currentTestCase = testCase.name;
    const caseResults = {
      name: testCase.name,
      steps: [],
      passed: true,
      startTime: Date.now(),
      extractedData: {},
    };

    console.log(`\n📋 开始测试: ${testCase.name}`);

    if (testCase.comments.length > 0) {
      console.log("   📝 用例说明:");
      testCase.comments.forEach((comment) => console.log(`     - ${comment}`));
    }

    for (const stepInfo of testCase.steps) {
      const stepResult = await this.executeStep(stepInfo);
      caseResults.steps.push(stepResult);

      if (!stepResult.success) {
        caseResults.passed = false;
        caseResults.error = stepResult.error;
        break;
      }
    }

    caseResults.endTime = Date.now();
    caseResults.duration = caseResults.endTime - caseResults.startTime;
    caseResults.extractedData = this.stepExecutor.getExtractedData();

    if (caseResults.passed) {
      console.log(`   ✅ 测试通过 (${caseResults.duration}ms)`);
      console.log(`   📊 提取数据:`, this.stepExecutor.getStepStats());
    } else {
      console.log(`   ❌ 测试失败 (${caseResults.duration}ms)`);
    }

    this.results.push(caseResults);
    return caseResults;
  }

  // 获取提取的数据
  getExtractedData(key = null) {
    return this.stepExecutor.getExtractedData(key);
  }

  getStats() {
    const totalCases = this.results.length;
    const passedCases = this.results.filter((r) => r.passed).length;
    const totalSteps = this.results.reduce((sum, r) => sum + r.steps.length, 0);
    const passedSteps = this.results.reduce(
      (sum, r) => sum + r.steps.filter((s) => s.success).length,
      0
    );

    return {
      totalCases,
      passedCases,
      failedCases: totalCases - passedCases,
      totalSteps,
      passedSteps,
      successRate:
        totalCases > 0 ? ((passedCases / totalCases) * 100).toFixed(1) : 0,
    };
  }

  getCacheStats() {
    return this.stagehandManager.getCacheStats();
  }

  clearCache(workflowName) {
    if (workflowName) {
      this.stagehandManager.clearCache(workflowName);
    } else {
      this.stagehandManager.clearAllCache();
    }
  }

  async cleanup() {
    await this.stagehandManager.closeAll();
  }
}

export function createTestSuite(textFilePath) {
  const runner = new TextTestRunner();
  const testCases = runner.parseTextScenario(textFilePath);
  const suiteName = `文本测试: ${
    textFilePath.split("/").pop().replace(".txt", "").charAt(0).toUpperCase() +
    textFilePath.split("/").pop().replace(".txt", "").slice(1)
  }`;

  const suite = {
    runner,
    testCases,
    suiteName,

    generateTests() {
      describe(this.suiteName, () => {
        beforeAll(async () => {
          console.log(`\n🚀 初始化测试套件: ${this.suiteName}`);
          const cacheStats = this.runner.getCacheStats();
          console.log("📊 初始缓存统计:");
          Object.entries(cacheStats).forEach(([workflow, stats]) => {
            console.log(`   ${workflow}: ${stats.cachedActions} 动作`);
          });
        });

        afterEach(async () => {
          // 可在此处添加截图或其他清理操作
        });

        afterAll(async () => {
          await this.runner.cleanup();
          const stats = this.runner.getStats();
          console.log(`\n📊 ${this.suiteName} 统计:`);
          console.log(`   通过: ${stats.passedCases}/${stats.totalCases}`);
          console.log(`   成功率: ${stats.successRate}%`);
        });

        this.testCases.forEach((testCase, index) => {
          test(`TC${index + 1}: ${testCase.name}`, async () => {
            const result = await this.runner.runTestCase(testCase);

            if (!result.passed) {
              const failedStep = result.steps.find((step) => !step.success);
              throw new Error(
                `测试失败: ${failedStep?.error || "未知错误"}\n失败步骤: ${
                  failedStep?.action
                }`
              );
            }
          }, 120000);
        });
      });
    },
  };

  return suite;
}

// 命令行接口支持
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  const runner = new TextTestRunner();

  switch (command) {
    case "stats":
      console.log("📊 Stagehand 缓存统计\n");
      const stats = runner.getCacheStats();
      if (Object.keys(stats).length === 0) {
        console.log("暂无缓存数据");
      } else {
        Object.entries(stats).forEach(([workflow, workflowStats]) => {
          console.log(`🏷️  ${workflow}:`);
          console.log(`   缓存动作数: ${workflowStats.cachedActions}`);
          console.log(`   缓存大小: ${workflowStats.totalSize}`);
          if (workflowStats.error) {
            console.log(`   错误: ${workflowStats.error}`);
          }
        });

        const totalActions = Object.values(stats).reduce(
          (sum, s) => sum + s.cachedActions,
          0
        );
        console.log(`\n📈 总计: ${totalActions} 个缓存动作`);
      }
      break;

    case "clear":
      const workflow = process.argv[3];
      runner.clearCache(workflow);
      if (workflow) {
        console.log(`✅ 已清除 ${workflow} 工作流缓存`);
      } else {
        console.log("✅ 已清除所有缓存");
      }
      break;

    default:
      console.log("Stagehand 缓存管理工具");
      console.log("用法: node test-utils.js <command>");
      console.log("\n命令:");
      console.log("  stats                    - 查看缓存统计");
      console.log("  clear                   - 清除所有缓存");
      console.log("  clear <workflow>        - 清除指定工作流缓存");
      console.log("\n可用工作流:");
      console.log("  login-flow              - 登录流程");
      console.log("  dashboard-flow          - 仪表板流程");
      console.log("  user-registration-flow  - 用户注册流程");
  }

  runner.cleanup().catch(console.error);
}
