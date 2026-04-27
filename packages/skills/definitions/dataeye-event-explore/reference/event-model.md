# Dataeye 事件数据模型

## 核心表关系

```
bi_event_schema (事件定义)
  ├── product_event_rel (产品-事件关联, 核心边表)
  │     ├── event_prp_rel (事件-属性绑定)
  │     └── bi_event_group_rel (事件-分组关联)
  └── bi_event_schema_property (全局属性目录)
        └── bi_event_schema_json (子字段/嵌套属性)
```

## 查询链路

1. **选项目** → `project.id` → `product.projectId`
2. **选产品** → `product.id` → `product_event_rel.product_id`
3. **列事件** → `product_event_rel` JOIN `bi_event_schema`
4. **看属性** → `event_prp_rel` WHERE `product_event_id = product_event_rel.id`

## 事件类型（bi_event_schema.type）

| 值 | 含义 | 说明 |
|----|------|------|
| custom | 自定义事件 | 业务自行埋点的事件 |
| preset | 预置事件 | SDK 自动采集（如 app_start, page_view） |
| virtual | 虚拟事件 | 基于规则/SQL 计算的复合事件 |

## 属性类型（bi_event_schema_property.type）

| 值 | 含义 |
|----|------|
| event | 事件属性（跟随事件上报） |
| user | 用户属性 |
| virtual | 虚拟/计算属性 |

## 数据类型（DataSourceFieldType）

| 枚举值 | 映射 |
|--------|------|
| 1 | datetime |
| 2 | string |
| 3 | double (数值) |

## API 端点

| MCP 工具 | 对应 dataeye API |
|----------|-----------------|
| dataeye_project_list (project) | GET /tenant/project/list/user |
| dataeye_project_list (product) | GET /tenant/product/list/user |
| dataeye_event_list | POST /eventManage/event/page |
| dataeye_event_property (指定事件) | POST /eventManage/event/property/page |
| dataeye_event_property (全产品) | GET /eventManage/event/property/nopage |
