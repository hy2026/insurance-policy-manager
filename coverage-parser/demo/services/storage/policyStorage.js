// ==================== 数据存储服务（职责：仅负责数据持久化）====================
class PolicyStorageService {
  static load() {
    const saved = localStorage.getItem('insurance_policies');
    return saved ? JSON.parse(saved) : [];
  }

  static save(policies) {
    localStorage.setItem('insurance_policies', JSON.stringify(policies));
  }
}

