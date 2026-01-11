#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量修复解析结果JSON格式
1. 删除案例级别的naturalLanguageDescription
2. 将stage级别的note合并到案例级别
3. 清理note内容，只保留5类内容
4. 确保stage级别必填字段完整
"""

import json
import os
import re
from pathlib import Path

# 定义需要保留在note中的关键词
NOTE_KEYWORDS = {
    '次数': ['给付以', '次为限', '累计最多赔', '次', '每种', '限赔'],
    '间隔期': ['需间隔', '间隔', '满', '年后', '日后'],
    '分组': ['需属于不同组别', '同组', '不同组', '分组'],
    '豁免': ['豁免', '免交'],
    '额外给付': ['额外给付']
}

# 不应该在note中的关键词
EXCLUDE_KEYWORDS = [
    '等待期', '因意外无等待期', '非意外', '意外伤害',
    '周岁', '年龄',
    '保单年度',
    '需同时满足', '给付条件',
    '根据年龄段', '按年龄',
    '责任终止', '合同终止', '本项责任终止',
    '按', '赔付', '给付'
]

def should_keep_note_content(text):
    """判断note内容是否应该保留"""
    if not text:
        return False
    
    # 检查是否包含应该保留的关键词
    for category, keywords in NOTE_KEYWORDS.items():
        for keyword in keywords:
            if keyword in text:
                return True
    
    # 检查是否包含不应该保留的关键词（但没有应该保留的）
    for keyword in EXCLUDE_KEYWORDS:
        if keyword in text and not any(kw in text for kwlist in NOTE_KEYWORDS.values() for kw in kwlist):
            return False
    
    return False

def extract_valid_notes(note_text):
    """从note文本中提取有效的note内容"""
    if not note_text:
        return []
    
    # 按分号或句号分割
    parts = re.split('[；;。]', note_text)
    
    valid_notes = []
    for part in parts:
        part = part.strip()
        if should_keep_note_content(part):
            valid_notes.append(part)
    
    return valid_notes

def fix_case(case):
    """修复单个案例的格式"""
    fixed = False
    
    # 1. 删除案例级别的naturalLanguageDescription
    if 'naturalLanguageDescription' in case:
        del case['naturalLanguageDescription']
        fixed = True
    
    # 2. 收集所有stage级别的note
    all_notes = []
    for stage in case.get('payoutAmount', []):
        if 'note' in stage:
            # 提取有效的note内容
            valid_notes = extract_valid_notes(stage['note'])
            all_notes.extend(valid_notes)
            # 删除stage级别的note
            del stage['note']
            fixed = True
    
    # 3. 去重并合并到案例级别
    if all_notes:
        unique_notes = []
        seen = set()
        for note in all_notes:
            if note not in seen:
                unique_notes.append(note)
                seen.add(note)
        
        if unique_notes:
            case['note'] = '；'.join(unique_notes)
            fixed = True
    
    # 4. 检查每个stage的必填字段
    for stage in case.get('payoutAmount', []):
        # 确保有waitingPeriodStatus
        if 'waitingPeriodStatus' not in stage:
            stage['waitingPeriodStatus'] = 'after'  # 默认为after
            fixed = True
        
        # 确保有naturalLanguageDescription
        if 'naturalLanguageDescription' not in stage:
            # 生成简单的描述
            formula = stage.get('formula', '')
            waiting = '等待期后' if stage.get('waitingPeriodStatus') == 'after' else '等待期内'
            stage['naturalLanguageDescription'] = f"{waiting}确诊，按{formula}赔付"
            fixed = True
    
    return fixed

def process_file(filepath):
    """处理单个JSON文件"""
    print(f"处理文件: {filepath.name}")
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 检查是否有"案例"字段
        if isinstance(data, dict) and '案例' in data:
            cases = data['案例']
        elif isinstance(data, list):
            cases = data
        else:
            print(f"  ❌ 无法识别的JSON结构")
            return 0
        
        fixed_count = 0
        for case in cases:
            if fix_case(case):
                fixed_count += 1
        
        if fixed_count > 0:
            # 备份原文件
            backup_path = filepath.with_suffix('.json.bak')
            if not backup_path.exists():
                with open(backup_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
            
            # 写入修复后的数据
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            
            print(f"  ✅ 修复了 {fixed_count} 个案例")
        else:
            print(f"  ℹ️  无需修复")
        
        return fixed_count
    
    except Exception as e:
        print(f"  ❌ 错误: {e}")
        return 0

def main():
    """主函数"""
    # 解析结果目录
    result_dir = Path('/Users/hanyang/Desktop/保险解析助手/解析结果')
    
    if not result_dir.exists():
        print(f"❌ 目录不存在: {result_dir}")
        return
    
    # 获取所有JSON文件
    json_files = sorted(result_dir.glob('解析结果-批次*.json'))
    
    if not json_files:
        print(f"❌ 未找到解析结果文件")
        return
    
    print(f"找到 {len(json_files)} 个文件")
    print("=" * 60)
    
    total_fixed = 0
    for filepath in json_files:
        fixed_count = process_file(filepath)
        total_fixed += fixed_count
    
    print("=" * 60)
    print(f"\n✅ 完成！共修复 {total_fixed} 个案例")

if __name__ == '__main__':
    main()

