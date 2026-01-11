#!/usr/bin/env python3
"""
检查包含"合同终止"表述但缺少note的案例
"""

import json
import os
import re

def check_file(filename):
    """检查单个文件"""
    with open(filename, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    issues = []
    
    for case in data.get('cases', []):
        seq = case.get('序号', 'Unknown')
        name = case.get('责任名称', 'Unknown')
        original_text = case.get('责任原文', '')
        note = case.get('note', '')
        
        # 检查原文中是否包含"合同终止"相关表述
        termination_patterns = [
            r'本合同终止',
            r'合同终止',
            r'本附加[险合]?合同终止',
            r'附加险?合同终止',
            r'主[险合]?合同终止',
        ]
        
        has_termination = False
        matched_pattern = None
        for pattern in termination_patterns:
            if re.search(pattern, original_text):
                has_termination = True
                matched_pattern = pattern
                break
        
        # 如果有"合同终止"但没有note，或note中没有赔付次数限制
        if has_termination:
            has_payout_limit_in_note = False
            if note:
                # 检查note中是否已经有赔付次数限制表述
                payout_limit_patterns = [
                    r'给付以.{1,3}次为限',
                    r'限赔.{1,3}次',
                    r'累计[最多]?赔?\d+次',
                    r'仅[限]?.{1,3}次',
                ]
                for pattern in payout_limit_patterns:
                    if re.search(pattern, note):
                        has_payout_limit_in_note = True
                        break
            
            if not has_payout_limit_in_note:
                # 提取包含"合同终止"的句子
                sentences = re.split(r'[。；]', original_text)
                termination_sentence = ''
                for sent in sentences:
                    if '合同终止' in sent:
                        termination_sentence = sent.strip()
                        break
                
                issues.append({
                    '序号': seq,
                    '责任名称': name,
                    '当前note': note if note else '无',
                    '匹配模式': matched_pattern,
                    '终止句子': termination_sentence[:100] + '...' if len(termination_sentence) > 100 else termination_sentence
                })
    
    return issues

def main():
    # 获取所有解析结果文件
    result_dir = '/Users/hanyang/Desktop/保险解析助手/解析结果'
    files = [f for f in os.listdir(result_dir) if f.startswith('解析结果-批次') and f.endswith('.json')]
    files.sort()
    
    all_issues = []
    
    print("="*80)
    print("检查包含'合同终止'但缺少note中赔付次数限制的案例")
    print("="*80)
    print()
    
    for filename in files:
        filepath = os.path.join(result_dir, filename)
        print(f"检查文件: {filename}")
        issues = check_file(filepath)
        
        if issues:
            print(f"  发现 {len(issues)} 个问题")
            all_issues.extend(issues)
        else:
            print(f"  ✓ 无问题")
    
    print()
    print("="*80)
    print(f"总计发现 {len(all_issues)} 个案例")
    print("="*80)
    print()
    
    if all_issues:
        # 显示前20个案例的详细信息
        print("前20个案例详情:")
        print("-"*80)
        for i, issue in enumerate(all_issues[:20], 1):
            print(f"\n{i}. 序号 {issue['序号']} - {issue['责任名称']}")
            print(f"   当前note: {issue['当前note']}")
            print(f"   匹配模式: {issue['匹配模式']}")
            print(f"   终止句子: {issue['终止句子']}")
    
    # 保存到文件
    output_file = os.path.join(result_dir, 'termination_missing_note_report.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_issues, f, ensure_ascii=False, indent=2)
    
    print()
    print(f"\n完整报告已保存到: {output_file}")

if __name__ == '__main__':
    main()








