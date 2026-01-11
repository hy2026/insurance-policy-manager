// ==================== 责任管理服务（职责：仅负责责任数据CRUD）====================
class CoverageManagerService {
  static create(coverageName, coverageType, clauseText, parseResult) {
    return {
      id: Date.now().toString(),
      name: coverageName,
      type: coverageType,
      clauseText: clauseText,
      parseResult: parseResult
    };
  }

  static add(coverages, coverage) {
    coverages.push(coverage);
    return coverages;
  }

  static update(coverages, index, updates) {
    if (index >= 0 && index < coverages.length) {
      coverages[index] = { ...coverages[index], ...updates };
    }
    return coverages;
  }

  static delete(coverages, index) {
    if (index >= 0 && index < coverages.length) {
      coverages.splice(index, 1);
    }
    return coverages;
  }
}

