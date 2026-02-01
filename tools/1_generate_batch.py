#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
统一批次解析生成工具
版本：v3.0
功能：
  - 支持任意批次编号
  - 支持LLM调用（需配置API）
  - 支持手动模式（需手动填写）
  - 标准化输出格式

使用方法：
  python 1_generate_batch.py --batch 16 --start 3001 --end 3200
  python 1_generate_batch.py --batch 16 --mode manual  # 手动填写模式
"""

import json
import argparse
import os
import sys
from pathlib import Path

# 添加项目根目录到路径
ROOT_DIR = Path(__file__).parent.parent
sys.path.append(str(ROOT_DIR))


def load_raw_data(batch_num: int, start: int, end: int):
    """
    加载原文数据
    
    从 原文条款/原文条款-批次X.md 读取数据
    返回：{序号: {保单ID号, 责任类型, 责任名称, 责任原文}} 的字典
    """
    raw_file = ROOT_DIR / f"原文条款/原文条款-批次{batch_num}.md"
    
    if not raw_file.exists():
        print(f"❌ 错误: 找不到原文文件: {raw_file}")
        return {}
    
    raw_data = {}
    
    with open(raw_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or line.startswith('序号范围'):
                continue
            
            parts = line.split('|||')
            if len(parts) >= 5:
                序号 = int(parts[0])
                if start <= 序号 <= end:
                    raw_data[序号] = {
                        '序号': 序号,
                        '保单ID号': parts[1],
                        '责任类型': parts[2],
                        '责任名称': parts[3],
                        '责任原文': parts[4]
                    }
    
    return raw_data


def generate_with_llm(raw_data: dict, batch_num: int):
    """
    使用LLM生成解析结果
    
    注意：需要配置环境变量 OPENAI_API_KEY 或其他LLM API
    """
    print("⚠️  LLM模式尚未实现")
    print("提示：请参考 数据标注规则库.md 和 标准术语表.md 进行人工标注")
    print("      或使用 --mode manual 手动填写模式")
    return []


def generate_manual(raw_data: dict, batch_num: int):
    """
    手动填写模式
    
    生成模板JSON，用户手动填写payoutAmount等字段
    """
    cases = []
    
    for 序号, data in sorted(raw_data.items()):
        case = {
            "序号": data['序号'],
            "保单ID号": data['保单ID号'],
            "责任类型": data['责任类型'],
            "责任名称": data['责任名称'],
            "责任原文": data['责任原文'],
            "payoutAmount": [
                {
                    "stageNumber": 1,
                    "period": "TODO: 填写阶段描述",
                    "waitingPeriodStatus": "TODO: after/during/无",
                    "formula": "TODO: 填写公式，如 基本保额 * 100%",
                    "note": "TODO: 填写备注（如有）"
                }
            ]
        }
        cases.append(case)
    
    return cases


def save_result(cases: list, batch_num: int, start: int, end: int, output_dir: str = None):
    """保存解析结果"""
    
    if output_dir is None:
        output_dir = ROOT_DIR / "解析结果"
    else:
        output_dir = Path(output_dir)
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    result = {
        "批次": batch_num,
        "序号范围": f"{start}-{end}",
        "案例数量": len(cases),
        "cases": cases
    }
    
    output_file = output_dir / f"解析结果-批次{batch_num}-序号{start}-{end}.json"
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f"✅ 已生成 {len(cases)} 个案例")
    print(f"✅ 保存至: {output_file}")
    
    return output_file


def main():
    parser = argparse.ArgumentParser(description='统一批次解析生成工具')
    parser.add_argument('--batch', type=int, required=True, help='批次编号')
    parser.add_argument('--start', type=int, help='起始序号')
    parser.add_argument('--end', type=int, help='结束序号')
    parser.add_argument('--mode', choices=['llm', 'manual'], default='manual', 
                        help='生成模式: llm=使用LLM, manual=手动模板')
    parser.add_argument('--output', type=str, help='输出目录（默认: 解析结果/）')
    
    args = parser.parse_args()
    
    # 自动推断序号范围
    if args.start is None or args.end is None:
        # 根据批次推断（假设每批次200条）
        args.start = (args.batch - 1) * 200 + 1
        args.end = args.batch * 200
        print(f"⚠️  未指定序号范围，自动推断为: {args.start}-{args.end}")
    
    print("="*80)
    print(f"批次解析生成工具 - 批次{args.batch}")
    print("="*80)
    print(f"序号范围: {args.start} - {args.end}")
    print(f"生成模式: {args.mode}")
    print()
    
    # 1. 加载原文数据
    print("1. 加载原文数据...")
    raw_data = load_raw_data(args.batch, args.start, args.end)
    if not raw_data:
        print("❌ 无数据，退出")
        return
    print(f"   已加载 {len(raw_data)} 条原文")
    
    # 2. 生成解析结果
    print(f"\n2. 生成解析结果 ({args.mode}模式)...")
    if args.mode == 'llm':
        cases = generate_with_llm(raw_data, args.batch)
    else:
        cases = generate_manual(raw_data, args.batch)
    
    if not cases:
        print("❌ 生成失败")
        return
    
    # 3. 保存结果
    print(f"\n3. 保存结果...")
    output_file = save_result(cases, args.batch, args.start, args.end, args.output)
    
    print("\n" + "="*80)
    print("✅ 生成完成！")
    print("="*80)
    print(f"\n下一步:")
    print(f"  1. 手动填写/校对: {output_file}")
    print(f"  2. 运行质量检查: cd tools && ts-node 2_check_quality.ts {output_file}")
    print(f"  3. AI自动修复: python 3_ai_reviewer.py --input {output_file}")


if __name__ == '__main__':
    main()
