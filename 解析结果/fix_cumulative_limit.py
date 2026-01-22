#!/usr/bin/env python3
"""
修复解析结果中缺失的累计赔付次数限制问题

问题描述：原文有"累计给付以X次为限"但note中没有体现

修复方案：从责任原文中提取累计次数，在note中添加"累计最多赔X次"
"""

import json
import re
import glob
from datetime import datetime

def convert_chinese_num(cn):
    """将中文数字转换为阿拉伯数字"""
    cn_num = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}
    return cn_num.get(cn, cn)

def fix_cumulative_limit():
    fixed_count = 0
    fixed_details = []
    
    for file in sorted(glob.glob('解析结果-批次*-序号*.json')):
        if 'report' in file:
            continue
            
        try:
            with open(file, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            print(f"跳过文件(JSON错误): {file} - {e}")
            continue
        
        modified = False
        cases = data.get('cases', [])
        
        for case in cases:
            原文 = case.get('责任原文', '')
            note = case.get('note', '') or ''
            
            # 查找原文中的累计次数限制
            match = re.search(r'累计给付以([一二三四五六七八九十\d]+)次为限', 原文)
            if not match:
                continue
                
            累计次数_原文 = match.group(1)
            累计次数 = convert_chinese_num(累计次数_原文)
            if isinstance(累计次数, str) and 累计次数.isdigit():
                累计次数 = int(累计次数)
            
            # 检查note中是否已有累计次数信息
            has_累计 = '累计' in note and ('次' in note or str(累计次数) in note)
            has_最多 = '最多' in note and str(累计次数) in note
            
            if has_累计 or has_最多:
                continue  # 已经有了，跳过
            
            # 需要添加累计次数信息
            新增内容 = f"累计最多赔{累计次数}次"
            
            if note:
                # 在"每种"之后插入，或者在开头插入
                if '每种' in note:
                    # 在第一个分号后插入
                    parts = note.split('；', 1)
                    if len(parts) > 1:
                        new_note = f"{parts[0]}；{新增内容}；{parts[1]}"
                    else:
                        new_note = f"{note}；{新增内容}"
                else:
                    new_note = f"{新增内容}；{note}"
            else:
                new_note = 新增内容
            
            # 更新note
            old_note = note
            case['note'] = new_note
            modified = True
            fixed_count += 1
            
            fixed_details.append({
                '序号': case.get('序号'),
                '保单ID': case.get('保单ID号', '')[:30],
                '责任名称': case.get('责任名称'),
                '累计次数': f'{累计次数}次',
                '原note': old_note[:40] if old_note else '(空)',
                '新note': new_note[:50]
            })
        
        # 保存修改后的文件
        if modified:
            with open(file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"✅ 已修复: {file}")
    
    return fixed_count, fixed_details

if __name__ == '__main__':
    import os
    os.chdir('/Users/hanyang/Desktop/保险解析助手/解析结果')
    
    print("=" * 60)
    print("修复解析结果中缺失的累计赔付次数限制")
    print("=" * 60)
    print()
    
    fixed_count, fixed_details = fix_cumulative_limit()
    
    print()
    print(f"修复完成! 共修复 {fixed_count} 条记录")
    print()
    
    # 显示部分修复详情
    print("修复详情(前10条):")
    for i, detail in enumerate(fixed_details[:10]):
        print(f"{i+1}. 序号{detail['序号']}: {detail['责任名称']}")
        print(f"   累计: {detail['累计次数']}")
        print(f"   原note: {detail['原note']}")
        print(f"   新note: {detail['新note']}")
        print()











