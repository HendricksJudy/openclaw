# ClawHospital 开发计划书

## 基于 OpenClaw 的医院信息管理系统改造方案

**版本:** v1.1-draft (国际市场版)
**日期:** 2026-02-16
**基线项目:** OpenClaw (多渠道 AI 网关平台)

---

## 目录

1. [项目概述](#1-项目概述)
2. [改造理念与核心优势](#2-改造理念与核心优势)
3. [系统架构设计](#3-系统架构设计)
4. [模块规划](#4-模块规划)
5. [数据库设计](#5-数据库设计)
6. [OpenClaw 资产复用清单](#6-openclaw-资产复用清单)
7. [需新建的医疗业务模块](#7-需新建的医疗业务模块)
8. [需改造/删除的模块](#8-需改造删除的模块)
9. [安全与合规](#9-安全与合规)
10. [开发阶段与里程碑](#10-开发阶段与里程碑)
11. [技术栈总结](#11-技术栈总结)
12. [风险与应对](#12-风险与应对)
13. [附录：目录结构规划](#13-附录目录结构规划)

---

## 1. 项目概述

### 1.1 项目背景

OpenClaw 是一个成熟的多渠道 AI 网关平台，具备以下核心能力：
- **多渠道消息网关**：支持 15+ 消息平台的统一接入
- **AI Agent 运行时**：内置 Pi Agent 智能体引擎，支持工具调用与流式响应
- **插件化架构**：31 个扩展插件 + 48 个技能模块，高度可扩展
- **会话管理**：完善的消息路由、分组隔离、激活策略
- **多端覆盖**：Web UI、iOS、Android、macOS 客户端
- **安全机制**：Token 认证、DM 策略、工具权限控制

### 1.2 改造目标

将 OpenClaw 改造为 **ClawHospital**——一套继承 OpenClaw 多渠道通信与 AI 能力的医院信息管理系统（HIS），实现：

- 以 AI Agent 为核心的智能辅助诊疗
- 多渠道医患沟通（WhatsApp/Telegram/Slack/SMS/Discord/Web Portal）
- 完整的门诊/住院/药房/检验/财务业务闭环
- 符合国际医疗信息化标准（HIPAA/GDPR/HL7 FHIR）

### 1.3 目标用户

| 角色 | 说明 |
|------|------|
| 医生 | 门诊/住院医师，使用诊疗工作站 |
| 护士 | 护理站操作，医嘱执行确认 |
| 药剂师 | 药房管理，发药审核 |
| 检验/检查科 | 检验报告录入，PACS 接口 |
| 收费/财务 | 挂号收费、保险结算 |
| 患者 | 通过多渠道预约、查询、随访 |
| 系统管理员 | 系统配置、权限管理、运维监控 |

---

## 2. 改造理念与核心优势

### 2.1 "AI-Native HIS" 理念

ClawHospital 不是传统 HIS 加上 AI 功能，而是 **以 AI Agent 为中枢** 构建的医院信息系统：

```
传统 HIS:  业务模块 → 数据库 → 报表
ClawHospital:  业务模块 → AI Agent 中枢 → 智能决策 → 多渠道触达
```

### 2.2 继承 OpenClaw 的核心优势

| OpenClaw 能力 | ClawHospital 应用场景 |
|--------------|---------------------|
| 多渠道消息网关 | 医患沟通：WhatsApp/Telegram 推送检验结果、SMS 预约提醒、Slack/Teams 院内协作 |
| AI Agent 运行时 | 智能预问诊、辅助诊断建议、用药审核、病历质控 |
| 插件架构 | 医疗业务模块均以插件形式接入，支持按需部署 |
| 技能系统 | 医疗知识库查询、药物相互作用检测、临床指南推荐 |
| 会话管理 | 医患会话、科室协作会话、急诊会诊多方通话 |
| WebSocket 网关 | 实时消息推送（急危值报警、医嘱变更通知） |
| 浏览器自动化 | 保险平台对接、外部系统数据采集 |
| 定时任务（Cron） | 排班提醒、随访计划执行、报表定时生成 |
| Web UI (Lit) | 医生/护士工作站前端 |
| 移动端 App | 移动查房、护理巡检、患者端 App |

### 2.3 差异化竞争力

1. **AI 辅助诊疗全流程**：从预问诊到随访，AI 贯穿每个环节
2. **真正的多渠道**：患者无需下载 App，通过 WhatsApp/Telegram/SMS 即可完成就医流程
3. **插件化部署**：小诊所可只部署核心模块，大型医院可全量部署
4. **低成本二次开发**：基于 TypeScript + 插件体系，开发门槛低

---

## 3. 系统架构设计

### 3.1 整体架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           接入层 (Channels) [复用+增强]                    │
│  ┌─────────┐┌─────────┐┌────────┐┌───────┐┌─────┐┌──────┐┌──────────┐ │
│  │WhatsApp  ││Telegram  ││Discord ││Slack  ││SMS  ││Web   ││Mobile App│ │
│  └────┬────┘└────┬────┘└───┬────┘└───┬───┘└──┬──┘└──┬───┘└────┬─────┘ │
│       └──────────┴─────────┴─────────┴───────┴──────┴─────────┘       │
│  ┌────────┐┌────────┐┌──────────┐┌────────┐┌──────────┐               │
│  │Signal   ││iMessage ││MS Teams  ││Matrix  ││Google    │  ...更多      │
│  │         ││         ││          ││        ││Chat     │               │
│  └────────┘└────────┘└──────────┘└────────┘└──────────┘               │
│                            ▼                                           │
├──────────────────────────────────────────────────────────────────────────┤
│                    网关层 (Gateway) [复用]                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ WebSocket RPC │ │ 消息路由引擎  │ │ 会话管理 & 权限控制       │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
│                            ▼                                    │
├─────────────────────────────────────────────────────────────────┤
│                  AI Agent 中枢 [复用+增强]                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │预问诊Agent│ │诊断辅助   │ │用药审核   │ │病历质控Agent     │   │
│  │          │ │Agent     │ │Agent     │ │                  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
│                            ▼                                    │
├─────────────────────────────────────────────────────────────────┤
│                    业务服务层 (Extensions)                        │
│  ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐ │
│  │门诊管理 ││住院管理 ││药房管理 ││检验管理 ││财务结算 ││排班管理 │ │
│  └────────┘└────────┘└────────┘└────────┘└────────┘└────────┘ │
│  ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐ │
│  │电子病历 ││护理管理 ││医嘱系统 ││库存管理 ││报表统计 ││系统管理 │ │
│  └────────┘└────────┘└────────┘└────────┘└────────┘└────────┘ │
│                            ▼                                    │
├─────────────────────────────────────────────────────────────────┤
│                      数据持久层                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐       │
│  │PostgreSQL│ │  Redis    │ │ MinIO/S3 │ │ SQLite-Vec       │       │
│  │(主数据库) │ │(缓存/队列)│ │(文件存储) │ │(AI向量检索)      │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘       │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 分层说明

| 层次 | 职责 | OpenClaw 对应 | 改造策略 |
|------|------|--------------|---------|
| 接入层 | 多渠道消息接入 | `src/channels/` + `extensions/` | 复用现有 15+ 渠道，新增 SMS 网关 + 医疗 Web 门户 |
| 网关层 | RPC 通信、路由、鉴权 | `src/gateway/` | 基本复用，增强 RBAC 权限 |
| Agent 中枢 | AI 智能体调度 | `src/agents/` | 复用引擎，新增医疗领域 Agent |
| 业务服务层 | 医疗业务逻辑 | `extensions/` | 全部新建为医疗业务插件 |
| 数据持久层 | 数据存储 | SQLite + JSON | 升级为 PostgreSQL + Redis |

### 3.3 关键设计决策

1. **数据库升级**：从 SQLite/JSON 文件存储升级为 PostgreSQL，满足医疗数据的事务性、并发性要求
2. **RBAC 权限体系**：基于角色的细粒度权限控制，替代 OpenClaw 简单的 Token 认证
3. **审计日志**：所有业务操作可追溯，满足医疗合规要求
4. **数据加密**：患者敏感数据字段级加密存储

---

## 4. 模块规划

### 4.1 核心业务模块

#### M01 - 患者管理 (patient-management)
```
功能范围：
├── 患者建档（基本信息、联系方式、保险信息）
├── 患者主索引（MPI）
├── 就诊卡管理
├── 患者合并/拆分
└── 患者画像（AI 生成健康摘要）
```

#### M02 - 门诊管理 (outpatient)
```
功能范围：
├── 预约挂号（多渠道：Web/WhatsApp/Telegram/SMS/现场）
├── 分诊叫号
├── 门诊医生工作站
│   ├── 病历书写（结构化 + 自由文本）
│   ├── 医嘱开立（药品/检验/检查/处置）
│   ├── AI 辅助诊断建议
│   └── 历史就诊记录查看
├── 门诊收费
└── 门诊药房发药
```

#### M03 - 住院管理 (inpatient)
```
功能范围：
├── 入院登记
├── 床位管理（病区/病房/床位三级）
├── 住院医生工作站
│   ├── 入院记录
│   ├── 病程记录
│   ├── 长期/临时医嘱
│   └── 出院小结
├── 护理工作站
│   ├── 医嘱执行
│   ├── 体征录入
│   ├── 护理评估量表
│   └── 护理计划
├── 转科/转床
└── 出院结算
```

#### M04 - 电子病历 (emr)
```
功能范围：
├── 结构化病历模板
├── 病历编辑器（富文本 + 结构化数据）
├── 病历签名（电子签名）
├── 病历质控（AI 自动质控）
├── 病历打印
└── 病历归档
```

#### M05 - 医嘱系统 (order)
```
功能范围：
├── 药品医嘱
├── 检验医嘱
├── 检查医嘱（含影像）
├── 处置医嘱
├── 医嘱审核（药剂师审核 + AI 合理用药审核）
├── 医嘱执行跟踪
└── 医嘱闭环管理
```

#### M06 - 药房管理 (pharmacy)
```
功能范围：
├── 药品目录维护
├── 门诊发药
├── 住院摆药
├── 退药管理
├── 药品库存
├── 效期管理
├── 药物相互作用检测（AI 技能）
└── 处方点评
```

#### M07 - 检验管理 (laboratory)
```
功能范围：
├── 检验申请接收
├── 标本采集确认
├── 检验结果录入
├── 结果审核发布
├── 危急值自动报警（多渠道推送）
├── LIS 接口
└── 质控管理
```

#### M08 - 检查管理 (examination)
```
功能范围：
├── 检查预约
├── 检查报告录入
├── PACS/RIS 接口
├── 影像查看
└── AI 辅助影像阅片提示
```

#### M09 - 财务结算 (finance)
```
功能范围：
├── 价格管理（收费项目、药品价格）
├── 门诊收费/退费
├── 住院预交金
├── 出院结算
├── 保险接口（国际医疗保险 / Medicare / Medicaid 对接）
├── 日结/月结报表
└── 发票管理
```

#### M10 - 排班管理 (scheduling)
```
功能范围：
├── 科室排班模板
├── 医生排班（门诊/值班）
├── 护士排班
├── 号源管理
├── 排班发布
└── 排班变更通知（多渠道推送）
```

### 4.2 AI 智能模块

#### A01 - 预问诊 Agent (pre-consultation-agent)
```
能力：
├── 通过 WhatsApp/Telegram/Web 等渠道与患者对话
├── 收集主诉、现病史、既往史
├── 生成结构化预问诊报告
├── 智能推荐科室
└── 复用: OpenClaw Agent 运行时 + 会话管理 + 多渠道
```

#### A02 - 辅助诊断 Agent (diagnosis-agent)
```
能力：
├── 基于症状/体征/检验结果的鉴别诊断提示
├── 临床路径推荐
├── ICD-10 编码辅助
└── 复用: OpenClaw Agent 运行时 + 技能系统
```

#### A03 - 用药审核 Agent (medication-review-agent)
```
能力：
├── 药物相互作用检测
├── 过敏交叉反应预警
├── 剂量合理性校验
├── 重复用药提醒
└── 复用: OpenClaw Agent 运行时 + 工具链
```

#### A04 - 病历质控 Agent (emr-quality-agent)
```
能力：
├── 病历完整性检查
├── 诊断与检查一致性校验
├── 时限合规性检查
├── 质控评分自动生成
└── 复用: OpenClaw Agent 运行时 + 定时任务
```

#### A05 - 患者服务 Agent (patient-service-agent)
```
能力：
├── 智能预约（多渠道对话式预约）
├── 报告查询（检验/检查结果推送）
├── 用药提醒（定时推送）
├── 随访管理（自动化随访对话）
├── 健康宣教
└── 复用: OpenClaw 多渠道 + Cron + 会话管理
```

### 4.3 系统管理模块

#### S01 - 权限管理 (auth)
```
功能范围：
├── 用户管理（员工/患者）
├── 角色管理（医生/护士/药师/收费员/管理员...）
├── 权限配置（菜单权限 + 数据权限 + 操作权限）
├── 科室组织架构
└── 登录审计日志
```

#### S02 - 基础数据 (master-data)
```
功能范围：
├── ICD-10 疾病编码库
├── 药品基础字典
├── 检验/检查项目目录
├── 收费项目目录
├── 科室/病区设置
└── 保险目录映射（CPT/HCPCS/国际保险编码）
```

#### S03 - 系统监控 (monitoring)
```
功能范围：
├── 系统运行状态监控
├── 接口调用日志
├── 性能指标 (OpenTelemetry 复用)
├── 异常告警
└── 数据备份管理
```

---

## 5. 数据库设计

### 5.1 技术选型

| 组件 | 选型 | 用途 |
|------|------|------|
| 主数据库 | PostgreSQL 16 | 业务数据、事务处理 |
| 缓存 | Redis 7 | 会话缓存、消息队列、分布式锁 |
| 向量数据库 | SQLite-Vec (复用) | AI 知识检索、相似病例匹配 |
| 文件存储 | MinIO / AWS S3 | 影像文件、病历附件、电子签名 |
| 搜索引擎 | Elasticsearch (可选) | 病历全文检索 |

### 5.2 核心实体关系

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Patient  │────▶│  Visit   │────▶│  Order   │
│  患者     │     │  就诊记录  │     │  医嘱     │
└──────────┘     └──────────┘     └──────────┘
                       │                │
                       ▼                ▼
                 ┌──────────┐    ┌──────────┐
                 │   EMR    │    │ OrderExec │
                 │  电子病历  │    │ 医嘱执行   │
                 └──────────┘    └──────────┘
                                      │
                       ┌──────────────┼──────────────┐
                       ▼              ▼              ▼
                 ┌──────────┐  ┌──────────┐  ┌──────────┐
                 │ Pharmacy │  │Laboratory│  │  Exam    │
                 │  药房发药  │  │  检验     │  │  检查    │
                 └──────────┘  └──────────┘  └──────────┘
```

### 5.3 核心数据表设计

#### 患者表 (patients)
```sql
CREATE TABLE patients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medical_record_no VARCHAR(20) UNIQUE NOT NULL,  -- 病历号
    name            VARCHAR(50) NOT NULL,            -- 姓名(加密存储)
    gender          SMALLINT NOT NULL,               -- 性别 1男 2女
    birth_date      DATE NOT NULL,                   -- 出生日期
    national_id     VARCHAR(50),                     -- 国民身份号/SSN/护照号(加密存储)
    national_id_type VARCHAR(20),                    -- 证件类型(passport/ssn/national_id/...)
    phone           VARCHAR(20),                     -- 手机号(加密存储)
    insurance_type  VARCHAR(20),                     -- 保险类型(private/medicare/medicaid/nhs/...)
    insurance_no    VARCHAR(50),                     -- 保险号码
    locale          VARCHAR(10) DEFAULT 'en',        -- 患者语言偏好
    address         TEXT,                            -- 地址
    emergency_contact VARCHAR(50),                   -- 紧急联系人
    emergency_phone VARCHAR(20),                     -- 紧急联系电话
    channel_bindings JSONB DEFAULT '{}',             -- 多渠道绑定信息
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### 就诊记录表 (visits)
```sql
CREATE TABLE visits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID NOT NULL REFERENCES patients(id),
    visit_no        VARCHAR(20) UNIQUE NOT NULL,     -- 就诊流水号
    visit_type      VARCHAR(10) NOT NULL,            -- outpatient/inpatient/emergency
    department_id   UUID NOT NULL,                   -- 就诊科室
    doctor_id       UUID NOT NULL,                   -- 接诊医生
    visit_date      TIMESTAMPTZ NOT NULL,            -- 就诊时间
    chief_complaint TEXT,                            -- 主诉
    diagnosis_codes JSONB DEFAULT '[]',              -- 诊断(ICD-10编码)
    status          VARCHAR(20) DEFAULT 'active',    -- 状态
    ai_session_id   VARCHAR(100),                    -- 关联AI会话ID
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### 医嘱表 (orders)
```sql
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id        UUID NOT NULL REFERENCES visits(id),
    order_no        VARCHAR(20) UNIQUE NOT NULL,     -- 医嘱号
    order_type      VARCHAR(20) NOT NULL,            -- drug/lab/exam/procedure
    order_category  VARCHAR(10),                     -- long_term/temp (长期/临时)
    item_code       VARCHAR(50) NOT NULL,            -- 项目编码
    item_name       VARCHAR(200) NOT NULL,           -- 项目名称
    specification   VARCHAR(200),                    -- 规格
    dosage          VARCHAR(50),                     -- 剂量
    frequency       VARCHAR(50),                     -- 频次
    route           VARCHAR(50),                     -- 给药途径
    quantity        DECIMAL(10,2),                   -- 数量
    unit            VARCHAR(20),                     -- 单位
    doctor_id       UUID NOT NULL,                   -- 开单医生
    status          VARCHAR(20) DEFAULT 'pending',   -- pending/审核中/执行中/已完成/已停止
    ai_review_result JSONB,                          -- AI审核结果
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### 电子病历表 (emr_documents)
```sql
CREATE TABLE emr_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id        UUID NOT NULL REFERENCES visits(id),
    doc_type        VARCHAR(50) NOT NULL,            -- admission/progress/discharge/...
    template_id     UUID,                            -- 模板ID
    content         JSONB NOT NULL,                  -- 结构化内容
    content_text    TEXT,                            -- 纯文本(全文检索)
    author_id       UUID NOT NULL,                   -- 书写者
    sign_status     VARCHAR(20) DEFAULT 'draft',     -- draft/signed/countersigned
    signed_at       TIMESTAMPTZ,
    quality_score   DECIMAL(5,2),                    -- AI质控评分
    quality_issues  JSONB DEFAULT '[]',              -- AI质控问题
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### 用户/员工表 (staff)
```sql
CREATE TABLE staff (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_no        VARCHAR(20) UNIQUE NOT NULL,     -- 工号
    name            VARCHAR(50) NOT NULL,
    department_id   UUID,
    role_type       VARCHAR(20) NOT NULL,            -- doctor/nurse/pharmacist/admin/...
    title           VARCHAR(50),                     -- 职称
    license_no      VARCHAR(50),                     -- 执业证号
    phone           VARCHAR(20),
    email           VARCHAR(100),
    is_active       BOOLEAN DEFAULT TRUE,
    channel_bindings JSONB DEFAULT '{}',             -- 多渠道绑定(Slack/Teams/WhatsApp等)
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### 审计日志表 (audit_logs)
```sql
CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    operator_id     UUID NOT NULL,                   -- 操作人
    action          VARCHAR(50) NOT NULL,            -- 操作类型
    resource_type   VARCHAR(50) NOT NULL,            -- 资源类型
    resource_id     VARCHAR(100),                    -- 资源ID
    detail          JSONB,                           -- 操作详情
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
-- 按月分区
```

---

## 6. OpenClaw 资产复用清单

### 6.1 直接复用（无需修改或仅需配置调整）

| 模块 | 路径 | 复用方式 |
|------|------|---------|
| WebSocket 网关服务器 | `src/gateway/server.impl.ts` | 直接复用，作为实时通信基座 |
| RPC 协议框架 | `src/gateway/protocol/` | 直接复用，扩展医疗业务 RPC 方法 |
| 消息路由引擎 | `src/routing/` | 直接复用，适配医疗消息分发规则 |
| AI Agent 运行时 | `src/agents/pi-embedded-runner/` | 直接复用，加载医疗领域 Agent |
| 工具调用框架 | `src/agents/pi-tools.ts` | 直接复用，注册医疗工具 |
| 技能系统框架 | `skills/` (框架部分) | 复用加载机制，替换具体技能 |
| 插件加载器 | `src/plugins/loader.ts` | 直接复用，加载医疗插件 |
| 插件注册表 | `src/plugins/registry.ts` | 直接复用 |
| 插件运行时 | `src/plugins/runtime.ts` | 直接复用 |
| 定时任务引擎 | `src/cron/` | 直接复用，排班/随访/提醒任务 |
| 媒体处理 | `src/media/` | 直接复用，处理医疗影像缩略图等 |
| 浏览器自动化 | `src/browser/` | 复用，用于保险平台对接 |
| 配置管理框架 | `src/config/` | 复用框架，更新 Schema |
| CLI 框架 | `src/cli/` | 复用，新增医疗管理命令 |
| OpenTelemetry | `extensions/opentelemetry/` | 直接复用，系统监控 |
| Docker 部署 | `docker-compose.yml` | 复用框架，增加 PG/Redis 服务 |
| Web UI 框架 | `ui/` (Lit + Vite) | 复用构建体系，重写组件 |

### 6.2 需要适配改造的模块

| 模块 | 路径 | 改造内容 |
|------|------|---------|
| 会话管理 | `src/sessions/` | 增加医疗会话类型（诊疗、会诊、护理） |
| 认证体系 | `src/gateway/` 认证部分 | 从 Token 扩展为 JWT + RBAC |
| 频道注册表 | `src/channels/registry.ts` | 新增医疗渠道元数据 |
| 配置 Schema | `src/config/schema.ts` | 更新为医院配置项 |
| 向量检索 | `src/memory/` | 适配医疗知识库索引 |

### 6.3 渠道策略（面向国际市场）

**核心策略：全面复用 OpenClaw 现有 15+ 渠道**，仅需适配医疗业务消息格式。

#### 直接复用的渠道

| 渠道 | 路径 | 医疗用途 | 优先级 |
|------|------|---------|--------|
| WhatsApp | `src/channels/whatsapp/` | 患者端主要沟通渠道（全球覆盖率最高） | P0 |
| Telegram | `src/channels/telegram/` | 患者通知、报告推送、预约确认 | P0 |
| Web | `src/channels/web/` | 患者门户 & 医生工作站入口 | P0 |
| Slack | `extensions/slack/` | 院内团队协作、值班通知、会诊协调 | P0 |
| Discord | `extensions/discord/` | 医疗团队协作、科室频道 | P1 |
| MS Teams | `extensions/teams/` | 大型医院机构协作平台 | P1 |
| Signal | `src/channels/signal/` | 高隐私场景（心理健康、HIV 等） | P1 |
| iMessage | `src/channels/imessage/` | Apple 生态用户触达 | P2 |
| Google Chat | `src/channels/google-chat/` | Google Workspace 医院 | P2 |
| Matrix | `extensions/matrix/` | 自托管隐私优先的机构 | P2 |
| Mattermost | `extensions/mattermost/` | 自托管院内协作 | P2 |
| Line | `extensions/line/` | 日本/东南亚市场 | P2 |
| IRC | `src/channels/irc/` | 技术运维团队 | P3 |

#### 需新增的渠道

| 渠道 | 优先级 | 说明 |
|------|--------|------|
| SMS 网关 (Twilio/Vonage) | P0 | 预约提醒、检验结果、紧急通知（无需安装 App） |
| Email (SMTP/SendGrid) | P1 | 报告发送、账单通知、随访沟通 |
| 医疗 Web 门户 | P0 | 复用现有 Web 渠道，改造为患者自助服务门户 |

---

## 7. 需新建的医疗业务模块

所有医疗业务模块以 OpenClaw 插件形式开发，放置于 `extensions/` 目录下：

```
extensions/
├── patient-management/     # 患者管理 [M01]
├── outpatient/            # 门诊管理 [M02]
├── inpatient/             # 住院管理 [M03]
├── emr/                   # 电子病历 [M04]
├── order-system/          # 医嘱系统 [M05]
├── pharmacy/              # 药房管理 [M06]
├── laboratory/            # 检验管理 [M07]
├── examination/           # 检查管理 [M08]
├── finance/               # 财务结算 [M09]
├── scheduling/            # 排班管理 [M10]
├── channel-sms/           # SMS 网关 (Twilio/Vonage)
├── channel-email/         # Email 通知渠道 (SendGrid/SMTP)
├── medical-knowledge/     # 医疗知识库（AI技能）
├── insurance-connector/   # 保险接口（多国适配器）
└── his-auth/              # RBAC 权限系统
```

> **注意：** WhatsApp、Telegram、Slack、Discord、Teams、Signal 等渠道直接复用 OpenClaw 现有实现，无需新建。

每个模块遵循统一的插件结构：

```typescript
// extensions/outpatient/index.ts 示例
import { definePlugin } from '@clawhospital/plugin-sdk';

export default definePlugin({
  id: 'clawhospital-outpatient',
  name: '门诊管理',
  version: '1.0.0',

  // 注册 RPC 方法
  rpcMethods: {
    'outpatient.register': handleRegistration,
    'outpatient.triage': handleTriage,
    'outpatient.queue.next': handleCallNext,
  },

  // 注册 AI 工具
  tools: [
    appointmentTool,
    triageSuggestionTool,
  ],

  // 注册定时任务
  crons: [
    { pattern: '0 7 * * *', handler: sendDailyAppointmentReminders },
  ],

  // 注册事件钩子
  hooks: {
    'order.created': onOrderCreated,
    'visit.completed': onVisitCompleted,
  },
});
```

---

## 8. 需改造/删除的模块

### 8.1 需要移除的模块

> **渠道保留策略：** 面向国际市场，OpenClaw 现有 15+ 渠道全部保留，作为 ClawHospital 的多渠道触达基础设施。

| 模块 | 路径 | 原因 |
|------|------|------|
| Spotify 技能 | `skills/spotify-player/` | 非医疗场景 |
| Apple Notes 技能 | `skills/apple-notes/` | 非医疗场景 |
| Bear Notes 技能 | `skills/bear-notes/` | 非医疗场景 |
| Obsidian 技能 | `skills/obsidian/` | 非医疗场景 |
| Trello 技能 | `skills/trello/` | 非医疗场景（可选保留用于任务管理） |
| GifGrep 技能 | `skills/gifgrep/` | 非医疗场景 |
| 其他娱乐/效率技能 | `skills/` 中非医疗相关 | 替换为医疗专用技能 |
| Lobster 任务处理 | `extensions/lobster/` | 非医疗场景 |

### 8.2 需要重构的模块

| 模块 | 改造内容 |
|------|---------|
| `package.json` | 更新项目名、依赖项 |
| `src/config/schema.ts` | 医院配置 Schema（科室、病区、系统参数） |
| `src/gateway/server-methods.ts` | 新增医疗业务 RPC 方法路由 |
| `ui/` | 医生/护士/管理员三套工作站 UI |
| `docs/` | 全部重写为 ClawHospital 文档 |
| `README.md` | 项目说明更新 |
| `apps/android/` | 改造为移动查房/护理 App |
| `apps/ios/` | 改造为 iOS 版移动查房/患者 App |
| `apps/macos/` | 改造为桌面端医生工作站快捷入口 |

---

## 9. 安全与合规

### 9.1 数据安全

| 要求 | 实施方案 |
|------|---------|
| 患者隐私保护 | 姓名、身份证、手机号等 PII 字段 AES-256 加密存储 |
| 传输加密 | 全链路 TLS 1.3，WebSocket wss:// |
| 访问控制 | RBAC + 数据权限（只看本科室患者） |
| 操作审计 | 全操作审计日志，不可篡改 |
| 数据备份 | PostgreSQL 流复制 + 定时全量备份 |
| 脱敏展示 | 非授权角色仅可见脱敏后数据 |

### 9.2 合规要求（国际标准）

| 标准 | 说明 | 适用地区 |
|------|------|---------|
| HIPAA | 医疗信息隐私与安全保护 | 美国 |
| GDPR | 通用数据保护条例，患者数据处理合规 | 欧盟/欧洲经济区 |
| HL7 FHIR R4 | 医疗数据交换标准接口（核心集成标准） | 全球 |
| ICD-10 / ICD-11 | 国际疾病分类编码标准 | 全球 |
| SNOMED CT | 临床术语标准化 | 全球 |
| CPT / HCPCS | 医疗操作与服务编码 | 美国 |
| DICOM | 医学影像通信标准（PACS 集成） | 全球 |
| SOC 2 Type II | 服务组织安全控制审计 | 全球（SaaS 部署时） |
| PIPEDA | 个人信息保护与电子文件法 | 加拿大 |
| LGPD | 通用数据保护法 | 巴西 |

### 9.3 AI 安全

| 风险 | 应对措施 |
|------|---------|
| AI 诊断误导 | 所有 AI 建议标注"仅供参考"，不替代医生决策 |
| 提示注入 | 复用 OpenClaw 提示注入防护，增加医疗上下文过滤 |
| 数据泄露 | AI 模型调用脱敏后的数据，不传送真实 PII |
| 模型幻觉 | 基于知识库 RAG 检索，减少开放式生成 |

---

## 10. 开发阶段与里程碑

### Phase 1 — 基础架构改造（第 1-4 周）

**目标：** 完成技术基座改造，跑通核心链路

| 任务 | 详情 | 工时估算 |
|------|------|---------|
| 项目骨架改造 | 包名重命名、目录结构调整、移除无关模块 | 3天 |
| 数据库层 | PostgreSQL 接入、ORM 集成（Drizzle ORM）、核心表建表 | 5天 |
| 权限体系 | JWT 认证 + RBAC 中间件 + 用户/角色/权限表 | 5天 |
| 配置改造 | 医院配置 Schema、基础数据初始化脚本 | 3天 |
| 审计日志 | 操作审计中间件、日志表 | 2天 |
| Docker 环境 | docker-compose 增加 PG + Redis + MinIO | 2天 |

**里程碑交付物：** 可启动的 ClawHospital 骨架，含认证、权限、数据库

---

### Phase 2 — 核心业务模块（第 5-12 周）

**目标：** 完成门诊/住院核心业务闭环

| 任务 | 详情 | 工时估算 |
|------|------|---------|
| 患者管理 [M01] | 建档、MPI、就诊卡 | 5天 |
| 基础数据 [S02] | ICD-10、药品字典、项目目录导入 | 5天 |
| 门诊管理 [M02] | 挂号、分诊、门诊医生站 | 10天 |
| 医嘱系统 [M05] | 药品/检验/检查医嘱开立与审核 | 8天 |
| 电子病历 [M04] | 模板引擎、病历编辑器、签名 | 10天 |
| 药房管理 [M06] | 发药、库存、效期 | 7天 |
| 检验管理 [M07] | 标本流转、结果录入、报告 | 5天 |
| 排班管理 [M10] | 排班、号源 | 5天 |
| 医生工作站 UI | Lit 组件开发，门诊/住院工作站 | 10天 |

**里程碑交付物：** 门诊全流程可用（预约→挂号→就诊→开医嘱→发药→收费）

---

### Phase 3 — AI 智能模块（第 13-18 周）

**目标：** 接入 AI 能力，体现差异化

| 任务 | 详情 | 工时估算 |
|------|------|---------|
| 医疗知识库 | 药品知识、临床指南导入、向量化索引 | 7天 |
| 预问诊 Agent [A01] | 多渠道对话式问诊、报告生成 | 7天 |
| 辅助诊断 Agent [A02] | 鉴别诊断提示、ICD-10 推荐 | 7天 |
| 用药审核 Agent [A03] | 相互作用、剂量、过敏检测 | 5天 |
| 病历质控 Agent [A04] | 自动质控评分 | 5天 |
| 患者服务 Agent [A05] | 智能预约、报告推送、随访 | 7天 |

**里程碑交付物：** AI 辅助诊疗全链路可用

---

### Phase 4 — 多渠道医疗适配（第 19-22 周）

**目标：** 将现有 OpenClaw 渠道适配为医疗场景，新增 SMS/Email 渠道

| 任务 | 详情 | 工时估算 |
|------|------|---------|
| 渠道医疗适配层 | 为 WhatsApp/Telegram/Slack 等现有渠道封装医疗消息模板（预约确认、检验结果、急危值通知等标准化格式） | 5天 |
| SMS 网关插件 | 基于 Twilio/Vonage API 新建 SMS 渠道插件，预约/结果/费用通知 | 5天 |
| Email 通知插件 | 基于 SendGrid/SMTP 新建 Email 渠道插件，报告发送/账单通知 | 3天 |
| Web 患者门户 | 复用 Web 渠道改造为患者自助服务门户（预约、报告查询、费用查询） | 7天 |
| 移动端 App 改造 | iOS + Android 改造为移动查房/护理/患者 App | 10天 |

**里程碑交付物：** 15+ 渠道医疗适配完成，SMS/Email 新渠道可用，多端患者触达全面可用

---

### Phase 5 — 住院与高级功能（第 23-28 周）

**目标：** 完善住院流程、财务结算、对接外部系统

| 任务 | 详情 | 工时估算 |
|------|------|---------|
| 住院管理 [M03] | 入院、床位、转科、出院 | 10天 |
| 护理工作站 | 医嘱执行、体征、护理记录 | 8天 |
| 财务结算 [M09] | 收费、结算、报表 | 10天 |
| 保险接口 | 国际医疗保险/Medicare/Medicaid/NHS 适配器对接 | 10天 |
| 检查管理 [M08] | PACS/RIS 对接 | 5天 |

**里程碑交付物：** 住院全流程 + 财务结算 + 保险对接

---

### Phase 6 — 测试、优化与上线（第 29-32 周）

| 任务 | 详情 | 工时估算 |
|------|------|---------|
| 集成测试 | 全流程端到端测试 | 5天 |
| 性能优化 | 数据库索引、缓存策略、并发压测 | 5天 |
| 安全审计 | 渗透测试、代码审计 | 5天 |
| 文档完善 | 用户手册、运维手册、API 文档 | 5天 |
| 试运行 | 模拟环境试运行、问题修复 | 5天 |

**里程碑交付物：** 生产就绪版本

---

## 11. 技术栈总结

| 层面 | 技术 | 来源 |
|------|------|------|
| 运行时 | Node.js ≥ 22 | 复用 |
| 语言 | TypeScript (ESM) | 复用 |
| 包管理 | pnpm 10 | 复用 |
| 后端框架 | Express 5 | 复用 |
| 实时通信 | WebSocket (Gateway) | 复用 |
| AI 引擎 | Pi Agent Core | 复用 |
| 前端框架 | Lit + Vite | 复用 |
| ORM | Drizzle ORM | **新增** |
| 主数据库 | PostgreSQL 16 | **新增** |
| 缓存 | Redis 7 | **新增** |
| 文件存储 | MinIO / AWS S3 | **新增** |
| 向量检索 | SQLite-Vec | 复用 |
| 任务调度 | Croner | 复用 |
| 监控 | OpenTelemetry | 复用 |
| 认证 | JWT + bcrypt | **新增** |
| 校验 | Zod | 复用 |
| 测试 | Vitest | 复用 |
| 容器化 | Docker + Compose | 复用 |
| CI/CD | GitHub Actions | 复用 |

---

## 12. 风险与应对

| 风险 | 等级 | 应对措施 |
|------|------|---------|
| OpenClaw 上游更新导致冲突 | 中 | Fork 后独立维护，定期 cherry-pick 框架层更新 |
| 医疗业务复杂度超预期 | 高 | 分阶段交付，优先保证门诊流程最小可用 |
| AI 模型合规性 | 中 | AI 建议仅作辅助，人工确认后生效；敏感数据脱敏后送模型 |
| PostgreSQL 迁移工作量 | 低 | 使用 Drizzle ORM 抽象层，降低数据库耦合 |
| 渠道 API 变动（WhatsApp/Telegram 等） | 中 | 复用 OpenClaw 已有渠道维护，上游更新时同步 |
| 各国保险接口差异 | 高 | 保险连接器设计为可插拔适配器模式，按国家/地区分别实现 |
| 多语言/本地化 | 中 | 系统 UI 与消息模板支持 i18n，优先英语，渐进增加语言 |
| HIPAA/GDPR 合规成本 | 高 | 提前引入合规框架，数据加密/审计/同意管理从第一阶段内置 |
| 性能瓶颈（并发门诊高峰） | 中 | Redis 缓存 + 数据库连接池 + 读写分离 |

---

## 13. 附录：目录结构规划

```
clawhospital/
├── src/                           # 核心源码（复用 OpenClaw 框架层）
│   ├── gateway/                   # WebSocket 网关 [复用]
│   ├── agents/                    # AI Agent 运行时 [复用+增强]
│   │   ├── pi-embedded-runner/    # Agent 执行引擎 [复用]
│   │   ├── medical-agents/        # 医疗 Agent 定义 [新增]
│   │   │   ├── pre-consultation.ts
│   │   │   ├── diagnosis-assist.ts
│   │   │   ├── medication-review.ts
│   │   │   ├── emr-quality.ts
│   │   │   └── patient-service.ts
│   │   └── medical-tools.ts       # 医疗工具注册 [新增]
│   ├── channels/                  # 渠道实现 [全部复用]
│   │   ├── telegram/              # Telegram [复用]
│   │   ├── whatsapp/              # WhatsApp [复用]
│   │   ├── discord/               # Discord [复用]
│   │   ├── signal/                # Signal [复用]
│   │   ├── imessage/              # iMessage [复用]
│   │   ├── web/                   # Web 门户 [复用+改造为患者门户]
│   │   └── registry.ts            # 渠道注册 [改造]
│   ├── config/                    # 配置管理 [复用+改造]
│   ├── plugins/                   # 插件系统 [复用]
│   ├── routing/                   # 消息路由 [复用]
│   ├── sessions/                  # 会话管理 [改造]
│   ├── cron/                      # 定时任务 [复用]
│   ├── media/                     # 媒体处理 [复用]
│   ├── memory/                    # 向量检索 [复用]
│   ├── browser/                   # 浏览器自动化 [复用]
│   ├── cli/                       # CLI 工具 [改造]
│   ├── db/                        # 数据库层 [新增]
│   │   ├── connection.ts          # PG 连接池
│   │   ├── schema/                # Drizzle Schema
│   │   │   ├── patients.ts
│   │   │   ├── visits.ts
│   │   │   ├── orders.ts
│   │   │   ├── emr.ts
│   │   │   ├── pharmacy.ts
│   │   │   ├── laboratory.ts
│   │   │   ├── staff.ts
│   │   │   ├── auth.ts
│   │   │   └── audit.ts
│   │   └── migrations/            # 数据库迁移
│   ├── auth/                      # 认证授权 [新增]
│   │   ├── jwt.ts
│   │   ├── rbac.ts
│   │   └── middleware.ts
│   └── audit/                     # 审计日志 [新增]
│       └── logger.ts
│
├── extensions/                    # 业务插件（医疗模块）
│   ├── patient-management/        # [M01] 患者管理
│   ├── outpatient/               # [M02] 门诊管理
│   ├── inpatient/                # [M03] 住院管理
│   ├── emr/                      # [M04] 电子病历
│   ├── order-system/             # [M05] 医嘱系统
│   ├── pharmacy/                 # [M06] 药房管理
│   ├── laboratory/               # [M07] 检验管理
│   ├── examination/              # [M08] 检查管理
│   ├── finance/                  # [M09] 财务结算
│   ├── scheduling/               # [M10] 排班管理
│   ├── channel-sms/              # SMS 渠道 (Twilio/Vonage) [新增]
│   ├── channel-email/            # Email 渠道 (SendGrid/SMTP) [新增]
│   ├── slack/                    # Slack [复用]
│   ├── teams/                    # MS Teams [复用]
│   ├── matrix/                   # Matrix [复用]
│   ├── medical-knowledge/        # 医疗知识库
│   ├── insurance-connector/      # 保险接口（多国适配器）
│   ├── his-auth/                 # 权限管理
│   └── opentelemetry/            # 监控 [复用]
│
├── ui/                            # Web UI（三套工作站）
│   ├── src/
│   │   ├── doctor-station/        # 医生工作站
│   │   ├── nurse-station/         # 护理工作站
│   │   ├── admin-console/         # 管理控制台
│   │   ├── patient-portal/        # 患者门户
│   │   ├── pharmacy-station/      # 药房工作站
│   │   └── shared/                # 共享组件
│   └── vite.config.ts
│
├── apps/
│   ├── android/                   # Android 移动查房/护理 App [改造]
│   ├── ios/                       # iOS 移动查房/患者 App [改造]
│   └── macos/                     # macOS 桌面快捷入口 [改造]
│
├── seeds/                         # 基础数据种子
│   ├── icd10.json                 # ICD-10 编码库
│   ├── drugs.json                 # 药品字典
│   ├── lab-items.json             # 检验项目
│   └── charge-items.json          # 收费项目
│
├── docs/                          # 项目文档
│   ├── architecture.md            # 架构设计
│   ├── api-reference/             # API 文档
│   ├── deployment.md              # 部署指南
│   └── user-guide/                # 用户手册
│
├── test/                          # 测试
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docker-compose.yml             # 容器编排
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── CLAWHOSPITAL_DEVELOPMENT_PLAN.md  # 本文档
```

---

## 总结

ClawHospital 的核心改造策略是 **"框架复用、业务新建、渠道替换、AI 增强"**：

1. **复用 OpenClaw 约 70% 的框架代码**（网关、Agent 引擎、插件系统、工具链、定时任务、媒体处理、**全部 15+ 消息渠道**）
2. **全新开发 10 个医疗业务插件 + 5 个 AI Agent**
3. **渠道全面复用**，保留 WhatsApp/Telegram/Slack/Discord/Signal 等全部现有渠道，新增 SMS 网关 + Email 通知
4. **升级数据层**，从 SQLite/JSON 升级为 PostgreSQL + Redis
5. **强化安全与合规**，增加 RBAC、审计日志、数据加密，遵循 HIPAA/GDPR 国际标准

预计总开发周期 **32 周**（8 个月），分 6 个阶段递进交付。
