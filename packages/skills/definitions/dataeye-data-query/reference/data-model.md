# Dataeye 数据模型与查询参考

## 数据表层级

```
Organization (组织)
  └── Project (项目)
        └── Product (产品)
              ├── bi_data_source (上传/自定义数据表)
              │     └── bi_data_source_structure (字段结构)
              └── StarRocks 物理表
                    ├── dws_event_analysis_saas_view_{productId} (事件宽表)
                    └── 其他业务表
```

## 数据源路由

dataeye 采用多租户动态数据源架构：
- 每个组织 (orgId) + 项目 (projectId) 对应一个独立的 StarRocks 数据源
- SQL 查询通过 `projectId` 参数自动路由到正确的数据源
- 用户只能查询其有权限的项目下的数据

## bi_data_source 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 自增主键 |
| tableName | string | StarRocks 中的物理表名 |
| remark | string | 描述/备注 |
| projectId | string | 关联项目 ID（逗号分隔多项目） |
| orgId | string | 组织 ID |
| status | int | 状态 |
| ctType | int | 1=全量, 2=增量, 3=滚动覆盖 |

## bi_data_source_structure 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| dataSourceId | int | 关联 bi_data_source.id |
| identifier | string | 列名 |
| fieldName | string | 别名 |
| dataType | int | 1=datetime, 2=string, 3=double |
| position | int | 排序位置 |
| primaryKey | string | 是否主键 |

## 事件分析宽表结构参考

`dws_event_analysis_saas_view_{productId}` 通常包含：

| 字段 | 说明 |
|------|------|
| event_name | 事件名称 |
| event_time | 事件时间戳 |
| user_id / distinct_id | 用户标识 |
| dt / ds | 分区日期 |
| properties | JSON 格式的事件属性 |
| 各展开属性字段 | 根据埋点配置动态生成 |

## 常用 SQL 模板

### 日活统计
```sql
SELECT dt, COUNT(DISTINCT user_id) AS dau
FROM dws_event_analysis_saas_view_{productId}
WHERE dt >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
GROUP BY dt ORDER BY dt
```

### 事件计数 Top N
```sql
SELECT event_name, COUNT(*) AS cnt
FROM dws_event_analysis_saas_view_{productId}
WHERE dt = CURDATE()
GROUP BY event_name ORDER BY cnt DESC LIMIT 10
```

### 数据表行查询
```sql
SELECT * FROM {tableName} LIMIT 100
```

## API 对应

| MCP 工具 | dataeye API | 说明 |
|----------|-------------|------|
| dataeye_table_list | GET /biDataSource/pageByBiDataSource | 业务表列表 |
| dataeye_table_detail | GET /biDataSource/getByBiDataSource | 表+字段详情 |
| dataeye_dws_table | GET /biDwsTable/listDwsTable | StarRocks 物理表列表 |
| dataeye_dws_table (tableName) | GET /biDwsTable/getTableInfo | StarRocks 表结构 |
| dataeye_sql_query | POST /sql-editor/execSql | 执行 SQL |
