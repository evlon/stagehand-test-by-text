import { describe, test, beforeAll, afterAll, afterEach } from "vitest";
import { TextTestRunner} from "../../bin/itest/core/test-runner.js";
const runner = new TextTestRunner();
describe("文本测试: Test", () => {
  beforeAll(async () => { console.log("\n🚀 初始化测试套件: 文本测试: Test"); });
  afterEach(async () => {});
  afterAll(async () => { await runner.stagehandManager.closeAll(); });
  test("TC1: 测试用例: 百度测试", async () => {
    const result = await runner.runTestCase({"name":"测试用例: 百度测试","steps":[{"action":"打开https://www.baidu.com","comment":null,"workflow":"test-flow"},{"action":"观察:登录","comment":null,"workflow":"test-flow"},{"action":"点击登录","comment":null,"workflow":"test-flow"}],"comments":[]});
    if (!result.passed) {
      const failed = result.steps.find((s) => !s.success);
      throw new Error(`测试失败: ${failed?.error || "未知错误"}\n失败步骤: ${failed?.action}`);
    }
  }, 120000);
});