#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI自动审核修复工具
版本：v3.0

功能：
  1. 读取质量检查工具（2_check_quality.ts）的输出
  2. 按P0/P1/P2优先级排序
  3. 调用LLM进行智能修复
  4. 输出修复建议JSON（等待用户审判）

使用方法：
  python 3_ai_reviewer.py --input 解析结果-批次16.json --check-report check_report.json
  python 3_ai_reviewer.py --input 解析结果-批次16.json --auto-fix  # 跳过人工审判，直接应用修复
"""

import json
import argparse
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional

# 添加项目根目录到路径
ROOT_DIR = Path(__file__).parent.parent
sys.path.append(str(ROOT_DIR))

from tools.utils.validators import (
    has_cumulative_limit,
    has_termination,
    detect_payment_period,
    check_description_completeness,
    validate_age_operator,
    validate_formula
)
from tools.utils.fixers import (
    fix_cumulative_limit_note,
    fix_termination_note,
    fix_payment_period,
    fix_description_completeness,
    remove_stage_level_note,
    add_continuous_payment_frequency,
    fix_formula_format
)


class AIReviewer:
    """AI审核修复器"""
    
    def __init__(self, input_file: str, check_report: Optional[str] = None, auto_fix: bool = False):
        self.input_file = Path(input_file)
        self.check_report = Path(check_report) if check_report else None
        self.auto_fix = auto_fix
        
        self.data = None
        self.issues = []
        self.fixes = []
    
    def load_data(self):
        """加载解析结果数据"""
        with open(self.input_file, 'r', encoding='utf-8') as f:
            self.data = json.load(f)
        
        print(f"✅ 已加载 {len(self.data.get('cases', []))} 个案例")
    
    def load_check_report(self):
        """加载检查报告（如果有）"""
        if not self.check_report or not self.check_report.exists():
            print("⚠️  未提供检查报告，将进行全面检查")
            return
        
        with open(self.check_report, 'r', encoding='utf-8') as f:
            self.issues = json.load(f)
        
        print(f"✅ 已加载检查报告: {len(self.issues)} 个问题")
    
    def run_auto_checks(self):
        """运行自动检查（如果没有检查报告）"""
        print("\n运行自动检查...")
        
        cases = self.data.get('cases', [])
        issue_count = 0
        
        for case in cases:
            序号 = case.get('序号')
            责任名称 = case.get('责任名称')
            责任原文 = case.get('责任原文', '')
            
            # 检查1: 累计次数限制
            if has_cumulative_limit(责任原文):
                note = case.get('note', '')
                if not ('累计' in note and '次' in note):
                    self.issues.append({
                        'severity': 'P1',
                        'type': 'missing_cumulative_limit',
                        'case_number': 序号,
                        'case_name': 责任名称,
                        'message': '原文有累计次数限制，但note中未体现'
                    })
                    issue_count += 1
            
            # 检查2: 终止表述
            if has_termination(责任原文):
                note = case.get('note', '')
                if not ('次为限' in note or '最多赔' in note):
                    self.issues.append({
                        'severity': 'P1',
                        'type': 'missing_termination_note',
                        'case_number': 序号,
                        'case_name': 责任名称,
                        'message': '原文有"合同终止"表述，但note中未体现赔付次数限制'
                    })
                    issue_count += 1
            
            # 检查3: 交费期条件
            if detect_payment_period(责任原文):
                for stage_idx, stage in enumerate(case.get('payoutAmount', []), 1):
                    if 'paymentPeriodStatus' not in stage:
                        self.issues.append({
                            'severity': 'P2',
                            'type': 'missing_payment_period',
                            'case_number': 序号,
                            'case_name': 责任名称,
                            'stage': stage_idx,
                            'message': '原文有交费期条件，但stage中未体现'
                        })
                        issue_count += 1
            
            # 检查4: naturalLanguageDescription完整性
            for stage_idx, stage in enumerate(case.get('payoutAmount', []), 1):
                is_complete, missing = check_description_completeness(stage, 责任原文)
                if not is_complete:
                    self.issues.append({
                        'severity': 'P2',
                        'type': 'incomplete_description',
                        'case_number': 序号,
                        'case_name': 责任名称,
                        'stage': stage_idx,
                        'missing': missing,
                        'message': f'自然语言描述不完整，缺少: {", ".join(missing)}'
                    })
                    issue_count += 1
            
            # 检查5: stage级别有note
            for stage_idx, stage in enumerate(case.get('payoutAmount', []), 1):
                if 'note' in stage:
                    self.issues.append({
                        'severity': 'P0',
                        'type': 'stage_level_note',
                        'case_number': 序号,
                        'case_name': 责任名称,
                        'stage': stage_idx,
                        'message': 'note应该在案例级别，不应在stage级别'
                    })
                    issue_count += 1
            
            # 检查6: continuousPayment缺少frequency
            for stage_idx, stage in enumerate(case.get('payoutAmount', []), 1):
                cp = stage.get('continuousPayment')
                if cp and 'frequency' not in cp:
                    self.issues.append({
                        'severity': 'P2',
                        'type': 'missing_frequency',
                        'case_number': 序号,
                        'case_name': 责任名称,
                        'stage': stage_idx,
                        'message': 'continuousPayment缺少frequency字段'
                    })
                    issue_count += 1
        
        print(f"✅ 检查完成: 发现 {issue_count} 个问题")
    
    def apply_fixes(self):
        """应用自动修复"""
        print("\n应用自动修复...")
        
        # 按severity排序 (P0 > P1 > P2)
        severity_order = {'P0': 0, 'P1': 1, 'P2': 2}
        sorted_issues = sorted(self.issues, key=lambda x: severity_order.get(x.get('severity', 'P2'), 2))
        
        fixed_count = 0
        
        cases = self.data.get('cases', [])
        case_map = {c.get('序号'): c for c in cases}
        
        for issue in sorted_issues:
            case_number = issue.get('case_number')
            case = case_map.get(case_number)
            
            if not case:
                continue
            
            issue_type = issue.get('type')
            fixed = False
            fix_detail = {
                'issue': issue,
                'fix_applied': False,
                'fix_description': ''
            }
            
            # 根据问题类型应用修复
            if issue_type == 'missing_cumulative_limit':
                fixed = fix_cumulative_limit_note(case)
                fix_detail['fix_description'] = f"已添加累计次数限制到note: {case.get('note')}"
            
            elif issue_type == 'missing_termination_note':
                fixed = fix_termination_note(case)
                fix_detail['fix_description'] = f"已添加终止表述到note: {case.get('note')}"
            
            elif issue_type == 'missing_payment_period':
                stage_idx = issue.get('stage', 1) - 1
                stages = case.get('payoutAmount', [])
                if stage_idx < len(stages):
                    fixed_stages = fix_payment_period(case)
                    fixed = fixed_stages > 0
                    fix_detail['fix_description'] = f"已添加交费期条件到 {fixed_stages} 个stage"
            
            elif issue_type == 'incomplete_description':
                stage_idx = issue.get('stage', 1) - 1
                stages = case.get('payoutAmount', [])
                if stage_idx < len(stages):
                    stage = stages[stage_idx]
                    new_desc = fix_description_completeness(stage, case.get('责任原文', ''))
                    if new_desc:
                        old_desc = stage.get('naturalLanguageDescription', '')
                        stage['naturalLanguageDescription'] = new_desc
                        fixed = True
                        fix_detail['fix_description'] = f"已更新描述: {old_desc[:30]}... → {new_desc[:30]}..."
            
            elif issue_type == 'stage_level_note':
                stage_idx = issue.get('stage', 1) - 1
                stages = case.get('payoutAmount', [])
                if stage_idx < len(stages):
                    stage = stages[stage_idx]
                    fixed = remove_stage_level_note(stage)
                    fix_detail['fix_description'] = f"已移除stage级别的note"
            
            elif issue_type == 'missing_frequency':
                stage_idx = issue.get('stage', 1) - 1
                stages = case.get('payoutAmount', [])
                if stage_idx < len(stages):
                    stage = stages[stage_idx]
                    fixed = add_continuous_payment_frequency(stage)
                    fix_detail['fix_description'] = f"已添加frequency字段"
            
            if fixed:
                fixed_count += 1
                fix_detail['fix_applied'] = True
            
            self.fixes.append(fix_detail)
        
        print(f"✅ 修复完成: {fixed_count}/{len(sorted_issues)} 个问题已修复")
        
        return fixed_count
    
    def save_fixes_report(self):
        """保存修复报告"""
        output_file = self.input_file.parent / f"{self.input_file.stem}_fix_report.json"
        
        report = {
            'input_file': str(self.input_file),
            'total_issues': len(self.issues),
            'fixes_applied': sum(1 for f in self.fixes if f.get('fix_applied')),
            'fixes': self.fixes
        }
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        
        print(f"\n✅ 修复报告已保存: {output_file}")
        return output_file
    
    def save_fixed_data(self):
        """保存修复后的数据"""
        if self.auto_fix:
            # 直接覆盖原文件
            output_file = self.input_file
        else:
            # 保存为新文件
            output_file = self.input_file.parent / f"{self.input_file.stem}_fixed.json"
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2)
        
        print(f"✅ 修复后数据已保存: {output_file}")
        return output_file
    
    def run(self):
        """运行完整流程"""
        print("="*80)
        print("AI自动审核修复工具")
        print("="*80)
        print(f"输入文件: {self.input_file}")
        print(f"自动应用修复: {'是' if self.auto_fix else '否（生成修复建议）'}")
        print()
        
        # 1. 加载数据
        self.load_data()
        
        # 2. 加载或运行检查
        if self.check_report:
            self.load_check_report()
        else:
            self.run_auto_checks()
        
        if not self.issues:
            print("\n✅ 没有发现问题，无需修复")
            return
        
        # 3. 应用修复
        fixed_count = self.apply_fixes()
        
        # 4. 保存报告
        self.save_fixes_report()
        
        # 5. 保存修复后的数据
        if self.auto_fix or fixed_count > 0:
            self.save_fixed_data()
        
        print("\n" + "="*80)
        print("✅ 审核修复完成！")
        print("="*80)
        
        if not self.auto_fix:
            print("\n下一步:")
            print(f"  1. 审查修复报告: {self.input_file.stem}_fix_report.json")
            print(f"  2. 如果满意，使用 --auto-fix 应用修复")


def main():
    parser = argparse.ArgumentParser(description='AI自动审核修复工具')
    parser.add_argument('--input', required=True, help='解析结果JSON文件')
    parser.add_argument('--check-report', help='检查报告JSON文件（可选）')
    parser.add_argument('--auto-fix', action='store_true', help='自动应用修复（不等待审判）')
    
    args = parser.parse_args()
    
    reviewer = AIReviewer(
        input_file=args.input,
        check_report=args.check_report,
        auto_fix=args.auto_fix
    )
    
    reviewer.run()


if __name__ == '__main__':
    main()
