---
name: dataeye-event-management
description: DataEye 事件管理向导 — 引导 AI 完成虚拟事件创建、属性管理的完整流程，包含 dryRun 预览确认
triggers:
  - 创建事件
  - 新增事件
  - 添加事件
  - 修改事件
  - 编辑事件
  - 管理属性
  - 新增属性
  - 添加属性
  - 创建虚拟事件
requiredTools:
  - dataeye_project_list
  - dataeye_event_list
  - dataeye_event_group_list
  - dataeye_event_create
  - dataeye_event_update
  - dataeye_event_status
  - dataeye_event_property_save
---

# DataEye 事件管理向导

## 重要说明

**原始埋点由 SDK 上报自动生成，AI 只能创建"虚拟事件"**（对已采集事件的组合/过滤视图）。
若用户需要创建新的原始埋点，应引导其在 DataEye 界面完成 SDK 接入。

## 创建虚拟事件完整流程

### 步骤 1：确定目标产品
```
dataeye_project_list(type="project") → 展示项目列表，让用户选择
dataeye_project_list(type="product", projectId=xxx) → 展示产品列表，确定 productId
```
若列表为空，参考 dataeye-permissions Skill 给出权限诊断。

### 步骤 2：了解用户意图
收集必要信息：
- 虚拟事件名称（英文，如 vt_first_purchase）
- 展示名（中文，如"首次购买"）
- 引用哪些基础事件（必须是已存在的事件名，可先调 `dataeye_event_list` 确认）
- 是否需要放入特定分组

### 步骤 3：可选 — 获取分组
```
dataeye_event_group_list(productId=xxx) → 展示现有分组供用户选择
// 如需创建新分组
dataeye_event_group_add(productId=xxx, name="分组名", dryRun=true) → 确认后创建
```

### 步骤 4：dryRun 预览
```
dataeye_event_create(productId=xxx, eventName=..., indexInfos=[...], dryRun=true)
```
向用户展示：
```
📋 即将创建虚拟事件
• 产品: [产品名] (id: xxx)
• 事件名: vt_first_purchase
• 展示名: 首次购买
• 引用事件: purchase_complete
• 所属分组: [分组名]
确认执行？
```

### 步骤 5：用户确认后执行
用户回复"确认"/"是"/"OK"/"好" 后：
```
dataeye_event_create(dryRun=false)
→ 返回结果中取 eventId（用于后续关联属性）
```

### 步骤 6：可选 — 创建并关联属性
若用户需要为事件添加属性：
```
dataeye_event_property_save(
  productId=xxx,
  propertyName="channel",
  dataType="string",
  saveType=1,           // 事件属性
  productEventIds=[步骤5返回的 eventId],
  dryRun=false
)
```
**重要**：必须用步骤 5 中返回的 `eventId` 填充 `productEventIds`。

### 步骤 7：报告结果
```
✅ 虚拟事件 vt_first_purchase 创建成功（id: xxxx）
✅ 属性 channel 已关联
[如果有失败的步骤，说明哪一步失败、原因，并给出继续完成的建议]
```

## 修改事件流程

```
1. 确认用户要修改哪个事件（可调 dataeye_event_list 获取 id）
2. dataeye_event_update(eventId=xxx, productId=xxx, dryRun=true) → 展示修改前后对比
3. 用户确认后 → dataeye_event_update(dryRun=false)
```

## 停用事件

⚠️ 停用后该事件在所有分析报表中不可见，需向用户明确说明风险：
```
dataeye_event_status(id=xxx, status=0, dryRun=true)
→ 展示警告信息
→ 用户确认后 dataeye_event_status(dryRun=false)
```

## 错误处理

| 错误 | 处理方式 |
|------|----------|
| 事件名已存在（后端报错） | 提示用户换一个名称，或使用 dataeye_event_list 查看现有事件 |
| indexInfos 中的事件名不存在 | 调 dataeye_event_list 确认正确的事件名 |
| 分组名超出 10 字符 | dataeye_event_group_add 工具会前置校验并返回错误提示 |
