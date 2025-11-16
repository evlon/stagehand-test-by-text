import { TextTestRunner} from "../../bin/itest/core/test-runner.js";
import runnerContext from "../debug/runner-context.js";
import {expect} from "vitest";
runnerContext.expect =expect;
const runner = new TextTestRunner();
describe("文本测试: Test", () => {
  beforeAll(async () => { console.log("\n🚀 初始化测试套件: 文本测试: Test"); });
  afterEach(async () => {});
  afterAll(async () => { await runner.stagehandManager.closeAll(); });
  test("TC1: 测试用例: 百度测试", async () => {
    const result = await runner.runTestCase(runnerContext,{"name":"测试用例: 百度测试","steps":[{"action":"打开https://www.baidu.com","comment":null,"workflow":"test-flow"},{"action":"点击登录按钮","comment":"断言:找到登录","workflow":"test-flow"},{"action":"截屏保存为baidu.png","comment":null,"workflow":"test-flow"}],"comments":["断言:找到登录"]});
    if (!result.passed) {
      const failed = result.steps.find((s) => !s.success);
      throw new Error(`测试失败: ${failed?.error || "未知错误"}\n失败步骤: ${failed?.action}`);
    }
  }, 120000);

});
