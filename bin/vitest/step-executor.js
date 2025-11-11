'use strict'
// tests/vitest/step-executor.js
import { StepParser } from './step-parser.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export class StepExecutor {
  constructor(stagehandManager) {
    this.stagehandManager = stagehandManager;
    this.parser = new StepParser();
    this.extractedData = new Map(); // 存储提取的数据
    this.executionHistory = []; // 执行历史记录
    this.resultsDir = join(process.cwd(), 'results', 'extracted-data');
    
    // 确保结果目录存在
    if (!existsSync(this.resultsDir)) {
      mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  async executeStep(stepInfo) {
    const { action, workflow, comment } = stepInfo;
    
    const stagehand = await this.stagehandManager.getStagehandForWorkflow(workflow);
    const page = stagehand.context.pages()[0];
    
    const executionId = Date.now();
    const startTime = Date.now();
    
    try { 
      if (comment) {
        console.log(`   💡 ${comment}`);
      }
      
      // 解析步骤
      const stepConfig = this.parser.parseStep(action);
      
      // 验证步骤配置
      if (!this.parser.validateStepConfig(stepConfig)) {
        throw new Error(`步骤配置无效: ${JSON.stringify(stepConfig)}`);
      }
      
      console.log(`   🔄 执行 [${stepConfig.type}]: ${this.parser.describeStep(stepConfig)}`);
      
      let result;
      
      switch (stepConfig.type) {
        case 'goto':
          result = await this.executeGoto(stepConfig, page);
          break;
          
        case 'extract':
          result = await this.executeExtract(stepConfig, stagehand);
          break;
          
        case 'observe':
          result = await this.executeObserve(stepConfig, stagehand);
          break;
          
        case 'agent':
          result = await this.executeAgent(stepConfig, stagehand);
          break;
          
        default:
          result = await this.executeAct(stepConfig, stagehand);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // 记录执行历史
      const executionRecord = {
        id: executionId,
        stepConfig,
        result,
        duration,
        success: true,
        timestamp: new Date().toISOString(),
        workflow
      };
      
      this.executionHistory.push(executionRecord);
      
      console.log(`   ✅ 步骤执行成功 (${duration}ms)`);
      
      return { 
        success: true, 
        config: stepConfig,
        result,
        duration,
        workflow,
        executionId
      };
      
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // 记录失败历史
      const executionRecord = {
        id: executionId,
        stepConfig: this.parser.parseStep(action),
        error: error.message,
        duration,
        success: false,
        timestamp: new Date().toISOString(),
        workflow
      };
      
      this.executionHistory.push(executionRecord);
      
      console.log(`   ❌ 失败: ${action}`);
      console.log(`      错误: ${error.message}`);
      console.log(`      耗时: ${duration}ms`);
      
      return { 
        success: false, 
        action, 
        error: error.message,
        duration,
        workflow,
        executionId
      };
    }
  }

  async executeGoto(config, page) {
    const { url, action } = config.params;
    
    // 处理特殊导航操作
    if (action === '刷新' || action === '重新加载') {
      console.log(`   🔄 刷新页面`);
      await page.reload({ waitUntil: 'networkidle' });
      return { 
        type: 'goto',
        action: 'refresh',
        timestamp: new Date().toISOString()
      };
    }
    
    if (action === '返回' || action === '后退') {
      console.log(`   ↩️  返回上一页`);
      await page.goBack({ waitUntil: 'networkidle' });
      return { 
        type: 'goto', 
        action: 'go_back',
        timestamp: new Date().toISOString()
      };
    }
    
    // 正常URL导航
    let finalUrl = url;
    if (config.variables[url]) {
      finalUrl = config.variables[url];
    } else if (url.startsWith('%') && url.endsWith('%')) {
      const varName = url.slice(1, -1);
      finalUrl = config.variables[varName];
    }
    
    // 如果没有明确URL，使用基础URL
    if (!finalUrl || finalUrl.startsWith('%')) {
      finalUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
    }
    
    console.log(`   🌐 导航到: ${finalUrl}`);
    await page.goto(finalUrl, { waitUntil: 'networkidle' });
    
    // 获取页面标题用于验证
    const pageTitle = await page.title();
    
    return { 
      type: 'goto',
      url: finalUrl,
      pageTitle,
      timestamp: new Date().toISOString()
    };
  }

  async executeExtract(config, stagehand) {
    const { target, variable } = config.params;
    
    console.log(`   📊 提取: ${target}`);
    
    // 根据目标类型选择不同的提取策略
    let schema;
    if (target.includes('列表') || target.includes('表格') || target.includes('所有')) {
      schema = { 
        items: 'array',
        count: 'number',
        data: 'object'
      };
    } else if (target.includes('文本') || target.includes('内容') || target.includes('信息')) {
      schema = { 
        content: 'string',
        title: 'string',
        metadata: 'object'
      };
    } else if (target.includes('链接') || target.includes('URL')) {
      schema = {
        urls: 'array',
        links: 'object'
      };
    } else {
      schema = 'auto'; // 让 Stagehand 自动推断
    }
    
    const result = await stagehand.extract(target, schema);
    
    // 存储提取的数据
    const storageKey = variable || this.generateStorageKey(target);
    this.extractedData.set(storageKey, result);
    
    // 保存到文件（用于调试和后续分析）
    this.saveExtractedDataToFile(storageKey, result);
    
    console.log(`   💾 数据存储到: ${storageKey}`);
    console.log(`   📝 提取结果:`, JSON.stringify(result, null, 2));
    
    return {
      type: 'extract',
      target,
      storageKey,
      data: result,
      dataSize: JSON.stringify(result).length,
      timestamp: new Date().toISOString()
    };
  }

  async executeObserve(config, stagehand) {
    const { target } = config.params;
    
    console.log(`   👀 观察: ${target}`);
    const elements = await stagehand.observe(target);
    
    console.log(`   📍 找到 ${elements.length} 个元素`);
    
    if (elements.length > 0) {
      elements.forEach((element, index) => {
        const elementInfo = element.description || element.selector || '未知元素';
        console.log(`     ${index + 1}. ${elementInfo}`);
      });
    } else {
      console.log(`     ⚠️  未找到匹配元素`);
    }
    
    // 提取元素详细信息
    const elementDetails = elements.map((element, index) => ({
      index: index + 1,
      description: element.description,
      selector: element.selector,
      type: element.type,
      attributes: element.attributes || {}
    }));
    
    return {
      type: 'observe',
      target,
      elementsFound: elements.length,
      elements: elementDetails,
      timestamp: new Date().toISOString()
    };
  }

  async executeAgent(config, stagehand) {
    const { instruction } = config.params;
    
    console.log(`   🤖 智能执行: ${instruction}`);
    
    const agent = stagehand.agent({
      model: {
        modelName: "google/gemini-2.0-flash-exp",
        apiKey: process.env.GOOGLE_API_KEY
      },
      systemPrompt: "你是一个专业的网页自动化助手，能够准确执行用户指令并完成网页操作。"
    });
    
    const result = await agent.execute({
      instruction: instruction,
      maxSteps: 20,
      acceptUserFeedback: false
    });
    
    const stepsCount = result.steps?.length || 0;
    console.log(`   ✅ 代理完成 ${stepsCount} 个步骤`);
    
    if (result.error) {
      console.log(`   ⚠️  代理执行遇到错误: ${result.error}`);
    }
    
    return {
      type: 'agent',
      instruction,
      steps: stepsCount,
      result: result.result,
      error: result.error,
      completed: result.completed,
      timestamp: new Date().toISOString()
    };
  }

  async executeAct(config, stagehand) {
    const { params, variables } = config;
    
    // 构建 act 参数
    const actParams = {};
    if (Object.keys(variables).length > 0) {
      actParams.variables = variables;
    }
    
    // 添加额外的执行选项
    actParams.timeout = 30000;
    actParams.retries = 2;
    
    const result = await stagehand.act(config.originalText, actParams);
    
    return {
      type: 'act',
      action: config.originalText,
      params: config.params,
      result,
      timestamp: new Date().toISOString()
    };
  }

  generateStorageKey(target) {
    // 生成有意义的存储键名
    const cleanTarget = target.replace(/[^\w\u4e00-\u9fa5]/g, '_')
                             .replace(/_+/g, '_')
                             .toLowerCase();
    return `extracted_${cleanTarget}_${Date.now()}`;
  }

  saveExtractedDataToFile(key, data) {
    try {
      const filename = `${key}.json`;
      const filepath = join(this.resultsDir, filename);
      
      const fileData = {
        key,
        data,
        timestamp: new Date().toISOString(),
        metadata: {
          dataType: typeof data,
          dataSize: JSON.stringify(data).length,
          isArray: Array.isArray(data)
        }
      };
      
      writeFileSync(filepath, JSON.stringify(fileData, null, 2), 'utf8');
      console.log(`   💾 数据已保存到: ${filename}`);
    } catch (error) {
      console.error(`   ❌ 保存数据到文件失败: ${error.message}`);
    }
  }

  getExtractedData(key = null) {
    if (key) {
      return this.extractedData.get(key);
    }
    return Object.fromEntries(this.extractedData);
  }

  getExecutionHistory(limit = 50) {
    return this.executionHistory.slice(-limit);
  }

  // 获取步骤统计
  getStepStats() {
    const stats = {
      totalExecutions: this.executionHistory.length,
      successfulExecutions: this.executionHistory.filter(h => h.success).length,
      failedExecutions: this.executionHistory.filter(h => !h.success).length,
      executionTypes: {},
      extractedData: {
        total: this.extractedData.size,
        keys: Array.from(this.extractedData.keys())
      },
      averageDuration: 0
    };
    
    // 计算类型分布
    this.executionHistory.forEach(record => {
      const type = record.stepConfig?.type || 'unknown';
      stats.executionTypes[type] = (stats.executionTypes[type] || 0) + 1;
    });
    
    // 计算平均耗时
    const successfulRecords = this.executionHistory.filter(h => h.success && h.duration);
    if (successfulRecords.length > 0) {
      const totalDuration = successfulRecords.reduce((sum, record) => sum + record.duration, 0);
      stats.averageDuration = Math.round(totalDuration / successfulRecords.length);
    }
    
    // 计算成功率
    stats.successRate = stats.totalExecutions > 0 
      ? Math.round((stats.successfulExecutions / stats.totalExecutions) * 100) 
      : 0;
    
    return stats;
  }

  // 清空历史记录
  clearHistory() {
    this.executionHistory = [];
    this.extractedData.clear();
    console.log('🗑️  已清空执行历史和数据缓存');
  }

  // 导出数据
  exportData() {
    const exportData = {
      extractedData: this.getExtractedData(),
      executionHistory: this.getExecutionHistory(),
      stats: this.getStepStats(),
      exportTimestamp: new Date().toISOString(),
      version: '1.0'
    };
    
    const exportPath = join(this.resultsDir, `export_${Date.now()}.json`);
    writeFileSync(exportPath, JSON.stringify(exportData, null, 2), 'utf8');
    
    console.log(`📤 数据已导出到: ${exportPath}`);
    return exportPath;
  }

  // 获取最近执行的步骤
  getRecentSteps(limit = 10) {
    return this.executionHistory
      .slice(-limit)
      .map(record => ({
        type: record.stepConfig?.type,
        action: record.stepConfig?.originalText,
        success: record.success,
        duration: record.duration,
        timestamp: record.timestamp
      }));
  }
}