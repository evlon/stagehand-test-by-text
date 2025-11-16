import { describe, test, beforeAll, afterAll, afterEach } from "vitest";
import { TextTestRunner} from "../../bin/itest/core/test-runner.js";
const runner = new TextTestRunner();
describe("文本测试: Login", () => {
  beforeAll(async () => { console.log("\n🚀 初始化测试套件: 文本测试: Login"); });
  afterEach(async () => {});
  afterAll(async () => { await runner.stagehandManager.closeAll(); });
  test("TC1: 测试用例: 成功登录", async () => {
    const result = await runner.runTestCase({"name":"测试用例: 成功登录","steps":[{"action":"打开登录页面%TEST_BASE_URL%","comment":"使用有效凭据测试正常登录流程","workflow":"login-flow"},{"action":"等待登录可见","comment":null,"workflow":"login-flow"},{"action":"在用户名输入框中输入 %TEST_USER_NAME%","comment":null,"workflow":"login-flow"},{"action":"在密码输入框中输入 %TEST_USER_PASSWORD%","comment":null,"workflow":"login-flow"},{"action":"点击登录按钮","comment":null,"workflow":"login-flow"},{"action":"检查页面是否包含文本 工作台","comment":null,"workflow":"login-flow"},{"action":"截图保存为 登录成功状态","comment":null,"workflow":"login-flow"}],"comments":["使用有效凭据测试正常登录流程"]});
    if (!result.passed) {
      const failed = result.steps.find((s) => !s.success);
      throw new Error(`测试失败: ${failed?.error || "未知错误"}\n失败步骤: ${failed?.action}`);
    }
  }, 120000);
});