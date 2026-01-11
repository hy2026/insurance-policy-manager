#!/usr/bin/env python3
"""
批量修复脚本：为包含"终止"表述的案例添加note字段
规则：识别"本合同终止"/"责任终止"表述，添加note: "给付以1次为限"
版本：v2.9
日期：2026-01-11
"""

import json
import glob
import re
from typing import Dict, List, Any

def should_add_note(case: Dict[str, Any]) -> bool:
    """
    判断案例是否需要添加note
    
    规则：
    1. 案例当前没有note字段或note为空
    2. 责任原文包含"终止"表述
    """
    # 如果已经有note，跳过
    if 'note' in case and case['note']:
        return False
    
    原文 = case.get('责任原文', '')
    
    # 检查是否包含终止表述
    patterns = [
        r'给付.*保险金[，,].*本合同终止',
        r'给付.*保险金[，,].*责任终止',
        r'给付.*保险金责任终止',
        r'按.*给付.*[，,].*本合同终止',
        r'按.*给付.*[，,].*责任终止',
    ]
    
    for pattern in patterns:
        if re.search(pattern, 原文):
            return True
    
    return False


def fix_batch(file_path: str) -> Dict[str, Any]:
    """
    修复单个批次文件
    
    返回：{
        'file': 文件名,
        'total': 总案例数,
        'before': 修复前有note的数量,
        'fixed': 本次修复的数量,
        'after': 修复后有note的数量,
        'examples': 前3个修复案例的信息
    }
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    cases = data.get('cases', [])
    
    # 统计修复前状态
    before_count = sum(1 for c in cases if 'note' in c and c['note'])
    
    # 执行修复
    fixed_cases = []
    for case in cases:
        if should_add_note(case):
            case['note'] = '给付以1次为限'
            fixed_cases.append({
                '序号': case.get('序号'),
                '责任名称': case.get('责任名称'),
                '原文片段': case.get('责任原文', '')[:100] + '...'
            })
    
    # 统计修复后状态
    after_count = sum(1 for c in cases if 'note' in c and c['note'])
    
    # 保存修改后的数据
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    return {
        'file': file_path.split('/')[-1],
        'total': len(cases),
        'before': before_count,
        'fixed': len(fixed_cases),
        'after': after_count,
        'examples': fixed_cases[:3]
    }


def main():
    """主函数：批量修复所有批次"""
    
    print("=" * 80)
    print("批量修复脚本：为包含'终止'表述的案例添加note")
    print("规则版本：v2.9")
    print("=" * 80)
    print()
    
    # 查找所有解析结果文件
    files = sorted(glob.glob('解析结果-批次*.json'))
    
    if not files:
        print("❌ 未找到解析结果文件")
        return
    
    print(f"找到 {len(files)} 个批次文件\n")
    
    # 统计总体数据
    total_cases = 0
    total_before = 0
    total_fixed = 0
    total_after = 0
    
    batch_results = []
    
    # 逐批次修复
    for file_path in files:
        result = fix_batch(file_path)
        batch_results.append(result)
        
        total_cases += result['total']
        total_before += result['before']
        total_fixed += result['fixed']
        total_after += result['after']
        
        # 显示进度
        print(f"✅ {result['file']}")
        print(f"   总案例: {result['total']} | 修复前: {result['before']} | 本次修复: {result['fixed']} | 修复后: {result['after']}")
        
        # 显示示例（如果有修复）
        if result['fixed'] > 0 and result['examples']:
            print(f"   示例: 序号{result['examples'][0]['序号']} - {result['examples'][0]['责任名称']}")
        print()
    
    # 显示汇总统计
    print("=" * 80)
    print("修复完成！汇总统计：")
    print("=" * 80)
    print(f"总批次数: {len(files)}")
    print(f"总案例数: {total_cases}")
    print(f"\n修复前:")
    print(f"  有note案例: {total_before} ({total_before/total_cases*100:.1f}%)")
    print(f"  缺note案例: {total_cases - total_before} ({(total_cases - total_before)/total_cases*100:.1f}%)")
    print(f"\n本次修复:")
    print(f"  修复案例数: {total_fixed}")
    print(f"\n修复后:")
    print(f"  有note案例: {total_after} ({total_after/total_cases*100:.1f}%)")
    print(f"  缺note案例: {total_cases - total_after} ({(total_cases - total_after)/total_cases*100:.1f}%)")
    print(f"\n提升幅度:")
    print(f"  note覆盖率提升: {(total_after - total_before)/total_cases*100:.1f}%")
    print("=" * 80)
    
    # 显示每批次详情（表格形式）
    print("\n批次详细统计:")
    print("-" * 80)
    print(f"{'批次':<20} {'总数':>6} {'修复前':>6} {'本次修复':>6} {'修复后':>6} {'覆盖率':>8}")
    print("-" * 80)
    for result in batch_results:
        coverage = result['after'] / result['total'] * 100
        print(f"{result['file']:<20} {result['total']:>6} {result['before']:>6} {result['fixed']:>6} {result['after']:>6} {coverage:>7.1f}%")
    print("-" * 80)


if __name__ == '__main__':
    main()


