"use strict";

import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { Translator } from "../translator/index.js";
import StagehandManager from "../../../setup/stagehand-setup.js";
import { z } from "zod";

export class StepExecutor {
  constructor() {
    this.translator = new Translator();
    this.stagehandManager = new StagehandManager();
    this.executionHistory = [];
    this.resultsDir = join(process.cwd(), "results");
    if (!existsSync(this.resultsDir)) mkdirSync(this.resultsDir, { recursive: true });
  }

  async getStagehandForWorkflow(workflow) {
    return await this.stagehandManager.getStagehandForWorkflow(workflow);
  }

  async executeStep(stepInfo) {
    const { action, workflow, comment } = stepInfo;
    const stagehand = await this.getStagehandForWorkflow(workflow);
    const page = stagehand.context.pages()[0];

    const expandedAction = this._expandEnv(action);
    const translation = this.translator.translate(expandedAction);
    // 针对 URL 导航类规则，先对 URL 参数进行清洗并重新渲染代码
    if (translation.engine === "rules" && (translation.matchedRule || "").startsWith("goto_url")) {
      const cleanedUrl = this._sanitizeUrlParam(translation.params?.url);
      if (cleanedUrl) {
        translation.params.url = cleanedUrl;
        if (translation.template) {
          translation.code = this.translator.renderTemplate(translation.template, translation.params);
        }
      }
    }
    const start = Date.now();
    try {
      if (comment) console.log(`   💡 ${comment}`);
      console.log(`   🔄 执行 [${translation.type}]: ${expandedAction}`);
      if (translation.engine === "rules") {
        console.log(`      📐 规则: ${translation.matchedRule}`);
        if (translation.matchedPattern) {
          console.log(`      🔎 模式: ${translation.matchedPattern}`);
        }
        console.log(`      🧩 参数: ${JSON.stringify(translation.params || {}, null, 2)}`);
        const codePreview = (translation.code || "").toString();
        console.log(`      🧪 生成代码片段:\n${codePreview}`);
      }
      let result;

      if (translation.engine === "rules") {
        // Evaluate template code string inside an async function with context
        const runner = new Function(
          "stagehand",
          "z",
          "expect",
          "page",
          `return (async () => { ${translation.code} })();`
        );
        // 提供一个轻量 expect shim，避免在非 Vitest 环境直接导入 Vitest
        const expectShim = (actual) => ({
          toBe(expected) {
            if (actual !== expected) throw new Error(`expected ${actual} to be ${expected}`);
          },
          toEqual(expected) {
            const a = JSON.stringify(actual);
            const b = JSON.stringify(expected);
            if (a !== b) throw new Error(`expected ${a} to equal ${b}`);
          },
        });
        result = await runner(stagehand, z, expectShim, page);
      } else if (translation.engine === "agent") {
        const agent = stagehand.agent({
          systemPrompt: "你是一个专业的网页自动化助手，能够准确执行用户指令并完成网页操作。",
        });
        const res = await agent.execute({ instruction: translation.code, maxSteps: 20, acceptUserFeedback: false });
        result = { steps: res.steps?.length || 0, result: res.result, error: res.error, completed: res.completed };
      } else {
        // Default to act if unknown
        result = await stagehand.act(action, { timeout: 30000, retries: 2 });
      }

      const duration = Date.now() - start;
      this.executionHistory.push({ action, type: translation.type, success: true, duration, workflow, timestamp: new Date().toISOString() });
      console.log(`   ✅ 步骤执行成功 (${duration}ms)`);
      return { success: true, action, type: translation.type, result, duration, workflow };
    } catch (error) {
      const duration = Date.now() - start;
      // 增强错误输出，包含规则、模式、参数与代码片段，便于快速定位
      let detailedMessage = error?.message || String(error);
      if (translation.engine === "rules") {
        const context = [
          `规则: ${translation.matchedRule || "(未知)"}`,
          translation.matchedPattern ? `模式: ${translation.matchedPattern}` : null,
          `参数: ${JSON.stringify(translation.params || {}, null, 2)}`,
          `代码片段:\n${(translation.code || "").toString()}`,
        ].filter(Boolean).join("\n");
        detailedMessage = `规则执行失败:\n${context}\n原始错误: ${detailedMessage}`;
      }
      this.executionHistory.push({ action, type: translation.type, success: false, error: detailedMessage, duration, workflow, timestamp: new Date().toISOString() });
      console.log(`   ❌ 失败: ${action}`);
      console.log(`      错误: ${detailedMessage}`);
      return { success: false, action, type: translation.type, error: detailedMessage, duration, workflow };
    }
  }

  _expandEnv(text) {
    return text.replace(/%(\w+)%/g, (_, name) => {
      const v = process.env[name];
      return typeof v === "string" && v.length > 0 ? v : `%${name}%`;
    });
  }

  _sanitizeUrlParam(value) {
    if (!value || typeof value !== "string") return value;
    let v = value.trim();
    // 去除反引号或引号包裹
    if ((v.startsWith("`") && v.endsWith("`")) || (v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
      v = v.slice(1, -1).trim();
    }
    // 从文本中提取第一个 URL（修复“登录页面 https://...”这类混合文本）
    const m = v.match(/https?:\/\/[^\s'"\)]+/);
    if (m) {
      v = m[0];
      // 校验格式
      try { new URL(v); return v; } catch { /* fallthrough */ }
    }
    // 若未匹配到 URL，保留原值（可能包含未展开的占位符），供后续环境扩展或报错信息使用
    return v;
  }
}