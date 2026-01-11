// ==================== 原文片段提取工具（职责：从正则匹配结果中精确提取原文片段）====================
class TextExtractorService {
  /**
   * 从正则匹配结果中精确提取原文片段
   * @param {RegExpMatchArray} match - 正则匹配结果
   * @param {string} originalText - 原始文本
   * @param {Object} options - 选项
   * @returns {string} 提取的原文片段
   */
  static extractText(match, originalText, options = {}) {
    if (!match || !match[0]) {
      return "未识别";
    }

    const {
      maxLength = 200,           // 最大长度
      includeContext = false,    // 是否包含上下文
      contextBefore = 20,        // 上下文前字符数
      contextAfter = 20,         // 上下文后字符数
      cleanWhitespace = true,    // 清理空白字符
      trimPunctuation = false    // 是否在标点符号处截断
    } = options;

    let extracted = match[0];

    // 1. 清理空白字符（多个空格/换行合并为一个空格）
    if (cleanWhitespace) {
      extracted = extracted.replace(/\s+/g, ' ').trim();
    }

    // 2. 如果包含上下文，扩展提取范围
    if (includeContext) {
      const matchIndex = originalText.indexOf(extracted);
      if (matchIndex !== -1) {
        const start = Math.max(0, matchIndex - contextBefore);
        const end = Math.min(originalText.length, matchIndex + extracted.length + contextAfter);
        extracted = originalText.substring(start, end);
        
        // 清理扩展后的文本
        if (cleanWhitespace) {
          extracted = extracted.replace(/\s+/g, ' ').trim();
        }
      }
    }

    // 3. 在句子边界处截断（如果超过最大长度）
    if (extracted.length > maxLength && trimPunctuation) {
      // 尝试在最近的标点符号处截断
      const punctuationMarks = ['。', '；', '，', ';', ',', '.', ';'];
      let lastPunctuationIndex = -1;
      
      for (let i = maxLength; i >= maxLength - 50 && i >= 0; i--) {
        if (punctuationMarks.includes(extracted[i])) {
          lastPunctuationIndex = i + 1;
          break;
        }
      }
      
      if (lastPunctuationIndex > 0) {
        extracted = extracted.substring(0, lastPunctuationIndex);
      } else {
        // 如果没有找到标点符号，直接截断
        extracted = extracted.substring(0, maxLength) + '...';
      }
    } else if (extracted.length > maxLength) {
      // 直接截断
      extracted = extracted.substring(0, maxLength) + '...';
    }

    return extracted;
  }

  /**
   * 从分层赔付的匹配结果中提取多个原文片段
   * @param {RegExpMatchArray} match - 正则匹配结果
   * @param {string} originalText - 原始文本
   * @param {Array<Object>} tiers - 分层信息数组
   * @returns {Array<string>} 每个阶段对应的原文片段
   */
  static extractTieredText(match, originalText, tiers) {
    if (!match || !match[0]) {
      return tiers.map(() => "未识别");
    }

    const fullMatch = match[0];
    const matchIndex = originalText.indexOf(fullMatch);
    
    if (matchIndex === -1) {
      return tiers.map(() => fullMatch); // 如果找不到，返回完整匹配
    }

    // 尝试为每个阶段提取对应的原文片段
    const extractedTiers = [];
    
    // 对于分层赔付，通常原文中会明确分段
    // 可以查找分号、句号或编号（如(1)、(2)）来分割
    const segments = originalText.substring(matchIndex, matchIndex + fullMatch.length);
    
    // 查找分段标识
    const segmentPatterns = [
      /[;；]\s*\(\d+\)/g,  // 分号+编号，如：;(1)
      /[。]\s*\(\d+\)/g,   // 句号+编号，如：。(1)
      /\(\d+\)/g            // 单独编号，如：(1)
    ];

    let segmentBoundaries = [0];
    for (const pattern of segmentPatterns) {
      let found = false;
      const matches = [...segments.matchAll(pattern)];
      matches.forEach(m => {
        segmentBoundaries.push(m.index + 1);
        found = true;
      });
      if (found) break;
    }

    // 如果没有找到分段，返回完整匹配
    if (segmentBoundaries.length === 1) {
      return tiers.map(() => fullMatch);
    }

    // 为每个阶段提取对应的片段
    segmentBoundaries.push(segments.length);
    for (let i = 0; i < tiers.length && i < segmentBoundaries.length - 1; i++) {
      const start = segmentBoundaries[i];
      const end = segmentBoundaries[i + 1];
      let segment = segments.substring(start, end).trim();
      
      // 清理空白字符
      segment = segment.replace(/\s+/g, ' ');
      
      extractedTiers.push(segment || fullMatch);
    }

    // 如果提取的片段数量不够，用完整匹配填充
    while (extractedTiers.length < tiers.length) {
      extractedTiers.push(fullMatch);
    }

    return extractedTiers;
  }

  /**
   * 智能提取：根据字段类型选择最佳的提取策略
   * @param {RegExpMatchArray} match - 正则匹配结果
   * @param {string} originalText - 原始文本
   * @param {string} fieldType - 字段类型
   * @returns {string} 提取的原文片段
   */
  static smartExtract(match, originalText, fieldType) {
    const strategies = {
      'payoutAmount': {
        maxLength: 150,
        includeContext: false,
        trimPunctuation: true,
        cleanWhitespace: true
      },
      'payoutCount': {
        maxLength: 50,
        includeContext: false,
        trimPunctuation: false,
        cleanWhitespace: true
      },
      'intervalPeriod': {
        maxLength: 50,
        includeContext: false,
        trimPunctuation: false,
        cleanWhitespace: true
      },
      'grouping': {
        maxLength: 50,
        includeContext: false,
        trimPunctuation: false,
        cleanWhitespace: true
      },
      'repeatablePayout': {
        maxLength: 50,
        includeContext: false,
        trimPunctuation: false,
        cleanWhitespace: true
      },
      'premiumWaiver': {
        maxLength: 50,
        includeContext: false,
        trimPunctuation: false,
        cleanWhitespace: true
      },
      'conditions': {
        maxLength: 100,
        includeContext: false,
        trimPunctuation: true,
        cleanWhitespace: true
      }
    };

    const options = strategies[fieldType] || {
      maxLength: 100,
      includeContext: false,
      trimPunctuation: true,
      cleanWhitespace: true
    };

    return this.extractText(match, originalText, options);
  }

  /**
   * 提取完整句子：以标点符号为边界，提取包含匹配内容的完整句子
   * @param {number} matchStart - 匹配开始位置
   * @param {number} matchEnd - 匹配结束位置
   * @param {string} originalText - 原始文本
   * @param {boolean} includeRelated - 是否包含相关句子（如"每种仅限一次"）
   * @returns {string} 完整句子
   */
  static extractCompleteSentence(matchStart, matchEnd, originalText, includeRelated = false) {
    // 向前查找句子起始：优先从匹配位置开始，或查找最近的逗号/句号
    const beforeText = originalText.substring(0, matchStart);
    const sentenceDelimiters = ['。', '\n', '\r\n']; // 优先使用句号和换行作为句子边界
    const clauseDelimiters = ['，', '；', ';', ',', '.']; // 逗号和分号作为分句边界
    let sentenceStart = 0;
    
    // 先查找句号或换行（完整句子边界）
    for (const delimiter of sentenceDelimiters) {
      const lastIndex = beforeText.lastIndexOf(delimiter);
      if (lastIndex !== -1) {
        sentenceStart = Math.max(sentenceStart, lastIndex + delimiter.length);
      }
    }
    
    // 如果没有找到句号，再查找逗号或分号（分句边界）
    if (sentenceStart === 0) {
      for (const delimiter of clauseDelimiters) {
        const lastIndex = beforeText.lastIndexOf(delimiter);
        if (lastIndex !== -1) {
          sentenceStart = Math.max(sentenceStart, lastIndex + delimiter.length);
        }
      }
    }
    
    // 如果向前查找没有找到逗号或句号，或者距离匹配位置较远（超过30个字符），则从匹配位置开始
    // 这样可以确保提取的是核心内容，而不是包含太多前面的上下文
    const hasFoundDelimiter = sentenceStart > 0;
    if (!hasFoundDelimiter || (matchStart - sentenceStart > 30)) {
      sentenceStart = matchStart;
    }
    
    // 向后查找句子结束：找到第一个标点符号就停止（核心内容已识别，不需要继续扩展）
    const afterText = originalText.substring(matchEnd);
    let sentenceEnd = originalText.length;
    
    // 按优先级查找第一个标点符号：破折号（停止在破折号前）> 句号 > 逗号/分号
    // 先查找破折号（停止在破折号前，不包含破折号）
    const dashIndex = afterText.indexOf('——');
    if (dashIndex !== -1) {
      sentenceEnd = matchEnd + dashIndex; // 不包含破折号
    } else {
      const singleDashIndex = afterText.indexOf('—');
      if (singleDashIndex !== -1) {
        sentenceEnd = matchEnd + singleDashIndex; // 不包含破折号
      } else {
        // 查找其他标点符号：优先查找逗号（最常见），然后是分号、句号
        // 这样可以确保在第一个标点符号处停止，提取核心内容
        const stopDelimiters = ['，', '；', '。', ';', ',', '.'];
        let minIndex = afterText.length;
        let foundDelimiter = null;
        
        // 找到所有标点符号中最近的一个
        for (const delimiter of stopDelimiters) {
          const firstIndex = afterText.indexOf(delimiter);
          if (firstIndex !== -1 && firstIndex < minIndex) {
            minIndex = firstIndex;
            foundDelimiter = delimiter;
          }
        }
        
        if (foundDelimiter) {
          sentenceEnd = matchEnd + minIndex + foundDelimiter.length;
        }
      }
    }
    
    // 提取完整句子并去除首尾空白
    let sentence = originalText.substring(sentenceStart, sentenceEnd).trim();
    
    // 去掉末尾的标点符号（逗号、分号等），使提取结果更简洁，避免显示一个标点符号结尾
    // 保留句号，因为句号表示完整句子的结束
    const trailingPunctuation = ['，', '；', ',', ';', '：', ':', '、'];
    for (const punct of trailingPunctuation) {
      if (sentence.endsWith(punct)) {
        sentence = sentence.slice(0, -1).trim();
        break; // 只去掉一个标点符号
      }
    }
    
    // 如果包含相关句子（如"每种仅限一次"），需要包含相关句子，但也在第一个标点符号处停止
    if (includeRelated) {
      // 检查句子中是否包含"每种仅限一次"等关键词
      const relatedPatterns = [
        /每种[^仅]*?(?:疾病|病)[^仅]*?仅限[^一]*?(?:给付|支付|赔偿|理赔)?[^一]*?一次/i,
        /每种[^一]*?仅限[^一]*?(?:给付|支付|赔偿|理赔)[^一]*?一次/i
      ];
      
      let hasRelated = false;
      for (const pattern of relatedPatterns) {
        if (pattern.test(sentence)) {
          hasRelated = true;
          break;
        }
      }
      
      // 如果当前句子中没有相关关键词，尝试向后扩展（但也在第一个标点符号处停止）
      if (!hasRelated) {
        // 在匹配位置之后查找相关关键词
        const searchEnd = Math.min(originalText.length, matchEnd + 200);
        const searchText = originalText.substring(matchEnd, searchEnd);
        
        for (const pattern of relatedPatterns) {
          const match = searchText.match(pattern);
          if (match) {
            // 找到相关关键词，扩展句子到包含该关键词，然后在第一个标点符号处停止
            const relatedEnd = matchEnd + searchText.indexOf(match[0]) + match[0].length;
            const afterRelated = originalText.substring(relatedEnd);
            
            // 查找第一个标点符号（破折号停止在破折号前，其他标点符号包含标点符号）
            const dashIndex = afterRelated.indexOf('——');
            if (dashIndex !== -1) {
              sentenceEnd = relatedEnd + dashIndex; // 不包含破折号
            } else {
              const singleDashIndex = afterRelated.indexOf('—');
              if (singleDashIndex !== -1) {
                sentenceEnd = relatedEnd + singleDashIndex; // 不包含破折号
              } else {
                const stopDelimiters = ['。', '，', '；', ';', ',', '.'];
                for (const delimiter of stopDelimiters) {
                  const firstIndex = afterRelated.indexOf(delimiter);
                  if (firstIndex !== -1) {
                    sentenceEnd = relatedEnd + firstIndex + delimiter.length;
                    break;
                  }
                }
              }
            }
            sentence = originalText.substring(sentenceStart, sentenceEnd).trim();
            break;
          }
        }
      }
    }
    
    // 如果句子太长（超过200字符），尝试截取到最近的逗号或分号
    if (sentence.length > 200) {
      const matchInSentence = matchStart - sentenceStart;
      // 从匹配位置向前查找最近的逗号或分号
      const beforeMatch = sentence.substring(0, matchInSentence);
      const lastComma = Math.max(
        beforeMatch.lastIndexOf('，'),
        beforeMatch.lastIndexOf('；'),
        beforeMatch.lastIndexOf(','),
        beforeMatch.lastIndexOf(';')
      );
      const start = lastComma !== -1 ? lastComma + 1 : 0;
      
      // 从匹配位置向后查找最近的逗号、分号或句号
      const afterMatch = sentence.substring(matchInSentence);
      const nextPunct = Math.min(
        afterMatch.indexOf('，') !== -1 ? afterMatch.indexOf('，') + 1 : afterMatch.length,
        afterMatch.indexOf('；') !== -1 ? afterMatch.indexOf('；') + 1 : afterMatch.length,
        afterMatch.indexOf('。') !== -1 ? afterMatch.indexOf('。') + 1 : afterMatch.length,
        afterMatch.indexOf(',') !== -1 ? afterMatch.indexOf(',') + 1 : afterMatch.length,
        afterMatch.indexOf(';') !== -1 ? afterMatch.indexOf(';') + 1 : afterMatch.length,
        afterMatch.indexOf('.') !== -1 ? afterMatch.indexOf('.') + 1 : afterMatch.length,
        afterMatch.length
      );
      const end = matchInSentence + nextPunct;
      
      sentence = sentence.substring(start, end).trim();
    }
    
    return sentence;
  }
}


