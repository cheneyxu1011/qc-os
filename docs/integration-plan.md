# QC OS 上线与系统对接预留方案

## 1. 定位

当前页面建议作为 **QC OS 测试原型** 使用，用来先把车间质量改善闭环跑起来。

后续正式系统定位：

- **QC OS**：生产过程中的质检问题提报、纠正措施、改善照片、部门复核、主管归档、KPI归集。
- **Factory OS**：款号、品牌、颜色、生产批次、订单、工序、车间任务等主数据来源。
- **People OS**：部门、人员、角色、权限、在职状态等人员主数据来源。

QC OS 不建议长期维护自己的款号库和人员库，正式上线后应改成：

- 款号从 Factory OS 同步或查询。
- 人员从 People OS 同步或查询。
- QC OS 只保存质量事件、照片、措施、复核、归档、KPI结果。

## 2. GitHub 仓库

建议新建仓库：

```text
qc-os
```

推荐项目结构：

```text
qc-os/
  app/
    dashboard/
    reports/
    tasks/
    review/
    archive/
    people/
    api/
      reports/
      upload-url/
      integrations/
  components/
    ReportForm.tsx
    CorrectiveReportPaper.tsx
    ProjectorBoard.tsx
    PeoplePicker.tsx
    PhotoUploader.tsx
  lib/
    supabase/
    s3/
    factory-os/
    people-os/
    permissions/
  database/
    migrations/
    schema.sql
  docs/
    integration-contract.md
    deployment.md
  .env.example
  README.md
```

推荐技术：

- Next.js / React
- Supabase Postgres
- Amazon S3 图片存储
- Vercel 部署
- 域名：`qc-os.vanwellgroup.com`

## 3. Vercel 与域名

正式上线目标：

```text
https://qc-os.vanwellgroup.com
```

Vercel 环境变量预留：

```env
NEXT_PUBLIC_APP_NAME="QC OS"
NEXT_PUBLIC_APP_ENV="production"

NEXT_PUBLIC_SUPABASE_URL=""
NEXT_PUBLIC_SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""

AWS_REGION=""
AWS_S3_BUCKET_QC_IMAGES=""
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""

FACTORY_OS_API_BASE_URL=""
FACTORY_OS_API_KEY=""

PEOPLE_OS_API_BASE_URL=""
PEOPLE_OS_API_KEY=""

QC_OS_PUBLIC_BASE_URL="https://qc-os.vanwellgroup.com"
```

注意：

- `SUPABASE_SERVICE_ROLE_KEY`、AWS密钥、Factory OS/People OS API Key 只能放服务端环境变量。
- 前端只能使用 `NEXT_PUBLIC_SUPABASE_URL` 和公开匿名 key。
- 图片上传建议由后端生成 S3 presigned URL，前端不要直接暴露 AWS Secret。

## 4. Supabase 数据表预留

### 4.1 质量报告主表

```sql
create table qc_reports (
  id uuid primary key default gen_random_uuid(),
  report_no text not null unique,
  found_date date not null,
  brand text,
  style_no text,
  color text,
  severity text not null,
  source_department_id text,
  source_department_name text,
  kpi_enabled boolean default true,
  reporter_person_id text,
  reporter_name text,
  problem_description text,
  root_cause text,
  status text not null default 'draft',
  archive_status text default 'unlocked',
  factory_style_id text,
  factory_order_id text,
  factory_production_batch_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 4.2 报告责任部门

```sql
create table qc_report_responsible_departments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references qc_reports(id) on delete cascade,
  department_id text,
  department_name text
);
```

### 4.3 纠正与预防措施

```sql
create table qc_corrective_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references qc_reports(id) on delete cascade,
  sequence_no int not null,
  action_type text not null,
  action_content text not null,
  due_date date,
  status text not null default 'pending',
  reminder_note text,
  completed_at timestamptz,
  completed_by_person_id text,
  completed_by_name text,
  execution_note text,
  created_at timestamptz default now()
);
```

### 4.4 措施责任人

```sql
create table qc_action_assignees (
  id uuid primary key default gen_random_uuid(),
  action_id uuid references qc_corrective_actions(id) on delete cascade,
  person_id text,
  person_name text,
  department_id text,
  department_name text
);
```

规则预留：

- 同一措施多人负责时，任意一人完成，该措施可标记为已执行。
- 仍保留所有被分配人员、实际完成人、完成时间。

### 4.5 图片附件

```sql
create table qc_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references qc_reports(id) on delete cascade,
  action_id uuid references qc_corrective_actions(id) on delete set null,
  file_type text not null,
  s3_bucket text not null,
  s3_key text not null,
  public_url text,
  uploaded_by_person_id text,
  uploaded_by_name text,
  uploaded_at timestamptz default now()
);
```

`file_type` 建议枚举：

```text
problem_before
action_after
review_evidence
archive_pdf
archive_image
comment_attachment
```

### 4.6 复核与归档

```sql
create table qc_reviews (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references qc_reports(id) on delete cascade,
  review_department_id text,
  review_department_name text,
  reviewer_person_id text,
  reviewer_name text,
  review_result text not null,
  review_comment text,
  reviewed_at timestamptz default now()
);

create table qc_archives (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references qc_reports(id) on delete cascade,
  approved_by_person_id text,
  approved_by_name text,
  archive_comment text,
  kpi_locked boolean default true,
  archived_at timestamptz default now()
);
```

### 4.7 KPI结果

```sql
create table qc_kpi_entries (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references qc_reports(id) on delete cascade,
  person_id text,
  person_name text,
  department_id text,
  department_name text,
  month text not null,
  base_score int default 100,
  deduction_points int not null,
  reason text,
  locked boolean default false,
  created_at timestamptz default now()
);
```

## 5. S3 图片路径规则

建议 S3 key 按报告编号和用途归档：

```text
qc-os/
  {year}/
    {report_no}/
      problem-before/
        {uuid}.jpg
      action-after/
        action-{sequence_no}-{uuid}.jpg
      review-evidence/
        {uuid}.jpg
      archive/
        report.pdf
        report.png
```

示例：

```text
qc-os/2026/XCJ2026-001/problem-before/8f2c.jpg
qc-os/2026/XCJ2026-001/action-after/action-1-91ad.jpg
qc-os/2026/XCJ2026-001/archive/report.pdf
```

## 6. Factory OS 对接预留

QC OS 需要从 Factory OS 获取：

- 品牌
- 款号
- 颜色
- 订单号
- 生产批次
- 工序/车间
- 生产状态

建议接口预留：

```http
GET /api/factory/styles?keyword=JK57
GET /api/factory/styles/{style_id}
GET /api/factory/orders/{order_id}
GET /api/factory/production-batches/{batch_id}
```

QC报告保存时保留 Factory OS 外键：

```text
factory_style_id
factory_order_id
factory_production_batch_id
```

这样后续可以按款号、订单、批次追溯质量问题。

## 7. People OS 对接预留

QC OS 当前有人员库页面，但正式上线后应变成 People OS 同步数据。

People OS 建议提供：

```http
GET /api/people/departments
GET /api/people/persons?department_id=
GET /api/people/persons/{person_id}
```

QC OS 本地只保存快照字段：

```text
person_id
person_name
department_id
department_name
```

原因：

- `person_id` 用于长期稳定关联。
- `person_name`、`department_name` 用于报告归档时保留当时显示内容。
- 即使员工后续调部门或改名，历史报告也不会错乱。

## 8. 权限预留

建议角色：

```text
reporter        提交问题、上传问题照片
assignee        查看自己的任务、上传改善照片、标记已执行
source_reviewer 来源部门复核
qc              监督、补充验证
manager         归档、锁定、撤回归档
business        查看客户相关问题、补充评论
admin           系统配置、人员库/同步管理
```

权限原则：

- 责任人不能改原始问题描述。
- 复核人不能改责任人执行说明。
- 归档后不能改责任人、措施、KPI。
- 厂长/主管可以撤回归档。
- 业务部可以评论，不默认拥有修改主数据权限。

## 9. 状态机预留

报告闭环状态建议固定：

```text
draft               草稿
submitted           已提交
assigned            已分配责任
in_progress         责任人执行中
executed            已执行，待复核
review_passed       来源部门复核通过
review_rejected     退回改善
archived            已归档锁定
```

页面映射：

- 现场双屏：显示未关闭、待执行、逾期、待复核。
- 纠正报告：创建/编辑草稿和措施。
- 我的任务：责任人执行。
- 部门复核：来源部门复核。
- 归档审批：主管归档。
- 月KPI汇总：归档后统计。
- 人员库：测试阶段维护，正式阶段接 People OS。

## 10. 当前原型到正式系统迁移步骤

### 阶段 1：车间试运行

- 继续使用当前 HTML 原型确认流程。
- 固定字段、角色、报告样式。
- 收集现场反馈：谁提交、谁执行、谁复核、谁归档。

### 阶段 2：建立 GitHub 仓库

- 新建 `qc-os` 仓库。
- 将当前页面拆成 React/Next.js 页面和组件。
- 建立 `.env.example`、数据库 schema、接口文档。

### 阶段 3：接 Supabase

- 先接报告、措施、人员库、复核、归档。
- 用 Supabase RLS 做权限隔离。
- 图片不进入 Supabase Storage，Supabase 只保存 S3 key、文件类型、上传人、所属报告和措施序号。

### 阶段 4：接 S3

- 后端生成 presigned POST upload form。
- 前端直传 S3，单文件默认限制 15MB。
- Supabase 只保存图片 metadata 和 S3 key。
- S3 bucket 保持 private；如需直接预览，可后续接 CloudFront 或由后端生成短期查看链接。

### 阶段 5：接 Factory OS / People OS

- 款号、品牌、颜色从 Factory OS 查询。
- 部门人员从 People OS 同步。
- QC OS 人员库页面改为只读同步状态，保留管理员手动刷新。

### 阶段 6：Vercel 上线

- Vercel 项目绑定 GitHub `qc-os`。
- 配置环境变量。
- 绑定域名 `qc-os.vanwellgroup.com`。
- 生产环境开启日志、错误监控和备份策略。

## 11. 当前原型需要保留的对接点

当前 HTML 原型里应保留这些概念，不要删：

- 报告编号 `XCJ2026-001`
- Factory OS 款号字段
- People OS 人员库概念
- 图片多类型：改善前、改善后、复核证据、归档报告
- 责任部门多选
- 措施责任人多选
- 来源部门复核
- 主管归档锁定
- KPI按责任人归集

这些就是后续迁移到正式 `qc-os` 仓库时的核心字段。
