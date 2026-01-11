/**
 * 保险责任智能解读助手页面
 * 
 * 功能：
 * - 输入保险条款文本
 * - AI 智能解析保障责任信息
 * - 展示解析结果（可编辑）
 * - 保存和导出解析结果
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function CoverageParserPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/')}
            className="hover:bg-gray-100"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回首页
          </Button>
          <h1 className="text-lg font-semibold text-gray-900">保险责任智能解读助手</h1>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <p className="text-gray-600 text-center">
            功能开发中，敬请期待...
          </p>
        </div>
      </div>
    </div>
  );
}

