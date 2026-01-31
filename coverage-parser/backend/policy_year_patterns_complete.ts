import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 完整的保单年度识别模式库
 * 不断积累，持续完善
 */

// 中文数字转阿拉伯数字
function chineseToNumber(chinese: string): number | null {
  const map: { [key: string]: number } = {
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '百': 100
  };

  // 如果已经是数字
  if (/^\d+$/.test(chinese)) {
    return parseInt(chinese);
  }

  // 特殊处理
  if (chinese === '十') return 10;
  if (chinese === '百') return 100;

  let result = 0;
  let temp = 0;

  for (let i = 0; i < chinese.length; i++) {
    const char = chinese[i];
    const value = map[char];

    if (value === undefined) continue;

    if (value === 10) {
      temp = temp === 0 ? 1 : temp;
      result += temp * 10;
      temp = 0;
    } else if (value === 100) {
      temp = temp === 0 ? 1 : temp;
      result += temp * 100;
      temp = 0;
    } else {
      temp = value;
    }
  }

  result += temp;
  return result || null;
}

interface PolicyYearPattern {
  name: string;
  regex: RegExp;
  extract: (match: RegExpMatchArray) => any | null;
  examples: string[];
}

/**
 * 保单年度识别模式库
 * 按照发现顺序记录，不断添加新模式
 */
export const POLICY_YEAR_PATTERNS: PolicyYearPattern[] = [
  // 优先级：从具体到宽泛
  
  {
    name: '第X个保单周年日零时之前（明确标注"不含"）',
    regex: /第\s*([一二三四五六七八九十百0-9]+)\s*个?\s*(保单周年日|保险单周年日)\s*零时?\s*(之前|前)\s*[（(]\s*(不含|不包含)/,
    extract: (match) => {
      const yearNum = chineseToNumber(match[1]);
      if (yearNum) {
        return { start: 1, end: yearNum, startInclusive: true, endInclusive: false };
      }
      return null;
    },
    examples: [
      '第30个保险单周年日零时之前（不含）',
      '第10个保单周年日前（不含）'
    ]
  },

  {
    name: '第X个保单周年日零时之前（无"不含"标注，按惯例为不含）',
    regex: /第\s*([一二三四五六七八九十百0-9]+)\s*个?\s*(保单周年日|保险单周年日)\s*零时\s*(之前|前)/,
    extract: (match) => {
      const yearNum = chineseToNumber(match[1]);
      if (yearNum) {
        return { start: 1, end: yearNum, startInclusive: true, endInclusive: false };
      }
      return null;
    },
    examples: [
      '第30个保险单周年日零时之前',
      '第10个保单周年日零时前'
    ]
  },

  {
    name: '第X个保单周年日零时以前（含）',
    regex: /第\s*([一二三四五六七八九十百0-9]+)\s*个?\s*(保单周年日|保险单周年日)\s*零时\s*以前/,
    extract: (match) => {
      const yearNum = chineseToNumber(match[1]);
      if (yearNum) {
        return { start: 1, end: yearNum, startInclusive: true, endInclusive: true };
      }
      return null;
    },
    examples: [
      '第30个保单周年日零时以前',
      '第10个保险单周年日零时以前'
    ]
  },

  {
    name: '第X个保障年度末（含）',
    regex: /第\s*([一二三四五六七八九十百0-9]+)\s*个?\s*保障年度\s*末/,
    extract: (match) => {
      const yearNum = chineseToNumber(match[1]);
      if (yearNum) {
        return { start: 1, end: yearNum, startInclusive: true, endInclusive: true };
      }
      return null;
    },
    examples: [
      '第15个保障年度末',
      '第10个保障年度末'
    ]
  },

  {
    name: '至第X个保障年度末（含）',
    regex: /至\s*第\s*([一二三四五六七八九十百0-9]+)\s*个?\s*保障年度\s*[（(]?[^）)]*[）)]?\s*末/,
    extract: (match) => {
      const yearNum = chineseToNumber(match[1]);
      if (yearNum) {
        return { start: 1, end: yearNum, startInclusive: true, endInclusive: true };
      }
      return null;
    },
    examples: [
      '至第15个保障年度（释义9）末',
      '至第10个保障年度末'
    ]
  },

  {
    name: '第X个保单周年日前（含释义编号）',
    regex: /第\s*([一二三四五六七八九十百0-9]+)\s*个?\s*(保单周年日|保险单周年日)\s*\d+\s*零时?\s*(之前|前)/,
    extract: (match) => {
      const yearNum = chineseToNumber(match[1]);
      if (yearNum) {
        return { start: 1, end: yearNum, startInclusive: true, endInclusive: false };
      }
      return null;
    },
    examples: [
      '第三十个保单周年日7零时之前',
      '第十个保险单周年日11零时之前'
    ]
  },

  {
    name: '自第X个保单年度开始/起',
    regex: /自\s*第\s*([一二三四五六七八九十百0-9]+)\s*个?\s*保单年度\s*(开始|起)/,
    extract: (match) => {
      const yearNum = chineseToNumber(match[1]);
      if (yearNum) {
        return { start: yearNum, startInclusive: true };
      }
      return null;
    },
    examples: [
      '自第二个保单年度开始',
      '自第11个保单年度起'
    ]
  },

  {
    name: '前X年',
    regex: /前\s*([一二三四五六七八九十百0-9]+)\s*年/,
    extract: (match) => {
      const yearNum = chineseToNumber(match[1]);
      if (yearNum) {
        return { start: 1, end: yearNum, startInclusive: true, endInclusive: true };
      }
      return null;
    },
    examples: [
      '前十年',
      '前30年'
    ]
  },

  {
    name: 'X个保单年度内',
    regex: /([一二三四五六七八九十百0-9]+)\s*个?\s*保单年度\s*内/,
    extract: (match) => {
      const yearNum = chineseToNumber(match[1]);
      if (yearNum) {
        return { start: 1, end: yearNum, startInclusive: true, endInclusive: true };
      }
      return null;
    },
    examples: [
      '三十个保单年度内',
      '10个保单年度内'
    ]
  },

  {
    name: '第X个保单周年日以前（纯中文数字）',
    regex: /第\s*(十|二十|三十|四十|五十)\s*个?\s*(保单周年日|保险单周年日)\s*(以前|之前|前)/,
    extract: (match) => {
      const yearNum = chineseToNumber(match[1]);
      if (yearNum) {
        return { start: 1, end: yearNum, startInclusive: true, endInclusive: true };
      }
      return null;
    },
    examples: [
      '第十个保险单周年日以前',
      '第二十个保单周年日前'
    ]
  },

  {
    name: '第X个保单周年日零时之前（无"不含"标注，按惯例为不含）',
    regex: /第\s*([一二三四五六七八九十百0-9]+)\s*个?\s*(保单周年日|保险单周年日)\s*零时\s*(之前|前)(?![（(]*不含)/,
    extract: (match) => {
      const yearNum = chineseToNumber(match[1]);
      if (yearNum) {
        return { start: 1, end: yearNum, startInclusive: true, endInclusive: false };
      }
      return null;
    },
    examples: [
      '第30个保险单周年日零时之前',
      '第10个保单周年日零时前'
    ]
  }
];

/**
 * 从原文中提取保单年度范围
 * 按顺序尝试所有模式
 */
export function extractPolicyYearRange(clauseText: string): any | null {
  for (const pattern of POLICY_YEAR_PATTERNS) {
    const match = clauseText.match(pattern.regex);
    if (match) {
      const result = pattern.extract(match);
      if (result) {
        console.log(`  匹配${pattern.name}`);
        return result;
      }
    }
  }
  return null;
}

/**
 * 测试所有模式
 */
async function testPatterns() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║        测试保单年度识别模式库                            ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const testCases = [
    { seq: 136, text: '第30个保险单周年日零时之前' },
    { seq: 137, text: '第10个保险单周年日零时前（不含）' },
    { seq: 100, text: '至第15个保障年度（释义9）末' },
    { seq: 135, text: '第十个保险单周年日以前' },
    { seq: 496, text: '第三十个保单周年日7零时之前' },
    { seq: 150, text: '自第二个保单年度开始' },
    { seq: 287, text: '前十年' },
    { seq: 368, text: '三十个保单年度内' }
  ];

  console.log('测试用例：\n');
  testCases.forEach(tc => {
    console.log(`序号${tc.seq}: ${tc.text}`);
    const result = extractPolicyYearRange(tc.text);
    console.log(`  结果: ${JSON.stringify(result)}\n`);
  });

  await prisma.$disconnect();
}

// 如果直接运行此文件，则测试
if (require.main === module) {
  testPatterns().catch(console.error);
}
