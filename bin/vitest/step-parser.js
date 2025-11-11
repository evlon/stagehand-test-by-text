// tests/vitest/step-parser.js
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class StepParser {
  constructor() {
    // 1. 内置核心模式（确保基础功能）
    this.builtinPatterns = this.getBuiltinPatterns();
    
    // 2. 加载用户扩展模式（可选）
    this.customPatterns = this.loadCustomPatterns();
    
    // 3. 合并模式（内置优先）
    this.patterns = this.mergePatterns();
    
    console.log('✅ StepParser 初始化完成');
    this.printPatternStats();
  }

  getBuiltinPatterns() {
    return {
      goto: [
        { 
          name: "basic_navigation",
          pattern: /^(打开|访问|导航到).*?\s+(https?:\/\/.+)$/, 
          groups: ['action', 'url'],
          builtin: true,
          priority: 100,
          description: "基本导航操作"
        },
        { 
          name: "simple_goto",
          pattern: /^转到.*?\s+(https?:\/\/.+)$/, 
          groups: ['url'],
          builtin: true, 
          priority: 100,
          description: "简单导航"
        },
        { 
          name: "refresh_page",
          pattern: /^(刷新|重新加载)(?:\s+页面)?.*?\s+(https?:\/\/.+)$/,
          groups: ['action','url'],
          builtin: true,
          priority: 100,
          description: "刷新页面"
        },
        { 
          name: "go_back",
          pattern: /^(返回|后退)(?:\s+页面)?.*?\s+(https?:\/\/.+)$/,
          groups: ['action','url'],
          builtin: true,
          priority: 100,
          description: "返回上一页"
        }
      ],
      
      extract: [
        {
          name: "extract_with_variable", 
          pattern: /^提取\s+(.+?)(?:到变量\s+(\w+))?$/,
          groups: ['target', 'variable'],
          builtin: true,
          priority: 100,
          description: "提取数据到变量"
        },
        {
          name: "get_and_save",
          pattern: /^获取\s+(.+?)(?:并保存为\s+(\w+))?$/,
          groups: ['target', 'variable'],
          builtin: true,
          priority: 100,
          description: "获取并保存数据"
        },
        {
          name: "read_data",
          pattern: /^读取\s+(.+?)(?:存储到\s+(\w+))?$/,
          groups: ['target', 'variable'],
          builtin: true,
          priority: 100,
          description: "读取数据"
        },
        {
          name: "capture_text",
          pattern: /^捕获\s+(.+?)(?:文本)?(?:\s+到\s+(\w+))?$/,
          groups: ['target', 'variable'],
          builtin: true,
          priority: 90,
          description: "捕获文本内容"
        }
      ],
      
      observe: [
        {
          name: "find_elements",
          pattern: /^查找\s+(.+)$/,
          groups: ['target'],
          builtin: true,
          priority: 100,
          description: "查找元素"
        },
        {
          name: "observe_elements",
          pattern: /^观察\s+(.+)$/,
          groups: ['target'],
          builtin: true,
          priority: 100,
          description: "观察元素"
        },
        {
          name: "check_elements",
          pattern: /^检查\s+(.+?)(?:元素)?$/,
          groups: ['target'],
          builtin: true,
          priority: 100,
          description: "检查元素"
        },
        {
          name: "scan_page",
          pattern: /^扫描\s+(.+)$/,
          groups: ['target'],
          builtin: true,
          priority: 90,
          description: "扫描页面"
        }
      ],
      
      agent: [
        {
          name: "execute_task",
          pattern: /^执行任务\s+(.+)$/,
          groups: ['instruction'],
          builtin: true,
          priority: 100,
          description: "执行代理任务"
        },
        {
          name: "smart_execute",
          pattern: /^智能执行\s+(.+)$/,
          groups: ['instruction'],
          builtin: true,
          priority: 100,
          description: "智能执行"
        },
        {
          name: "automate_workflow",
          pattern: /^自动化\s+(.+)$/,
          groups: ['instruction'],
          builtin: true,
          priority: 100,
          description: "自动化工作流"
        },
        {
          name: "ai_assist",
          pattern: /^AI辅助\s+(.+)$/,
          groups: ['instruction'],
          builtin: true,
          priority: 90,
          description: "AI辅助执行"
        }
      ],
      
      act: [
        {
          name: "input_text",
          pattern: /^在\s+(.+?)\s+中输入\s+(.+)$/,
          groups: ['element', 'value'],
          builtin: true,
          priority: 100,
          description: "在元素中输入文本"
        },
        {
          name: "click_element",
          pattern: /^点击\s+(.+)$/,
          groups: ['element'],
          builtin: true,
          priority: 100,
          description: "点击元素"
        },
        {
          name: "select_option",
          pattern: /^选择\s+(.+?)\s+中的\s+(.+)$/,
          groups: ['dropdown', 'option'],
          builtin: true,
          priority: 100,
          description: "选择下拉选项"
        },
        {
          name: "select_from_dropdown",
          pattern: /^从\s+(.+?)\s+中选择\s+(.+)$/,
          groups: ['dropdown', 'option'],
          builtin: true,
          priority: 100,
          description: "从下拉框选择"
        },
        {
          name: "check_contains",
          pattern: /^检查\s+(.+?)\s+是否包含\s+(.+)$/,
          groups: ['element', 'expected'],
          builtin: true,
          priority: 100,
          description: "检查元素是否包含文本"
        },
        {
          name: "verify_display",
          pattern: /^验证\s+(.+?)\s+显示\s+(.+)$/,
          groups: ['element', 'expected'],
          builtin: true,
          priority: 100,
          description: "验证元素显示内容"
        },
        {
          name: "wait_for_element",
          pattern: /^等待\s+(.+?)\s+出现$/,
          groups: ['element'],
          builtin: true,
          priority: 100,
          description: "等待元素出现"
        },
        {
          name: "take_screenshot",
          pattern: /^截图\s+(.+)$/,
          groups: ['name'],
          builtin: true,
          priority: 100,
          description: "截图保存"
        },
        {
          name: "clear_input",
          pattern: /^清空\s+(.+)$/,
          groups: ['element'],
          builtin: true,
          priority: 90,
          description: "清空输入框"
        },
        {
          name: "hover_element",
          pattern: /^悬停\s+(.+)$/,
          groups: ['element'],
          builtin: true,
          priority: 90,
          description: "鼠标悬停"
        },
        {
          name: "scroll_to_element",
          pattern: /^滚动到\s+(.+)$/,
          groups: ['element'],
          builtin: true,
          priority: 90,
          description: "滚动到元素"
        }
      ]
    };
  }

  loadCustomPatterns() {
    const configPath = join(process.cwd(), 'tests', 'config', 'step-patterns.yaml');
    
    if (!existsSync(configPath)) {
      console.log('⚠️  未找到自定义模式配置，使用内置模式');
      return {};
    }
    
    try {
      const configContent = readFileSync(configPath, 'utf8');
      const config = yaml.load(configContent);
      console.log(`✅ 加载自定义模式: ${Object.keys(config.patterns || {}).length} 个类别`);
      return config.patterns || {};
    } catch (error) {
      console.error('❌ 加载自定义模式失败:', error.message);
      return {};
    }
  }

  mergePatterns() {
    const merged = {};
    
    // 合并所有操作类型
    const allTypes = new Set([
      ...Object.keys(this.builtinPatterns),
      ...Object.keys(this.customPatterns)
    ]);
    
    for (const type of allTypes) {
      const builtin = this.builtinPatterns[type] || [];
      const custom = this.customPatterns[type] || [];
      
      // 合并并排序（优先级高的在前）
      merged[type] = [...builtin, ...custom].sort((a, b) => {
        return (b.priority || 0) - (a.priority || 0);
      });
    }
    
    return merged;
  }

  printPatternStats() {
    let totalPatterns = 0;
    console.log('\n📊 步骤模式统计:');
    
    for (const [type, patterns] of Object.entries(this.patterns)) {
      const builtinCount = patterns.filter(p => p.builtin).length;
      const customCount = patterns.length - builtinCount;
      
      console.log(`   ${type.padEnd(10)}: ${patterns.length} 个模式 (${builtinCount} 内置, ${customCount} 自定义)`);
      totalPatterns += patterns.length;
    }
    
    console.log(`   总计: ${totalPatterns} 个步骤模式\n`);
  }

  parseStep(stepText) {
    const originalText = stepText.trim();
    
    if (!originalText) {
      return this.createFallbackConfig(originalText, '空步骤');
    }
    
    const variables = this.extractVariables(originalText);
    const textWithoutVars = this.replaceVariables(originalText);
    
    // 尝试匹配每种操作类型
    for (const [type, patterns] of Object.entries(this.patterns)) {
      for (const patternConfig of patterns) {
        const regex = this.compilePattern(patternConfig.pattern);
        const match = textWithoutVars.match(regex);
        
        if (match) {
          const params = this.buildParams(match, patternConfig.groups, variables);
          
          return {
            type,
            originalText,
            parsedText: textWithoutVars,
            params,
            variables,
            patternName: patternConfig.name,
            patternDescription: patternConfig.description,
            isBuiltin: patternConfig.builtin || false,
            priority: patternConfig.priority || 0,
            timestamp: new Date().toISOString()
          };
        }
      }
    }
    
    // 默认回退到 act
    return this.createFallbackConfig(originalText, textWithoutVars, variables);
  }

  createFallbackConfig(originalText, textWithoutVars, variables = {}) {
    return {
      type: 'act',
      originalText,
      parsedText: textWithoutVars,
      params: { raw: textWithoutVars },
      variables,
      patternName: 'default_fallback',
      patternDescription: '默认回退到直接执行',
      isBuiltin: true,
      priority: 0,
      timestamp: new Date().toISOString()
    };
  }

  extractVariables(text) {
    const variables = {};
    const varMatches = text.match(/%(\w+)%/g) || [];
    
    varMatches.forEach(variable => {
      const varName = variable.slice(1, -1);
      variables[varName] = process.env[varName] || `%${varName}%`;
    });
    
    return variables;
  }

  replaceVariables(text) {
    return text.replace(/%(\w+)%/g, (match, varName) => {
      return process.env[varName] || match;
    });
  }

  compilePattern(pattern) {
    if (pattern instanceof RegExp) {
      return pattern;
    }
    
    // 处理字符串模式，添加开始和结束锚点
    let patternStr = pattern;
    if (!patternStr.startsWith('^')) patternStr = '^' + patternStr;
    if (!patternStr.endsWith('$')) patternStr = patternStr + '$';
    
    return new RegExp(patternStr);
  }

  buildParams(match, groups, variables) {
    const params = {};
    
    groups.forEach((groupName, index) => {
      if (match[index + 1]) {
        params[groupName] = match[index + 1].trim();
      }
    });
    
    // 添加变量信息
    if (Object.keys(variables).length > 0) {
      params._variables = { ...variables };
    }
    
    // 添加原始匹配组用于调试
    params._matchGroups = match.slice(1);
    
    return params;
  }

  // 验证步骤配置
  validateStepConfig(config) {
    const validations = {
      goto: (params) => {
        if (params.url) return true;
        if (params.action === '刷新' || params.action === '返回') return true;
        return false;
      },
      extract: (params) => params.target && params.target.length > 0,
      observe: (params) => params.target && params.target.length > 0,
      agent: (params) => params.instruction && params.instruction.length > 0,
      act: (params) => Object.keys(params).length > 0 && params.raw && params.raw.length > 0
    };
    
    const validator = validations[config.type];
    if (!validator) {
      console.warn(`⚠️  未知的操作类型: ${config.type}`);
      return false;
    }
    
    return validator(config.params);
  }

  // 生成步骤描述（用于调试和日志）
  describeStep(config) {
    const descriptions = {
      goto: (params) => {
        if (params.url) return `导航到: ${params.url}`;
        if (params.action === '刷新') return '刷新页面';
        if (params.action === '返回') return '返回上一页';
        return `导航操作: ${JSON.stringify(params)}`;
      },
      extract: (params) => `提取: ${params.target}${params.variable ? ` → ${params.variable}` : ''}`,
      observe: (params) => `查找: ${params.target}`,
      agent: (params) => `智能执行: ${params.instruction}`,
      act: (params) => {
        if (params.raw) return `执行: ${params.raw}`;
        return `执行动作: ${JSON.stringify(params)}`;
      }
    };
    
    const describer = descriptions[config.type];
    return describer ? describer(config.params) : `执行: ${config.originalText}`;
  }

  // 获取模式统计信息
  getPatternStats() {
    const stats = {
      total: 0,
      byType: {},
      bySource: { builtin: 0, custom: 0 }
    };
    
    for (const [type, patterns] of Object.entries(this.patterns)) {
      stats.byType[type] = patterns.length;
      stats.total += patterns.length;
      
      patterns.forEach(pattern => {
        if (pattern.builtin) {
          stats.bySource.builtin++;
        } else {
          stats.bySource.custom++;
        }
      });
    }
    
    return stats;
  }

  // 根据类型获取可用模式
  getPatternsByType(type) {
    return this.patterns[type] || [];
  }

  // 检查步骤是否匹配特定模式
  matchesPattern(stepText, patternName) {
    const config = this.parseStep(stepText);
    return config.patternName === patternName;
  }

  // 调试方法：显示步骤解析详情
  debugStep(stepText) {
    const config = this.parseStep(stepText);
    const isValid = this.validateStepConfig(config);
    
    console.log('\n🔍 步骤解析详情:');
    console.log(`   原始文本: ${stepText}`);
    console.log(`   解析类型: ${config.type}`);
    console.log(`   模式名称: ${config.patternName}`);
    console.log(`   模式描述: ${config.patternDescription}`);
    console.log(`   是否内置: ${config.isBuiltin ? '是' : '否'}`);
    console.log(`   优先级: ${config.priority}`);
    console.log(`   参数: ${JSON.stringify(config.params, null, 2)}`);
    console.log(`   变量: ${JSON.stringify(config.variables, null, 2)}`);
    console.log(`   验证结果: ${isValid ? '✅ 有效' : '❌ 无效'}`);
    console.log(`   描述: ${this.describeStep(config)}`);
    
    return config;
  }
}