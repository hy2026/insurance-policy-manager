/**
 * 责任描述展示组件
 * 演示如何使用generateFullDescription工具
 */

import React from 'react';
import { generateFullDescription, generateShortDescription } from '../utils/generateFullDescription';

interface CoverageDescriptionDisplayProps {
  coverage: {
    coverageName: string;
    payoutAmount?: any[];
    note?: string;
  };
  mode?: 'full' | 'short'; // full: 完整描述, short: 简短描述
}

/**
 * 责任描述展示组件
 */
export const CoverageDescriptionDisplay: React.FC<CoverageDescriptionDisplayProps> = ({
  coverage,
  mode = 'full',
}) => {
  const description = mode === 'full' 
    ? generateFullDescription(coverage)
    : generateShortDescription(coverage);

  return (
    <div className="coverage-description">
      {mode === 'full' ? (
        <p className="text-gray-700 leading-relaxed">{description}</p>
      ) : (
        <span className="text-sm text-gray-600">{description}</span>
      )}
    </div>
  );
};

/**
 * 使用示例1：在保单详情页展示完整描述
 */
export function PolicyDetailExample() {
  const coverage = {
    coverageName: '第一次重大疾病保险金',
    payoutAmount: [
      {
        stageNumber: 1,
        naturalLanguageDescription: '等待期后、第1-9保单年度、按基本保额的150%赔付',
      },
      {
        stageNumber: 2,
        naturalLanguageDescription: '等待期后、第10保单年度起、按基本保额的100%赔付',
      },
    ],
    note: '给付以1次为限',
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">{coverage.coverageName}</h3>
      <CoverageDescriptionDisplay coverage={coverage} mode="full" />
    </div>
  );
}

/**
 * 使用示例2：在列表页展示简短描述
 */
export function CoverageListExample() {
  const coverages = [
    {
      coverageName: '第一次重大疾病保险金',
      payoutAmount: [
        { stageNumber: 1, formula: '基本保额 * 150%' },
        { stageNumber: 2, formula: '基本保额 * 100%' },
      ],
    },
    {
      coverageName: '轻症疾病保险金',
      payoutAmount: [
        { stageNumber: 1, formula: '基本保额 * 30%' },
      ],
    },
  ];

  return (
    <div className="space-y-2">
      {coverages.map((coverage, idx) => (
        <div key={idx} className="flex justify-between items-center p-3 border rounded">
          <span className="font-medium">{coverage.coverageName}</span>
          <CoverageDescriptionDisplay coverage={coverage} mode="short" />
        </div>
      ))}
    </div>
  );
}

export default CoverageDescriptionDisplay;
