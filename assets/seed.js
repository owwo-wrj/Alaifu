/* ============================================================
   阿莱夫日报系统 · 种子数据（真实组织与项目口径）
   项目：MetaHuman 虚拟人项目 ｜ 客户：Kelvin 老师
   数据周：2026.09.28–09.30（前一周期）、2026.10.05–10.09（本周期）
   ============================================================ */
window.SEED = (function () {

  /* ---------------- 人员 ----------------
     角色（role）决定权限级别，类型（type）决定是否算「我们的人」：
       admin / boss / pm / tal → 管理角色（admin 为首个注册者；boss / pm 不填日报）
       member / art / intern   → 内部成员（填日报、进催办与提交率分母）
     v1.22a：客户侧参与人（Kelvin / 坤 / Tim）整体删除 —— 系统只对内，对外材料走白名单字段。
     应提交日报的人 = internal && submitDaily && active → 见 Store.submitters()
     phone 只在登录页用（手机验证码登录）：原型里是**演示号码**，真实环境由 HR 系统下发。 */
  const people = [
    // 内部成员 · 场景生成组（填日报、进催办与提交率分母）
    { id:'chang',   name:'常吉祥', en:'', type:'internal', role:'member', group:'gen', phone:'13800000011', title:'场景生成组 · Codex / AI 场景生成', mainPipe:'scene', unitPrice:240, active:true },
    { id:'li',      name:'李宇尧', en:'', type:'internal', role:'member', group:'gen', phone:'13800000012', title:'场景生成组 · API + Harness 管线', mainPipe:'scene',   unitPrice:260, active:true },
    { id:'sun',     name:'孙世甲', en:'', type:'internal', role:'member', group:'gen', phone:'13800000013', title:'场景生成组 · 渲染链路与 QC',      mainPipe:'render',unitPrice:220, active:true },

    // 内部成员 · 3DGS 组
    { id:'wang',    name:'王弋',   en:'', type:'internal', role:'member', group:'d3', phone:'13800000021', title:'3DGS 组 · 采集与重建',           mainPipe:'3dgs',  unitPrice:220, active:true },
    { id:'luo',     name:'罗思远', en:'', type:'internal', role:'member', group:'d3', phone:'13800000022', title:'3DGS 组 · 采集 / 渲染农场',       mainPipe:'3dgs',  unitPrice:200, active:true },
    { id:'liuming', name:'刘一鸣', en:'', type:'internal', role:'member', group:'d3', phone:'13800000023', title:'3DGS 组 · 渲染批次与资产采购（接手宏枢）', mainPipe:'asset', unitPrice:220, active:true },
    { id:'anya',    name:'安雅萱', en:'', type:'internal', role:'intern', group:'d3', phone:'13800000024', title:'3DGS 组 · 实习生，样本整理与标注', mainPipe:'other', unitPrice:0, active:true },

    // 内部成员 · 不单独提交日报（采购条线由刘一鸣在自己的日报里代表提交，两人看作一条线）
    { id:'hongshu', name:'宏枢',   en:'', type:'internal', role:'member', group:null, dailySubmit:false, phone:'13800000025',
      title:'场景资产采购 / 查重（日报由刘一鸣代表提交）', mainPipe:'asset', unitPrice:180, active:true },

    // 内部 · TA Leader（最高权限：与 TA / 美术 / 实习生同一套页面，同样交日报与每日任务，但可管理）
    { id:'ta',      name:'宋天意', en:'', type:'internal', role:'tal', group:null, phone:'13800000004', title:'TA Leader · 管理场景生成组与 3DGS 组', mainPipe:null, unitPrice:0, active:true },

    // 内部 · 管理角色（最高权限，不填日报）
    { id:'olivia',  name:'王润佳', en:'Olivia', type:'internal', role:'pm',   group:null, phone:'13800000003', title:'PM（Olivia）· 流程主持 / 每日催办', mainPipe:null, unitPrice:0, active:true },
    { id:'candice', name:'Candice', en:'', type:'internal', role:'boss', group:null, phone:'13800000001', title:'老板', mainPipe:null, unitPrice:0, active:true },
    { id:'liudi',   name:'柳迪',   en:'', type:'internal', role:'boss', group:null, phone:'13800000002', title:'老板', mainPipe:null, unitPrice:0, active:true },

    // v1.22a：客户侧参与人（Kelvin / 坤 / Tim）不再预置 —— 系统只对内，他们没有账号
  ];

  /* ---------------- 两个组（日报按组交，周会材料按组收） ---------------- */
  const groups = [
    { id:'gen', name:'场景生成组', lead:'ta', members:['chang','li','sun'],
      note:'周会材料按组交给 PM，截止周一 17:00' },
    { id:'d3',  name:'3DGS 组',   lead:'ta', members:['wang','luo','liuming','anya'],
      note:'宏枢老师不单独交日报，由刘一鸣代表（两人可看作一条线）' }
  ];

  /* ---------------- 角色定义（权限的唯一来源） ----------------
     level: 3 = 最高权限（管理角色）/ 2 = 内部成员 / 1 = 客户侧（无账号）
     submitDaily 只是角色默认值；个人可用 dailySubmit:false 覆盖（如宏枢老师） */
  /* caps = 「这类身份能做什么」的唯一来源（v1.17 起）。
     每一项都能在「设置 → 角色与权限」里按角色勾选，页面只问 Store.can(...)，不写死角色名。
     ⚠️ 原型阶段按用户要求：**所有内部身份一律可编辑**（含 TA / 美术 / 实习生），
     所以 member / art / intern 的 caps 也是全开。
     `admin` 只决定「是否算最高权限」（可进未交名单页与催办）；
     **是否交日报由 `submitDaily` 单独决定** —— 所以 TA Leader 可以既是最高权限、又照常填报；
     老板 / PM 则 admin=true 但 submitDaily=false。
     真实部署把某一项改成 false 即可收回该能力，页面无需改代码。 */
  const FULL_CAPS = { remind:true, config:true, person:true, role:true, enums:true,
                      clientData:true, editOthers:true, kbManage:true, finance:true };
  const NO_CAPS   = { remind:false, config:false, person:false, role:false, enums:false,
                      clientData:false, editOthers:false, kbManage:false, finance:false };
  const cap = o => Object.assign({}, o);

  const roles = [
    /* v1.22 账号机制：系统不预置管理员账号 —— **第一个注册的账号自动成为「管理员」**，
       之后的注册进入「待分配」，由管理员在「管理 → 人员」里派角色；
       页面可见范围由角色决定（预置演示人物保留，等正式设计定稿后再切空系统）。 */
    { id:'admin',  name:'管理员',    level:3, admin:true,  submitDaily:false, taskSubmit:false, taskManage:true, caps:cap(FULL_CAPS),
      news:{ post:true, announce:true, pin:true, review:true,
             cats:['公告','新闻','活动','分享','学习'] },
      scopes:['第一个注册的账号自动获得','全部页面与全部管理能力','人员增删改与角色分配（含「待分配」成员）',
              '口径配置 · 成员与管线 · 客户侧数据代录 · 催办','发布公告 / 置顶 / 审核内容'] },
    { id:'pending', name:'待分配',   level:1, admin:false, submitDaily:false, taskSubmit:false, taskManage:false, caps:cap(NO_CAPS),
      news:false,
      scopes:['注册后的默认状态','仅可见工作台 · 等待管理员分配角色','分配角色后按新角色展开页面'] },
    { id:'boss',   name:'老板',      level:3, admin:true,  submitDaily:false, taskSubmit:false, taskManage:true, caps:cap(FULL_CAPS),
      news:{ post:true, announce:true, pin:true, review:true,
             cats:['公告','新闻','活动','分享','学习'] },
      scopes:['全部页面','口径配置','成员与管线','客户侧数据代录','催办','知识库空间管理','重置演示数据',
              '发布公告 / 置顶 / 审核内容','每日任务与提交统计（全部）','看板可见性配置','提交后放开修改'] },
    { id:'pm',     name:'PM',        level:3, admin:true,  submitDaily:false, taskSubmit:false, taskManage:true, caps:cap(FULL_CAPS),
      news:{ post:true, announce:true, pin:true, review:true,
             cats:['公告','新闻','活动','分享','学习'] },
      scopes:['全部页面','口径配置','成员与管线','客户侧数据代录','催办','周报与本周工作计划汇总','知识库空间管理','重置演示数据',
              '发布公告 / 置顶 / 审核内容','每日任务与提交统计（全部）','看板可见性配置','提交后放开修改'] },
    // v1.17：TA Leader 与 TA / 美术 / 实习生 **看到同一套页面、同样要交日报与每日任务**，
    // 差别只在权限更高（可管理）。页面不再按身份隐藏，收不放由「角色与权限」矩阵决定。
    { id:'tal',    name:'TA Leader', level:3, admin:true,  submitDaily:true,  taskSubmit:true,  taskManage:true, caps:cap(FULL_CAPS),
      news:{ post:true, announce:true, pin:true, review:true,
             cats:['公告','新闻','活动','分享','学习'] },
      scopes:['与 TA / 美术 / 实习生同一套页面','日报与周报填报（本人）','每日任务填报（本人）',
              '口径配置','成员与管线','客户侧数据代录','催办','管理场景生成组与 3DGS 组','知识库空间管理','重置演示数据',
              '发布公告 / 置顶 / 审核内容','每日任务与提交统计（全部）','看板可见性配置','提交后放开修改'] },
    // TA 与美术是**两个独立角色**（v1.17）：默认能力一致，可按需分别勾选权限位
    { id:'member', name:'TA',        level:2, admin:false, submitDaily:true,  taskSubmit:true,  taskManage:false, caps:cap(FULL_CAPS),
      news:{ post:true, announce:false, pin:false, review:false,
             cats:['新闻','活动','分享','学习'] },
      scopes:['日报与周报填报（本人）','每日任务填报（本人）','我的日报','日报看板','知识库读写','产能 / 成本与支出（只读）',
              '发布新闻 / 活动 / 分享 / 学习'] },
    { id:'art',    name:'美术',      level:2, admin:false, submitDaily:true,  taskSubmit:true,  taskManage:false, caps:cap(FULL_CAPS),
      news:{ post:true, announce:false, pin:false, review:false,
             cats:['新闻','活动','分享','学习'] },
      scopes:['日报与周报填报（本人）','每日任务填报（本人）','我的日报','日报看板','知识库读写','产能 / 成本与支出（只读）',
              '发布新闻 / 活动 / 分享 / 学习'] },
    { id:'intern', name:'实习生',    level:2, admin:false, submitDaily:true,  taskSubmit:true,  taskManage:false, caps:cap(FULL_CAPS),
      news:{ post:true, announce:false, pin:false, review:false, intern:true,
             cats:['活动','分享','学习'] },
      scopes:['日报与周报填报（本人）','每日任务填报（本人）','我的日报','日报看板','知识库读写',
              '发布学习笔记 / 任务进展 / 问题求助（内容恒定带「实习生」标识）'] }
    /* v1.22a：「客户侧参与人」角色整体删除 —— 本系统只对内，Kelvin / 坤 / Tim 没有账号、
       不再作为角色或人员出现在系统里；对外材料仍走白名单字段（口径不受影响）。 */
  ];

  /* ---------------- 催办话术模板（v1.17，可编辑） ----------------
     公司没有企业微信、也不接第三方消息平台 —— 系统**不代发**，只生成一段可直接粘贴的话。
     话术本身可改：设置 → 看板与提醒 → 催办话术模板（增删改 + 调序），
     占位符在生成时替换：{name} 被催人 · {date} 日期 · {deadline} 截止时点 · {count} 人数。 */
  const remindTemplates = [
    { id:'tpl-first', name:'首次提醒（截止前）', when:'截止前 2 小时，如 20:00', kind:'daily',
      text:'@{name} 今天的日报还没提交，截止 {deadline}（{date}），方便先写一版？谢谢～' },
    { id:'tpl-second', name:'二次提醒（临近截止）', when:'截止前 30 分钟，如 21:30', kind:'daily',
      text:'@{name} 提醒一下，{date} 的日报 {deadline} 就截止了，还差你一份，麻烦了' },
    { id:'tpl-late', name:'逾期催办（次日）', when:'截止时间之后', kind:'daily',
      text:'@{name} {date} 的日报已逾期，麻烦补一下（逾期计入提交率，不计准时率）' },
    { id:'tpl-task', name:'每日任务催交', when:'10:45 截止前后', kind:'task',
      text:'@{name} 今天（{date}）的每日任务还没交，10:45 截止，麻烦点一下' }
  ];

  /* ---------------- 管线（产能字段定义来源） ---------------- */
  /* v1.15：六条管线 —— 场景生成（原 API / Codex 合并）· 3DGS · 拍摄 · 渲染 · 资产采购 · 其他 */
  const pipelines = [
    {
      id:'scene', name:'场景生成', short:'场景生成',
      metrics:[
        { key:'attempted', label:'尝试场景数', unit:'个', type:'int' },
        { key:'generated', label:'生成场景数', unit:'个', type:'int' },
        { key:'avgMin',    label:'单场景耗时', unit:'分钟', type:'num' },
        { key:'costUsd',   label:'单场景成本', unit:'USD', type:'num' }
      ]
    },
    {
      id:'3dgs', name:'3DGS', short:'3DGS',
      metrics:[
        { key:'collected',  label:'采集场景数', unit:'个', type:'int' },
        { key:'rebuilt',    label:'重建完成数', unit:'个', type:'int' },
        { key:'rebuiltFail',label:'重建失败数', unit:'个', type:'int' }
      ]
    },
    {
      id:'shoot', name:'拍摄', short:'拍摄',
      metrics:[
        { key:'shotScenes', label:'拍摄场景数', unit:'个', type:'int' },
        { key:'shotDays',   label:'拍摄天数', unit:'天', type:'int' }
      ]
    },
    {
      id:'render', name:'渲染', short:'渲染',
      metrics:[
        { key:'rendered',   label:'渲染完成数', unit:'个', type:'int' },
        { key:'renderFail', label:'渲染失败数', unit:'个', type:'int' },
        { key:'qcPass',     label:'QC 通过数', unit:'个', type:'int' }
      ]
    },
    {
      id:'asset', name:'资产采购', short:'资产采购',
      metrics:[
        { key:'purchased', label:'采购资产数', unit:'套', type:'int' },
        { key:'amountFen', label:'采购金额', unit:'元', type:'money' }
      ]
    },
    { id:'other', name:'其他', short:'其他', metrics:[] }
  ];

  /* ---------------- 下拉项枚举（v1.16：最高权限可在「设置 → 下拉项」里编辑） ---------------- */
  /* 优先级：任务行与看板的「高 / 中 / 低」，可增删改 */
  const priorities = [
    { id:'high', t:'高', c:'danger' },
    { id:'mid',  t:'中', c:'warn' },
    { id:'low',  t:'低', c:'' }
  ];
  /* 内容流分类：工作台「内容流」发布时可选 */
  const newsCats = ['公告', '新闻', '活动', '分享', '学习'];

  /* ---------------- 项目 ---------------- */
  const projects = [
    { id:'metahuman', name:'MetaHuman 虚拟人项目', client:'Kelvin 老师', status:'进行中',
      start:'2026-06-01', end:null }
  ];

  /* ---------------- 配置（全局口径） ---------------- */
  const config = {
    reportTime:'18:30',        // 约定汇报时点：每天 18:30 汇报「当日任务 + 明日工作计划」
    deadline:'22:00',          // 提交截止（唯一分界）；到点仍未交 → 进入催办
    remind1:'18:30',           // 首次提醒 = 约定汇报时点
    remind2:'21:30',           // 二次提醒（截止前 30 分钟）
    weeklyDueDay:1,            // 周报：每周一
    weeklyDue:'17:00',         // 周报截止：周一 17:00 前交「上周任务结果 + 下周任务目标」
    effectiveSceneRule:'pending', // 有效场景口径：pending / collected / generated
    workdayMode:'workdays',    // workdays | everyday（OP-17 待确认）
    clientVisible:['项目进展','卡点 / 风险','成果链接','产能数字','任务分工'],
    internalBlocked:['人力成本','内部成本单价','采购金额'],
    publicViewPublished:false, // 对外视图本期未发布（且客户侧无账号）
    /* ---- 内容流开关（FR-37 · 工作台信息流）---- */
    internNews:false,          // 实习生能不能发「新闻」类：默认否（学习 / 分享 / 活动 已开放）
    internReview:false,        // 实习生内容是否需审核后展示：默认否（7 人团队，信任成本低于审核成本）

    /* ---- 每日任务（FR-38）---- */
    taskDeadline:'10:45',      // 每日任务提交截止（唯一分界）
    taskRemind:['10:15','10:35'], // 截止前两次站内提醒
    taskSkipWeekend:true,      // 周末跳过（无需提交）
    taskSkipHoliday:true,      // 节假日跳过（复用 calendar.holidays）
    taskTz:'Asia/Shanghai',    // 时区：统一按公司所在时区
    taskEditPolicy:'reopen',   // 提交后不可改 | 管理员一键放开（不做完整审批流）
    taskVisibility:'all',      // 看板可见性：all 全员 | group 仅本组 | self 仅自己
    taskOtRequired:false,      // 「预计加班时长」是否必填（默认选填）
    /* ---- 提醒推送开关（管理员可改，默认只走站内）---- */
    notify:{ email:false, wecom:false, feishu:false }
  };

  /* ---------------- 工作日历 ---------------- */
  const calendar = {
    workdays:[1,2,3,4,5],                      // 周一至周五
    holidays:['2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07'],
    // 说明：国庆假期按 10.01–10.07 记录；本演示周 10.05–10.09 视为项目赶工正常出勤
    extraWorkdays:['2026-10-05','2026-10-06','2026-10-07'],
    note:'国庆假期按 10.01–10.07 录入，其中 10.05–10.07 因项目赶工记为调休出勤'
  };

  /* ---------------- 客户侧数据（PM 代录，FR-28） ---------------- */
  const clientData = [
    { id:'cd1', date:'2026-10-08', source:'坤（客户侧）', by:'olivia', usable:608, planned:24, confirmed:21, acceptance:null, note:'可用性筛选结果回传' },
    { id:'cd2', date:'2026-10-09', source:'坤（客户侧）', by:'olivia', usable:618, planned:26, confirmed:23, acceptance:'R-33 批次通过', note:'含点位规划确认' }
  ];

  /* ---------------- 累计基线（上线起点，需与 PM 核对） ---------------- */
  const baseline = {
    collected:133,     // 采集场景累计
    rebuilt:63,        // 重建完成累计
    assetLedger:968,   // 资产台账累计
    generated:null,    // AI 生成累计 —— 未拍板，显示「待确认」
    rendered:null,
    note:'来源：10.06 周会与现有台账；「AI 生成累计」「渲染累计」尚无统一口径，标记待确认'
  };

  /* ============================================================
     日报数据
     ============================================================ */
  const reports = [];
  let rid = 1;
  const mk = (personId, date, at, entries, extra) => {
    reports.push(Object.assign({
      id:'r' + (rid++), personId:personId, date:date, projectId:'metahuman',
      status:'submitted', submittedAt:date + 'T' + at, entries:entries
    }, extra || {}));
  };
  /* 条目状态（v1.15 三选一，替代旧的 doing/done/blocked）：
       done 已完成 · undone 未完成（reason 必填）· overtime 需加班完成（otHours 选填）
     —— 不做进度百分比、不做「进行中」，当天必须收口。 */
  const ent = (o) => Object.assign({
    pipeline:'other', task:'', progress:'done', reason:'', otHours:null,
    links:[], note:'', metrics:{}
  }, o);

  /* ---- 2026-09-28 ~ 09-30（前一周期，用于按周回看） ---- */
  const P = { wang:'3dgs', luo:'3dgs', li:'scene', chang:'scene', hongshu:'asset', sun:'render',
              liuming:'render', anya:'other', ta:'other' };
  const prevText = {
    wang:'重建批次推进，完成 6–8 个场景并上传 S3',
    luo:'接收外包采集数据并完成校验，更新采集台账',
    li:'Harness 调度模块重构与稳定性修复，实测取数',
    chang:'Codex 提示词模板迭代与批量生成，整理失败样本',
    hongshu:'淘宝资产采购、查重与授权文件核对',
    sun:'渲染批次执行、参数预检与 QC 输出',
    liuming:'渲染批次预处理、显存参数调优与 QC 抽查',
    anya:'生成失败样本整理与分类标注',
    ta:'团队任务拆解、技术评审与跨链路口径对齐'
  };
  ['2026-09-28','2026-09-29','2026-09-30'].forEach((d, i) => {
    Object.keys(P).forEach((pid, j) => {
      if (pid === 'luo' && d === '2026-09-30') return; // 罗老师 09-30 漏交，用于历史提交率
      if (pid === 'hongshu') return;                   // 宏枢老师不交日报：采购条线并入刘一鸣（两人看作一条线）
      const entries = [
        ent({ pipeline:P[pid], task:prevText[pid] + '（' + ['第 1 次','第 2 次','第 3 次'][i] + '）', progress:'done' })
      ];
      if (pid === 'liuming') {
        entries.push(ent({ pipeline:'asset', task:prevText.hongshu + '（' + ['第 1 次','第 2 次','第 3 次'][i] + '）', progress:'done' }));
      }
      mk(pid, d, ['20:35','21:05','19:50'][j % 3], entries);
    });
  });

  /* ---- 2026-10-05（周一） ---- */
  mk('wang','2026-10-05','21:10',[
    ent({ pipeline:'3dgs', task:'重建农场批次 B-071~B-078（8 个场景），全部上传 S3；其中 B-072 纹理有空洞，已标记待重跑',
      progress:'done', metrics:{ rebuilt:8, rebuiltFail:1 },
      links:[{ url:'https://s3.internal/alef/rebuild/batch-B071-B078', label:'批次清单' }] })
  ]);
  mk('luo','2026-10-05','20:15',[
    ent({ pipeline:'3dgs', task:'接收外包采集数据 3 批共 42 个场景，校验通过 40 个（2 个重叠率不足已退回）',
      progress:'done', metrics:{ collected:42 } })
  ]);
  mk('li','2026-10-05','21:30',[
    ent({ pipeline:'scene', task:'Harness 批量调度模块重构，支持失败自动重试（最多 3 次）；实测 20 个场景',
      progress:'done', metrics:{ attempted:20, generated:17, avgMin:22, costUsd:12.4 } })
  ]);
  mk('chang','2026-10-05','21:45',[
    ent({ pipeline:'scene', task:'提示词模板 v3 上线，批量生成 60 个场景，成功 47',
      progress:'done', metrics:{ attempted:60, generated:47 } })
  ]);
  mk('sun','2026-10-05','20:40',[
    ent({ pipeline:'render', task:'渲染批次 R-31（24 个场景），通过 21，失败 3（显存溢出）',
      progress:'done', metrics:{ rendered:24, renderFail:3, qcPass:21 } })
  ]);

  /* ---- 2026-10-06（周二 · 内外会日） ---- */
  mk('wang','2026-10-06','20:40',[
    ent({ pipeline:'3dgs', task:'排查 B-072 纹理空洞，定位为采集重叠率不足（约 55%）', progress:'undone', reason:'等待外部素材与授权，需协调后继续',
      note:'等待补采数据回传，预计 10.08 到位', links:[] }),
    ent({ pipeline:'3dgs', task:'其余 7 个场景完成质检并归档', progress:'done' })
  ], { blocker:'B-072 要等外包方补采回传（约 10.08）才能重跑，这期间该批次质检卡着；已同步罗老师盯回传。' });
  mk('luo','2026-10-06','19:50',[
    ent({ pipeline:'3dgs', task:'农场机器巡检，替换 1 块故障硬盘；整理采集覆盖率报告',
      progress:'done',
      links:[{ url:'https://docs.internal/alef/collection-coverage-20261006', label:'覆盖率报告' }] })
  ]);
  mk('li','2026-10-06','22:10',[
    ent({ pipeline:'scene', task:'修复并发写入冲突（P1）；单场景耗时由 26 分钟降至 18 分钟', progress:'done' })
  ], { blocker:'API 账户余额按当前批量跑法约还能撑两天，需要 PM 协调充值，否则批量实测要顺延。' });
  mk('chang','2026-10-06','20:20',[
    ent({ pipeline:'scene', task:'分析 13 个失败样本，主要为尺度错乱；调整后重跑 8 个',
      progress:'done', metrics:{ attempted:8, generated:6 } })
  ]);
  mk('sun','2026-10-06','21:10',[
    ent({ pipeline:'render', task:'调整参数预设，重跑失败 3 个并全部通过；输出 QC 报告',
      progress:'done', metrics:{ rendered:3, renderFail:0, qcPass:3 } })
  ]);

  /* ---- 2026-10-07（周三） ---- */
  mk('wang','2026-10-07','21:25',[
    ent({ pipeline:'3dgs', task:'重建 B-079~B-086（8 个），自动质检全部通过',
      progress:'done', metrics:{ rebuilt:8, rebuiltFail:0 } })
  ]);
  mk('luo','2026-10-07','21:00',[
    ent({ pipeline:'3dgs', task:'与外包方对齐重叠率标准（≥70%），抽查 15 个场景', progress:'done' })
  ]);
  mk('li','2026-10-07','21:15',[
    ent({ pipeline:'scene', task:'接入 API 计费埋点，输出单场景成本；实测 $14.67', progress:'done',
      metrics:{ costUsd:14.67 } })
  ]);
  mk('chang','2026-10-07','21:35',[
    ent({ pipeline:'scene', task:'与李老师共用 Harness 队列；生成 75 个，成功 62',
      progress:'done', metrics:{ attempted:75, generated:62 } })
  ]);
  mk('sun','2026-10-07','20:30',[
    ent({ pipeline:'render', task:'渲染 R-32（30 个），通过 28；准备渲染 skill 化文档',
      progress:'done', metrics:{ rendered:30, renderFail:2, qcPass:28 },
      links:[{ url:'https://alef-results.example.com/render/r32', label:'渲染批次 R-32 成果' }] })
  ]);

  /* ---- 2026-10-08（周四） ---- */
  mk('wang','2026-10-08','21:20',[
    ent({ pipeline:'3dgs', task:'重跑 B-072 / B-073，质量已达标；整理本月重建失败清单（累计 11 个）',
      progress:'done', metrics:{ rebuilt:2, rebuiltFail:1 } })
  ]);
  mk('luo','2026-10-08','20:30',[
    ent({ pipeline:'3dgs', task:'补采 B-072 点位并重新上传（重叠率 78%）；优化农场队列调度',
      progress:'done', metrics:{ collected:1 } })
  ], { blocker:'农场窗口机位被占用，下批采集要排到周末；若下周要补量，需要提前和农场方协调时段。' });
  mk('li','2026-10-08','20:55',[
    ent({ pipeline:'scene', task:'整理为工程插件并提 PR #128；补充单元测试 12 条', progress:'done',
      links:[{ url:'https://git.internal/alef/harness/pull/128', label:'PR #128' }] })
  ]);
  mk('chang','2026-10-08','19:40',[
    ent({ pipeline:'scene', task:'更新成果对比网站至 10.5 版，上传 40 条成果', progress:'done',
      links:[{ url:'https://alef-results.example.com/v10.5', label:'成果对比网站 10.5 版' }] })
  ]);
  mk('sun','2026-10-08','21:15',[
    ent({ pipeline:'render', task:'渲染 R-33（28 个），通过 27；与 Tim 老师对齐验收口径（客户侧）',
      progress:'done', metrics:{ rendered:28, renderFail:1, qcPass:27 } })
  ]);

  /* ---- 2026-10-09（周五 · 演示基准日） ---- */
  mk('wang','2026-10-09','22:35',[
    ent({ pipeline:'3dgs', task:'重建 B-087~B-092（6 个）；与孙老师对齐渲染输入格式与命名规范',
      progress:'done', metrics:{ rebuilt:6, rebuiltFail:0 },
      links:[{ url:'https://s3.internal/alef/rebuild/batch-B087-B092', label:'批次清单' }] })
  ]);
  mk('luo','2026-10-09','21:20',[
    ent({ pipeline:'3dgs', task:'接收 2 批共 28 个场景；更新采集台账', progress:'done', metrics:{ collected:28 } })
  ]);
  mk('li','2026-10-09','21:00',[
    ent({ pipeline:'scene', task:'Code review 与联调；成功率由 82% 提升至 89%',
      progress:'done', metrics:{ attempted:24, generated:21, avgMin:18, costUsd:14.67 } })
  ]);
  mk('chang','2026-10-09','21:40',[
    ent({ pipeline:'scene', task:'生成 80 个，成功 69；整理失败分类表',
      progress:'done', metrics:{ attempted:80, generated:69 } })
  ]);
  mk('sun','2026-10-09','20:50',[
    ent({ pipeline:'render', task:'渲染 R-34（26 个）全部通过；本周 QC 通过率 96.3%',
      progress:'done', metrics:{ rendered:26, renderFail:0, qcPass:26 } })
  ], { overtime:{ on:true, hours:2, reason:'R-35 排队，赶本周批次收口' } });

  /* ---- 宋天意（TA Leader）：**照常交日报**（v1.17）—— 他和 TA / 美术 / 实习生 是同一套页面、
     同样进提交率与未交名单，只是权限更高、还能管理。这里补齐本周五个工作日的日报，
     保证「TA Leader 也是填报人」在演示数据里自洽（历史 09-28~09-30 三条见上）。 */
  mk('ta','2026-10-05','20:20',[
    ent({ pipeline:'other', task:'拆解本周两个组的任务并同步到每日任务看板；与 PM 对齐周会口径', note:'管理事务，非标准管线', progress:'done' })
  ]);
  mk('ta','2026-10-06','20:10',[
    ent({ pipeline:'other', task:'技术评审：场景生成组提示词模板 v3 与 3DGS 尺度基准的对齐方案', note:'管理事务，非标准管线', progress:'done' })
  ]);
  mk('ta','2026-10-07','21:05',[
    ent({ pipeline:'other', task:'与罗思远、王弋对齐采集重叠率 ≥70% 的验收标准；输出跨组对齐纪要', note:'管理事务，非标准管线', progress:'done' })
  ]);
  mk('ta','2026-10-08','20:45',[
    ent({ pipeline:'other', task:'复盘前期失败样本，定下「尺度错乱」专项的下一步分工', note:'管理事务，非标准管线', progress:'done' })
  ]);
  mk('ta','2026-10-09','21:10',[
    ent({ pipeline:'other', task:'两个组本周收口确认；汇总周会材料清单并交 PM', note:'管理事务，非标准管线', progress:'done' })
  ]);

  /* ---- 2026-10-05 ~ 10-09：刘一鸣（3DGS 组 · 渲染批次 + 资产采购，接手宏枢老师）/ 安雅萱（3DGS 组 · 实习） ----
     注：宏枢老师不单独交日报 —— 他的采购条线由刘一鸣在同一条日报里代表提交（两人看作一条线）。 */
  mk('liuming','2026-10-05','21:00',[
    ent({ pipeline:'render', task:'渲染批次 R-31 参数预检与显存调优，输出预检清单',
      progress:'done' }),
    ent({ pipeline:'asset', task:'淘宝采购 3D 资产 12 套，¥1,860；查重后 10 套为新资产（宏枢老师条线）',
      progress:'done', metrics:{ purchased:12, amountFen:186000 },
      links:[{ url:'https://item.taobao.com/orders/2026-10-05', label:'订单截图' }] })
  ]);
  mk('liuming','2026-10-06','20:40',[
    ent({ pipeline:'render', task:'重跑 R-31 失败的 3 个场景全部通过；补充 QC 抽查 10 个',
      progress:'done', metrics:{ rendered:3, renderFail:0, qcPass:3 } }),
    ent({ pipeline:'asset', task:'与供应商对齐授权范围（含商用与二次修改）；整理采购台账（宏枢老师条线）',
      progress:'done' })
  ]);
  mk('liuming','2026-10-07','21:20',[
    ent({ pipeline:'render', task:'渲染 R-32 后半批（16 个），通过 15；整理显存溢出规避方案',
      progress:'done', metrics:{ rendered:16, renderFail:1, qcPass:15 } }),
    ent({ pipeline:'asset', task:'采购 8 套，¥1,240；其中 2 套授权不全已退货（宏枢老师条线）',
      progress:'done', metrics:{ purchased:8, amountFen:124000 } })
  ]);
  mk('liuming','2026-10-08','20:50',[
    ent({ pipeline:'render', task:'渲染 R-33 复核并输出 QC 报告',
      progress:'done',
      links:[{ url:'https://alef-results.example.com/render/r33', label:'渲染批次 R-33 成果' }] }),
    ent({ pipeline:'asset', task:'资产入库与编号；抽查 20 套授权文件（宏枢老师条线）',
      progress:'done' })
  ], { blocker:'有 2 套资产的授权范围存疑，等宏枢老师核对完授权文件才能入台账；暂挂「待确认」。' });
  mk('liuming','2026-10-09','21:30',[
    ent({ pipeline:'render', task:'渲染 R-35（22 个）全部通过；与孙世甲对齐下批渲染参数',
      progress:'done', metrics:{ rendered:22, renderFail:0, qcPass:22 },
      links:[{ url:'https://alef-results.example.com/render/r35', label:'渲染批次 R-35 成果' }] }),
    ent({ pipeline:'asset', task:'采购 6 套，¥980；更新资产台账（累计 968 项）（宏枢老师条线）',
      progress:'done', metrics:{ purchased:6, amountFen:98000 } })
  ], { overtime:{ on:true, hours:1.5, reason:'R-35 收尾与资产台账对齐' } });

  mk('anya','2026-10-05','20:30',[
    ent({ pipeline:'other', task:'整理本周生成失败样本 40 例，按失败类型分类标注', note:'样本标注与整理，非标准管线',
      progress:'done' })
  ]);
  mk('anya','2026-10-06','20:35',[
    ent({ pipeline:'other', task:'继续标注失败样本 35 例；输出分类统计表', note:'样本标注与整理，非标准管线',
      progress:'done' })
  ]);
  mk('anya','2026-10-07','20:40',[
    ent({ pipeline:'other', task:'协助常吉祥核对提示词模板 v3 的输入输出样例', note:'样本标注与整理，非标准管线',
      progress:'done' })
  ]);
  mk('anya','2026-10-08','20:45',[
    ent({ pipeline:'other', task:'整理 3DGS 采集台账与成果命名对应关系，输出核对清单', note:'样本标注与整理，非标准管线',
      progress:'done' })
  ]);
  // 安雅萱 10-09：已存草稿未提交（演示「有草稿」提醒，22:00 截止后进入催办）
  reports.push({
    id:'r' + (rid++), personId:'anya', date:'2026-10-09', projectId:'metahuman',
    status:'draft', submittedAt:null, updatedAt:'2026-10-09T19:02',
    tomorrow:[{ pipeline:'other', task:'整理实习周报与遗留问题清单' }],
    entries:[
      ent({ pipeline:'other', task:'汇总本周标注结果与遗留问题，交接给常吉祥', progress:'done',
        note:'样本标注与整理，非标准管线' }),
      ent({ pipeline:'other', task:'3DGS 采集台账命名规则核对（本周未跑完，需加班收口）', note:'样本标注与整理，非标准管线',
        progress:'overtime', otHours:1.5 })
    ]
  });

  /* ---- 明日工作任务（每人 5 天，按 10-05 → 10-09 顺序对应「次日要做什么」） ---- */
  const TOMORROW = {
    wang:   [[['3dgs','排查 B-072 纹理空洞并定位原因']],
             [['3dgs','重跑 B-079~B-086 并做自动质检']],
             [['3dgs','重跑 B-072 / B-073 并整理本月失败清单']],
             [['3dgs','重建 B-087~B-092']],
             [['3dgs','补齐 B-072 纹理并推入渲染队列']]],
    luo:    [[['3dgs','农场机器巡检并整理覆盖率报告']],
             [['3dgs','与外包方对齐重叠率标准（≥70%）']],
             [['3dgs','补采 B-072 点位并重新上传']],
             [['3dgs','接收 2 批采集数据并更新台账']],
             [['3dgs','跟进 2 个重叠率不足场景的退回重采']]],
    li:     [[['scene','修复并发写入冲突（P1）']],
             [['scene','接入 API 计费埋点并输出单场景成本']],
             [['scene','整理为工程插件并提 PR']],
             [['scene','Code review 与联调，提升成功率']],
             [['scene','把提效后的参数固化进默认配置']]],
    chang:  [[['scene','分析失败样本并调整提示词']],
             [['scene','批量生成并整理失败分类表']],
             [['scene','更新成果对比网站至 10.5 版']],
             [['scene','生成 80 个场景并按失败类型分类']],
             [['scene','提示词模板 v4 试验与 A/B 对比']]],
    sun:    [[['render','调整参数预设，重跑失败 3 个']],
             [['render','渲染 R-32 并准备渲染 skill 化文档']],
             [['render','渲染 R-33，与 Tim 老师对齐验收口径']],
             [['render','渲染 R-34 并做本周 QC 汇总']],
             [['render','整理渲染 skill 文档并交接给刘一鸣']]],
    // 刘一鸣：渲染 + 资产采购两条线，采购那条是宏枢老师的条线（两人看作一条线）
    liuming:[[['render','重跑 R-31 失败场景并抽查 QC'],['asset','与供应商对齐授权范围并整理台账']],
             [['render','渲染 R-32 后半批并整理显存规避方案'],['asset','采购 8 套并核对授权文件']],
             [['render','复核 R-33 并输出 QC 报告'],['asset','完成资产入库编号与抽查']],
             [['render','渲染 R-35 并复核输出 QC 报告'],['asset','采购 6 套并更新资产台账']],
             [['render','与孙世甲对齐下批渲染参数'],['asset','核对 2 套退货的退款到账情况']]],
    anya:   [[['other','继续标注失败样本并输出分类统计']],
             [['other','核对提示词模板 v3 的输入输出样例']],
             [['other','整理采集台账与成果命名的对应关系']],
             [['other','汇总本周标注结果']],
             [['other','整理实习周报与遗留问题清单']]],
    // TA Leader（管理事务，非标准管线）：照常写「明日计划」
    ta:     [[['other','两组任务对齐；把提示词 v3 的验收口径同步给 PM']],
             [['other','技术评审结论落文档，作为跨组对齐依据']],
             [['other','跟进采集重叠率 ≥70% 的退回重采进度']],
             [['other','专项分工复盘并确认下周排期']],
             [['other','准备周会材料清单，与 PM 过一遍收口情况']]]
  };
  ['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09'].forEach((d, i) => {
    reports.forEach(r => {
      if (r.date !== d) return;
      const t = TOMORROW[r.personId];
      if (t && t[i]) r.tomorrow = t[i].map(x => ({ pipeline:x[0], task:x[1] }));
    });
  });

  /* 宏枢老师不交日报（他的采购条线已并入刘一鸣的每日日报，两人看作一条线），
     这里不再保留他的独立日报 —— 避免出现「不在提交名单、却能看到他交了日报」的自相矛盾。 */

  /* ============================================================
     每日任务（FR-38）
     一人一天一条；10:45 前提交为「按时」，之后为「逾期」，没交就是「未交」。
     结构：{ personId, date, items[{task, priority, pipeline, note}], note,
             status:'submitted'|'draft', submittedAt, source, editRequest }
     按时 / 逾期 / 未交 / 修改中 全部由 store 派生，不落库。
     ============================================================ */
  const tasks = [];
  (function () {
    const toD = s => { const a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); };
    const toS = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    const shift = (s, k) => { const x = toD(s); x.setDate(x.getDate() + k); return toS(x); };
    const isWd = s => {
      if (calendar.holidays.indexOf(s) >= 0) return false;
      if (calendar.extraWorkdays.indexOf(s) >= 0) return true;
      return calendar.workdays.indexOf(toD(s).getDay()) >= 0;
    };
    const days = [];
    let cur = '2026-10-09', guard = 0;
    while (days.length < 12 && guard++ < 80) { if (isWd(cur)) days.push(cur); cur = shift(cur, -1); }
    days.reverse();                                   // 由早到晚

    let tid = 1;
    const put = (personId, date, items, opt) => {
      const o = opt || {};
      tasks.push({
        id:'tk' + (tid++), personId:personId, date:date,
        items:(items || []).map((it, i) => ({ id:'ti' + (tid++) + '_' + i, task:it.t,
          priority:it.p || 'mid', pipeline:it.pl, note:it.n || '' })),
        note:o.note || '', status:o.status || 'submitted',
        submittedAt:o.status === 'draft' ? null : (date + 'T' + (o.at || '10:00')),
        source:o.source || 'manual', editRequest:o.editRequest || null
      });
    };

    /* ---- 演示基准日 2026-10-09（周五）：八人各一条，覆盖五种状态 ---- */
    const TODAY_SET = {
      chang: { at:'10:12', src:'daily', items:[
        { t:'把模板 v3 固化进 Harness，跑通 40 个场景验证', p:'high', pl:'scene' },
        { t:'整理本周失败分类表（尺度错乱 / 光照异常）', p:'mid', pl:'scene' },
        { t:'与王弋对齐 3DGS 尺度基准，写入对照文档', p:'low', pl:'other', n:'跨组对齐事务' }] },
      li:    { at:'09:58', src:'manual', items:[
        { t:'接入 API 计费埋点，输出单场景成本指标', p:'high', pl:'scene' },
        { t:'修复并发写入冲突（P1），补回归用例', p:'mid', pl:'scene' }] },
      sun:   { at:'11:20', src:'copy', items:[
        { t:'渲染 R-35 并输出 QC 报告（26 个）', p:'high', pl:'render' },
        { t:'渲染 skill 化文档初稿，交接给刘一鸣', p:'mid', pl:'render' }] },
      wang:  { at:'10:30', src:'daily', items:[
        { t:'重建 B-087~B-092 共 6 个场景', p:'high', pl:'3dgs' },
        { t:'排查 B-072 纹理空洞并定位原因', p:'high', pl:'3dgs' },
        { t:'更新重建台账与 S3 批次命名', p:'low', pl:'3dgs' }],
        edit:{ at:'2026-10-09T14:10', reason:'任务描述漏了场景编号，需补充后重交', by:'wang', granted:true } },
      luo:   { at:null, status:'draft', src:'manual', items:[
        { t:'与外包方对齐重叠率 ≥70% 的验收标准', p:'high', pl:'3dgs' },
        { t:'接收 2 批采集数据并更新采集台账', p:'mid', pl:'3dgs' }] },
      liuming: { at:null, status:'missing', src:'manual', items:[] },
      anya:  { at:'10:05', src:'manual', items:[
        { t:'标注失败样本 30 例并输出分类统计表', p:'mid', pl:'other', n:'样本标注与整理，非标准管线' }] },
      // TA Leader 也是填报人（v1.17）：给自己排管理/评审类任务，照常 10:45 前提交
      ta:    { at:'09:45', src:'manual', items:[
        { t:'两个组当日任务对齐；与 PM 同步周会材料清单', p:'high', pl:'other', n:'管理事务，非标准管线' },
        { t:'技术评审：3DGS 尺度基准与提示词模板 v3 对齐', p:'mid', pl:'other', n:'管理事务，非标准管线' }] }
    };
    const D0 = '2026-10-09';
    Object.keys(TODAY_SET).forEach(pid => {
      const v = TODAY_SET[pid];
      if (v.status === 'missing') return;              // 未交 = 没有记录
      put(pid, D0, v.items, { at:v.at, status:v.status || 'submitted', source:v.src, editRequest:v.edit || null });
    });

    /* ---- 历史 11 个工作日：用于连续天数 / 按时率趋势 / 排行 ----
       每人每天的「是否交」按固定节奏制造波动，保证趋势图有起伏。 */
    const HIST = days.slice(0, -1);
    const ROSTER = ['chang','li','sun','wang','luo','liuming','anya','ta'];
    const PLAN = {
      chang:[3,3,2,3,3,2,3,3,2,3,3], li:[2,2,2,1,2,2,2,2,2,2,1],
      sun:[2,2,2,2,1,2,2,2,2,2,2],   wang:[3,3,3,2,3,3,3,2,3,3,3],
      luo:[2,2,1,2,2,2,1,2,2,2,2],   liuming:[2,2,2,2,2,1,2,2,2,2,2],
      anya:[1,1,1,1,1,1,1,1,1,1,1],
      ta:[2,2,2,2,2,2,2,2,2,2,2]
    };
    // n/a = 未交；'late' = 逾期提交；其余为按时提交的分钟数偏移
    const SHAPE = {
      chang:  ['ok','ok','late','ok','ok','ok','ok','late','ok','ok','ok'],
      li:     ['ok','ok','ok','ok','late','ok','ok','ok','ok','ok','ok'],
      sun:    ['ok','late','ok','ok','ok','ok','late','ok','ok','ok','ok'],
      wang:   ['ok','ok','ok','ok','ok','late','ok','ok','ok','ok','ok'],
      luo:    ['ok','ok','ok','late','ok','ok','ok','ok','na','ok','late'],
      liuming:['ok','ok','ok','ok','ok','ok','ok','ok','ok','na','ok'],
      anya:   ['ok','ok','late','ok','ok','ok','ok','ok','ok','late','ok'],
      ta:     ['ok','ok','ok','ok','late','ok','ok','ok','ok','ok','ok']
    };
    HIST.forEach((d, i) => {
      ROSTER.forEach(pid => {
        const sh = SHAPE[pid][i];
        if (sh === 'na') return;
        const n = PLAN[pid][i];
        const items = [];
        for (let k = 0; k < n; k++) {
          items.push({ t: (pid === 'liuming' && k === 1) ? '资产采购与台账更新（宏枢老师条线）'
            : pid === 'ta' ? (k === 0 ? '两组任务对齐与技术评审' : '跨链路口径确认，同步 PM')
            : '当日任务 ' + (k + 1) + '：按计划推进并同步进度', p: k === 0 ? 'high' : (k === 1 ? 'mid' : 'low'),
            pl: (pid === 'chang' || pid === 'li' ? 'scene' : pid === 'sun' ? 'render'
              : (pid === 'anya' || pid === 'ta') ? 'other' : pid === 'liuming' ? (k === 1 ? 'asset' : 'render') : '3dgs'),
            n: pid === 'anya' ? '样本标注与台账整理，非标准管线'
              : pid === 'ta' ? '管理事务，非标准管线' : '' });
        }
        const at = sh === 'late' ? '11:05' : ('0' + (9 + (i % 2)) + ':' + String(10 + (i * 7) % 45).padStart(2, '0'));
        put(pid, d, items, { at:at, source:'manual' });
      });
    });
  })();

  /* ---------------- 催办记录 ----------------
     18:30 约定汇报时点首提 → 21:30 二次提醒 → 22:00 截止，未交即催办。
     模型不带「已读」字段：没有企业微信、没接第三方消息平台，拿不到回执，
     存个 false 只是假数据；催办是否生效看「结果」= 被催人后来交没交。
     宏枢老师已不在提交名单（日报由刘一鸣代表），所以他的草稿不触发任何催办。 */
  const reminders = [
    { id:'rm1', date:'2026-10-09', personId:'anya', by:'system', at:'2026-10-09T18:30', channel:'站内', kind:'auto',   note:'18:30 该交今日日报 + 明日计划了' },
    { id:'rm2', date:'2026-10-09', personId:'anya', by:'system', at:'2026-10-09T21:30', channel:'站内', kind:'auto',   note:'二次提醒（含 PM 抄送）' },
    { id:'rm3', date:'2026-10-09', personId:'anya', by:'olivia', at:'2026-10-09T22:05', channel:'微信', kind:'manual', note:'22:00 已过仍未提交，PM 复制话术发出' }
  ];

  /* ---------------- 操作日志 ---------------- */
  const logs = [
    { id:'lg1', at:'2026-10-05T11:54', who:'olivia', action:'生成 PPT 取材包', detail:'周期 2026-10-05 · 版本 N1' },
    { id:'lg2', at:'2026-10-06T11:56', who:'olivia', action:'生成客户版材料', detail:'周期 2026-10-05 · 客户可见字段违规数 0' },
    { id:'lg3', at:'2026-10-08T18:41', who:'olivia', action:'生成周中快照', detail:'周期 2026-10-05 · 逾期 41 分钟' },
    { id:'lg5', at:'2026-10-09T18:24', who:'olivia', action:'确认已粘贴 Google Sheet', detail:'周期 2026-10-05 · 进度块 N7' },
    { id:'lg6', at:'2026-10-09T22:05', who:'olivia', action:'催办', detail:'安雅萱 · 微信（话术已复制）' }
  ];

  /* ============================================================
     周报板块（FR-32）
     周一 17:00 前：各位老师交「上周任务结果」（+ 本周目标建议、风险）
     周二 周会后 ：PM 发布「本周工作任务」→ 所有人可见
     ============================================================ */
  const weekReports = [
    // 周期 2026-10-05（周一收料那一次）：全部已提交
    { id:'wr1', week:'2026-10-05', personId:'chang', groupId:'gen', status:'submitted', submittedAt:'2026-10-05T16:20',
      lastResult:'Codex 提示词模板 v2→v3 迭代完成，批量生成成功率由 68% 提升至 78%；整理失败样本 40 例并分类。',
      suggest:[{ pipeline:'scene', task:'把模板 v3 固化进 Harness，批量扩到 200 场景/天' }],
      risks:'失败集中在尺度错乱，需要 3DGS 侧的尺度基准做对照。' },
    { id:'wr2', week:'2026-10-05', personId:'li', groupId:'gen', status:'submitted', submittedAt:'2026-10-05T16:45',
      lastResult:'Harness 调度模块重构完成，支持失败自动重试；单场景耗时由 26 分钟降至 22 分钟。',
      suggest:[{ pipeline:'scene', task:'接入计费埋点，输出单场景成本指标' }],
      risks:'与场景生成组共用队列时偶发抢占，需要定优先级规则。' },
    { id:'wr3', week:'2026-10-05', personId:'sun', groupId:'gen', status:'submitted', submittedAt:'2026-10-05T16:05',
      lastResult:'渲染批次 R-28~R-30 完成，QC 通过率 94%；渲染 skill 化文档初稿已出。',
      suggest:[{ pipeline:'render', task:'把显存溢出规避方案写进渲染预设，减少重跑' }],
      risks:'' },
    { id:'wr4', week:'2026-10-05', personId:'wang', groupId:'d3', status:'submitted', submittedAt:'2026-10-05T17:00',
      lastResult:'重建完成 18 个场景，失败 3 个（均为采集重叠率不足）；S3 批次命名规范统一。',
      suggest:[{ pipeline:'3dgs', task:'把重叠率预检做进采集交付验收' }],
      risks:'外包采集质量波动，退回重采会拖 1–2 天。' },
    { id:'wr5', week:'2026-10-05', personId:'luo', groupId:'d3', status:'submitted', submittedAt:'2026-10-05T15:30',
      lastResult:'接收外包采集 96 个场景，退回 5 个；农场机器完成一轮巡检（换 1 块硬盘）。',
      suggest:[{ pipeline:'3dgs', task:'与外包方对齐重叠率 ≥70% 的验收标准' }],
      risks:'' },
    { id:'wr6', week:'2026-10-05', personId:'liuming', groupId:'d3', status:'submitted', submittedAt:'2026-10-05T16:50',
      lastResult:'渲染批次预处理与显存参数调优；QC 抽查 30 个，1 个需重跑。',
      suggest:[{ pipeline:'asset', task:'接手资产采购与查重的台账维护' }],
      risks:'采购与渲染两条线并行，需要明确优先级。' },
    { id:'wr7', week:'2026-10-05', personId:'anya', groupId:'d3', status:'submitted', submittedAt:'2026-10-05T15:10',
      lastResult:'失败样本标注 96 例，输出分类统计表；采集台账与成果命名核对清单完成。',
      suggest:[], risks:'' },
    // TA Leader 也交周报（v1.17）：不带组，直接交 PM（groupId 为 null）
    { id:'wr7b', week:'2026-10-05', personId:'ta', groupId:null, status:'submitted', submittedAt:'2026-10-05T16:30',
      lastResult:'两个组的任务拆解与周会口径统一；3DGS 尺度基准与提示词模板 v3 的对齐方案定稿。',
      suggest:[{ pipeline:'other', task:'把「尺度错乱」专项列为下周重点，分组认领' }],
      risks:'跨组依赖仍是主要风险：3DGS 尺度基准不统一会持续影响生成成功率。' },

    // 周期 2026-10-12（下一次收料）：周一还没到，待收
    { id:'wr8', week:'2026-10-12', personId:'chang', groupId:'gen', status:'draft', submittedAt:null,
      lastResult:'（草稿）模板 v3 上线，本周生成成功率由 78% 提升至 86%。',
      suggest:[{ pipeline:'scene', task:'试模板 v4 并做 A/B 对比' }], risks:'' }
  ];

  /* PM 发布的「本周工作任务」（周二周会后，所有人可见） */
  const weekPlans = [
    { week:'2026-10-05', by:'olivia', updatedAt:'2026-10-06T14:05', text:[
      '1. 3DGS 组：重建 B-071~B-092 批次收口，把采集重叠率预检做进外包验收；目标本周重建 40 个场景。',
      '2. 3DGS 组：完成 R-31~R-34 渲染与 QC，QC 通过率保持 ≥95%。',
      '3. 场景生成组：Codex 模板 v3 固化进 Harness，批量扩到 200 场景/天；输出单场景成本指标。',
      '4. 场景生成组：渲染 skill 化文档定稿，把显存规避方案写进预设。',
      '5. 全员：每天 18:30 交日报（当日内容 + 明日计划），周一 17:00 前交上周结果。'
    ].join('\n') }
  ];

  /* ---------------- 内容流（工作台信息流 · FR-37） ----------------
     团队新闻 / 公告 / 活动 / 分享 / 学习。**实习生是信息流的正常参与者**：
     可发学习笔记、任务进展、问题求助；内容恒定带「实习生」标识 ——
     标识由 people[].role === 'intern' 自动生成，不可手改、不可隐藏（防冒用）。
     分类权限见 roles[].news.cats；「公告」只有管理层能发。
     点赞与评论**内联在条目里** —— 团队 10 人规模，内联口径最少；
     真实部署时拆成 news_likes / news_comments 两张服务端表。
     status：published 已发布 / draft 草稿 / pending 待审核 / rejected 未通过。 */
  const news = [
    { id:'nw1', category:'公告', pinned:true, status:'published',
      title:'本周节奏调整：各组材料仍按周一 17:00 交，周二周会后 PM 发本周任务',
      body:[
        '# 本周节奏调整',
        '',
        '上周有两条线在周一 17:00 之后才补材料，导致取材包刷了三遍。本周起固定下来：',
        '',
        '- **周一 17:00** 各组交「上周结果 + 要上 PPT 的材料」，逾期不再单独等',
        '- **周一下午** PM 出取材包初稿，20:00 刷新一次（含晚交）',
        '- **周二 11:00** 内会材料（含成本与卡点）· **12:00** 客户版材料（脱敏）',
        '- **周二周会后** PM 更新「本周工作任务」，全员可见',
        '',
        '> 材料还没齐的，直接在自己日报的「明日工作任务」里先写清楚，不用另外发消息。',
        '',
        '有异议的在这条下面评论，或者 @我。'
      ].join('\n'),
      cover:'', attachments:[], links:[],
      authorId:'olivia', at:'2026-10-09T08:30',
      likes:['wang','li','luo','sun'],
      comments:[
        { id:'c1', authorId:'chang', at:'2026-10-10T09:40', text:'收到。Codex 那条线周一上午能出结果，不会压到 17:00 之后。', mentions:[] },
        { id:'c2', authorId:'olivia', at:'2026-10-10T09:52', text:'好，那就按这个来。', mentions:[] }
      ] },

    { id:'nw2', category:'新闻', pinned:false, status:'published',
      title:'客户侧回传：第二批点位规划确认 48 个，可用资产筛选同步推进',
      body:[
        '坤那边今天回传了第二批点位：**规划 62 个 · 确认 48 个**，剩 14 个等重叠率补齐后复筛。',
        '',
        '- 已确认的 48 个可以直接进渲染队列',
        '- 待确认的 14 个里，有 6 个卡在重叠率不足 70%，已退回重采',
        '- 客户侧可用资产数更新为 312',
        '',
        '渲染排期按确认点位走，未确认的先不进批次，避免返工。'
      ].join('\n'),
      cover:'', attachments:[], links:[
        { title:'客户侧点位回传（内部记录）', url:'https://alef-results.example.com/client/points-2026-10-09' }
      ],
      authorId:'olivia', at:'2026-10-09T17:40',
      likes:['liuming','wang','luo'],
      comments:[] },

    { id:'nw3', category:'活动', pinned:false, status:'published',
      title:'本周五 16:30 组内分享：渲染农场调度与显存规避（主讲 刘一鸣）',
      body:[
        '本周五 **16:30–17:15**，会议室 + 线上同步。',
        '',
        '**主题**：渲染农场调度与显存溢出规避',
        '- R-32 后半批那次显存溢出是怎么定位的',
        '- 批次参数预检清单（已经沉淀成脚本了）',
        '- 下批渲染与孙世甲的参数对齐结论',
        '',
        '欢迎两组同学都来，实习生也可以直接提问。'
      ].join('\n'),
      cover:'', attachments:[{ name:'渲染参数预检清单.md', size:18420 }], links:[],
      authorId:'ta', at:'2026-10-09T15:20',
      likes:['sun','wang','luo','anya','chang'],
      comments:[
        { id:'c1', authorId:'sun', at:'2026-10-09T15:44', text:'那我这边把 QC 侧的检查点也整理一页带过去。', mentions:[] }
      ] },

    { id:'nw4', category:'分享', pinned:false, status:'published',
      title:'纹理空洞排查经验：B-072 那批是这样定位到的',
      body:[
        'B-072 / B-073 的纹理空洞，最后定位到**采集时的重叠率不足**，不是重建参数问题。',
        '',
        '## 排查顺序（建议照这个走）',
        '1. 先看采集台账的重叠率，低于 70% 的直接退回，别急着调参数',
        '2. 重叠率达标再查重建日志里的高斯点数，点数异常偏低的挑出来',
        '3. 前两步都正常，才去动重建参数',
        '',
        '```',
        'B-072 重叠率 61%  → 退回重采  → 重跑后通过',
        'B-079 重叠率 88%  → 高斯点数偏少 → 调参后通过',
        '```',
        '',
        '这次浪费了半天在参数上，记一下。'
      ].join('\n'),
      cover:'', attachments:[], links:[],
      authorId:'wang', at:'2026-10-09T20:10',
      likes:['luo','liuming'],
      comments:[
        { id:'c1', authorId:'luo', at:'2026-10-09T21:05', text:'采集台账我这边每天更新，需要的话我把字段开给重建侧只读。', mentions:[] }
      ] },

    { id:'nw5', category:'学习', pinned:false, status:'published',
      title:'学习笔记：3DGS 的 LOD 分层与延迟着色，为什么能压下单帧耗时',
      body:[
        '# 3DGS 实时渲染优化：LOD 分层 + 延迟着色',
        '',
        '这周读了两篇，把能落到我们管线上的部分记一下。',
        '',
        '**核心思路**：不是所有高斯都要同精度解算。',
        '- 近处只解算高层级高斯（细节全开）',
        '- 远端走低层级（数量先降下来）',
        '- 延迟着色把光照计算推迟到可见性剔除之后',
        '',
        '**和我们的关系**：我们现在的重建管线是「一个场景一套高斯」，没有分层。如果按距离分两组，远处的显存占用应该能明显下来 —— 之前 R-32 的显存溢出就卡在这里。',
        '',
        '> 还没做实验，先把思路放出来。@常吉祥 老师如果觉得方向对，我可以在样本集上先跑个小对比。'
      ].join('\n'),
      cover:'', attachments:[], links:[
        { title:'arXiv · 计算机图形学最新收录', url:'https://arxiv.org/list/cs.GR/recent' }
      ],
      authorId:'anya', at:'2026-10-09T19:30',
      mentions:['chang'],
      likes:['wang','chang','li'],
      comments:[
        { id:'c1', authorId:'chang', at:'2026-10-09T21:20', text:'方向是对的，而且正好接上这周的显存问题。你先拿 5 个场景做个对比，把单帧耗时和显存峰值都记下来，周五分享会可以顺带讲一下。', mentions:['anya'] }
      ] },

    { id:'nw6', category:'分享', pinned:false, status:'published',
      title:'问题求助：标注样本里「反光材质」这一类我拿不准，想确认口径',
      body:[
        '这周标了 75 例失败样本，大部分能归到「重叠率不足」和「提示词歧义」两类。',
        '',
        '有一类我拿不准：**反光材质**（金属、玻璃、水面的场景）。现在的分类表里没有这一项，我暂时都放进了「其他」。',
        '',
        '想确认的是：',
        '- 是单独开一类，还是并进「材质异常」？',
        '- 如果单独开，判定标准怎么定（反射强度？还是明显过曝就算）？',
        '',
        '@常吉祥 老师有空的话帮我定个口径，我好把这 12 例重新归档。'
      ].join('\n'),
      cover:'', attachments:[{ name:'失败样本分类统计-1008.csv', size:9216 }], links:[],
      authorId:'anya', at:'2026-10-08T18:05',
      mentions:['chang'],
      likes:['chang'],
      comments:[
        { id:'c1', authorId:'chang', at:'2026-10-08T18:40', text:'单独开一类，判定按「反射区域占比 > 30%」。我先加进分类表，你按新口径重标就行。', mentions:['anya'] }
      ] },

    { id:'nw7', category:'学习', pinned:false, status:'draft',
      title:'（草稿）本周实习周总结',
      body:'# 本周小结\n\n- 标注 75 例失败样本，输出分类统计表\n- 协助核对提示词模板 v3 的输入输出样例\n- 整理 3DGS 采集台账与成果命名的对应关系\n\n下周计划：',
      cover:'', attachments:[], links:[],
      authorId:'anya', at:'2026-10-08T11:20',
      likes:[], comments:[] },

    /* ---- AI 资讯（v1.22a：source:'news'，只在 NEWS 页与工作台「NEWS · AI 资讯」卡出现，
       不混入团队信息流；从 NEWS 页「＋ 发 AI 资讯」发布的内容自动带这个标记） ---- */
    { id:'nw8', category:'新闻', source:'news', pinned:false, status:'published',
      title:'Sora 2 发布：一段提示词直出带音轨的成片，物理一致性明显提升',
      body:[
        'OpenAI 发布 **Sora 2**，对比一代的主要变化：',
        '',
        '- 音画同生：对白、音效随画面一起生成，不用后期配音',
        '- 物理一致性：失败样本里的穿模 / 漂浮问题明显减少',
        '- 支持把真人形象「客串」进生成场景（Cameos）',
        '',
        '> 对我们的参考价值：外景补拍镜头可以先用它出预演小样，再决定要不要真去实拍。'
      ].join('\n'),
      cover:'', attachments:[], links:[
        { title:'Sora 2 官方介绍', url:'https://openai.com/index/sora-2/' }
      ],
      authorId:'wang', at:'2026-10-09T09:12',
      likes:['liuming','anya','luo'],
      comments:[
        { id:'c1', authorId:'luo', at:'2026-10-09T10:02', text:'预演小样这个用法很实际，采提前置的话能省不少行程成本。', mentions:[] }
      ] },

    { id:'nw9', category:'新闻', source:'news', pinned:false, status:'published',
      title:'ComfyUI 新节点原生支持 3DGS 渲染，重建结果可以直接进合成流程',
      body:[
        'ComfyUI 社区版合入了 **3DGS 原生渲染节点**：',
        '',
        '- .ply 点云直接作为节点输入，不用再导出中间格式',
        '- 相机轨迹可以接关键帧节点，与 2D 后期串联',
        '',
        '对重建管线的意义：格式转换这一步可以砍掉，出片流程少一次质量损失。'
      ].join('\n'),
      cover:'', attachments:[], links:[],
      authorId:'liuming', at:'2026-10-08T16:40',
      likes:['wang','sun'],
      comments:[] }
  ];

  /* ---------------- 知识库（类飞书：空间 → 目录树 → 文档） ---------------- */
  const kb = {
    spaces: [
      { id:'sp-meta', name:'MetaHuman 项目' },
      { id:'sp-rule', name:'规则与流程' },
      { id:'sp-tech', name:'技术文档' },
      { id:'sp-min',  name:'会议纪要' }
    ],
    nodes: [
      /* ---- MetaHuman 项目 ---- */
      { id:'kb1', spaceId:'sp-meta', parentId:null, type:'doc', title:'项目概览',
        author:'olivia', updatedAt:'2026-10-09T10:20', body:[
        '# MetaHuman 虚拟人项目',
        '',
        '**客户**：Kelvin 老师（Kev）及其团队（坤 · 可用性筛选 / 点位规划，Tim 老师 · 渲染质量验收）。',
        '',
        '## 我们做什么',
        '用 3DGS 实景采集与重建，加上两条程序化生成管线（API + Harness、Codex），',
        '批量产出可直接投入渲染的场景资产，并按客户规划点位完成渲染交付。',
        '',
        '## 五条工作管线',
        '- **3DGS 采集与重建**——外包采集数据接收、重建、质检、上传',
        '- **API + Harness 管线开发**——批量调度、失败重试、工程化沉淀',
        '- **Codex / AI 场景生成**——提示词模板、批量生成、失败归因',
        '- **场景资产采购**——淘宝采购、查重、授权核查、台账',
        '- **场景渲染与 QC**——批次渲染、参数预检、验收口径',
        '',
        '> 五条管线的正式命名会同时出现在日报下拉、看板和给客户的材料上，改动前先对齐。',
        '',
        '相关页面：[[doc:产能口径与四段链路]] · [[doc:一周节奏]]'
      ].join('\n') },
      { id:'kb2', spaceId:'sp-meta', parentId:null, type:'doc', title:'一周节奏',
        author:'olivia', updatedAt:'2026-10-12T16:15', body:[
        '# 一周节奏（系统骨架）',
        '',
        '| 时点 | 事项 | 产出 |',
        '|---|---|---|',
        '| 周一 12:00 | 预生成取材包 | 上周进展初稿 |',
        '| 周一 14:00 | 开始收集上周工作与成果 | 各条线补齐 |',
        '| **周一 17:00** | **各组交上一周的结果 + 要上 PPT 的材料** | 周报（上周结果 / 本周目标建议 / 风险） |',
        '| 周二 11:00 | 内部会议 | 内会材料（含成本与卡点） |',
        '| 周二 12:00 | 与 Kelvin 汇报 | 客户版材料（脱敏） |',
        '| **周二周会后** | **PM 发布「本周工作任务」** | 全员可见的本周目标 |',
        '| 周五 18:00 | 更新 Kelvin 的 Google Sheet | 可复制进度块 |',
        '',
        '## 每天的固定动作',
        '- **18:30** 每位老师汇报当日任务内容 + **明日工作计划**',
        '- **22:00** 提交截止；21:30 二次提醒并抄送 PM',
        '- PM 查看「未交名单」，一键生成催办话术 → 自己复制发到微信群 / 私聊（**系统不代发**）',
        '- 提交完点「**复制对外版发群**」，把给 Kelvin 的那一版直接发微信群',
        '',
        '> 时点全部可在 管理 → 口径配置 中调整；改一处，提醒与准时率口径同步生效。',
        '> 周报规则见 [[doc:周报规则]]。这份节奏是团队约定，系统内不再做节点追踪页面（v1.14 下线「本周节奏」）。'
      ].join('\n') },
      { id:'kb3', spaceId:'sp-meta', parentId:null, type:'doc', title:'产能口径与四段链路',
        author:'olivia', updatedAt:'2026-10-07T18:40', body:[
        '# 产能口径（最容易打架的地方）',
        '',
        '四条链路**并行统计、互不做除法**：',
        '',
        '- **3DGS**：采集数 → 重建完成 → 质检通过 → 上传完成',
        '- **AI 生成**：尝试数 → 生成成功（成功率自动计算）',
        '- **资产采购**：采购数 → 可用数（可用数来自客户侧回传）',
        '- **渲染**：规划点位 → 确认可用点位 → 渲染完成 → QC 通过',
        '',
        '## 待确认口径',
        '- 「有效场景」以哪一步为准 —— 会上未拍板，系统里显示**待确认**',
        '- 历史基线（采集 133 / 已重建 63 / 台账 968 / 可用 600–700）是否作为累计起点',
        '',
        '> 客户侧数字（可用资产数、点位数、验收结果）由 PM 代录，带「客户侧」标签，',
        '> 不并入内部成本。未回传时显示「未回传」，不显示 0。'
      ].join('\n') },
      { id:'kb4', spaceId:'sp-meta', parentId:null, type:'doc', title:'本周进展速览',
        author:'olivia', updatedAt:'2026-10-09T18:22', auto:'weekly',
        body:'（本页由日报数据自动生成，每个周期刷新；请勿手改）' },

      /* ---- 规则与流程 ---- */
      { id:'kb5', spaceId:'sp-rule', parentId:null, type:'doc', title:'日报填写规则',
        author:'olivia', updatedAt:'2026-10-12T16:05', body:[
        '# 日报怎么填',
        '',
        '**一人一天一条**，下挂 1–10 条条目。每条写清四件事：',
        '**做了什么、花多久、到哪一步、产出在哪**。',
        '',
        '## 时间点（按这个来）',
        '- **18:30** 汇报当日任务内容 **+ 明日工作计划**',
        '- **22:00** 提交截止；22:00 后仍可交，但记为「逾期提交」（计入提交率、不计入准时率）',
        '- **周一 17:00 前**：把**上一周的结果**与要上 PPT 的材料交给 PM',
        '- **周二周会后**：PM 发布「本周工作任务」，所有人可见',
        '',
        '## 每天还要写「明日工作任务」',
        '日报末尾单独一栏，写**次日要做什么**（1–3 条，选管线 + 一句话）。',
        '这一栏是周会材料的直接来源 —— 周一把上周每天的「明日计划」收拢起来，就是本周要问的任务目标。',
        '',
        '> 明日计划**不要求准确**，只要求当天写下来。次日变了就写变了，',
        '> 不许为了对齐而回头改昨天写的计划。',
        '',
        '## 当天卡住了，写「当日卡点」',
        '日报末尾还有一栏**当日卡点**（选填）：今天卡在哪、等谁、等什么数据、缺什么权限。',
        '',
        '- **不是工作条目** —— 它只是当天的说明，不占条目额度，也不需要填产出物',
        '- **只进内部版** —— 对外版（发 Kelvin 的那一版）**根本没有这一栏**，不用担心漏出去',
        '- PM 会在内会材料里把它置顶；不写等于这天没卡点，卡着的事就没人替你协调',
        '',
        '> 和条目里的「阻塞」不是一回事：**阻塞**是某条具体工作做不下去；**当日卡点**是今天整体的',
        '> 卡点（可能还没影响进度，但已经开始挡路）。两条都写不冲突。',
        '',
        '## 按组交',
        '| 组 | 成员 | 负责人 |',
        '|---|---|---|',
        '| 场景生成组 | 常吉祥、李宇尧、孙世甲 | TA Leader 宋天意 |',
        '| 3DGS 组 | 王弋、罗思远、刘一鸣、安雅萱 | TA Leader 宋天意 |',
        '',
        '两个组都由 TA Leader 统一管。**宏枢老师不单独交日报** —— 他的采购条线由刘一鸣在',
        '自己的日报里代表提交（两人看成一条线）。',
        '',
        '## 四条硬规则',
        '1. 状态选「已完成」→ 必须留产出物链接',
        '2. 状态选「阻塞」→ 必须写原因，且在看板置顶单独成区',
        '3. **每天 22:00 前提交**；22:00 后仍可交，但记为「逾期提交」',
        '4. 漏交可在 7 天内补报，超期找管理员开通',
        '',
        '## 提醒节奏',
        '- **18:30** 系统首次提醒（到该汇报的时点了）',
        '- **21:30** 二次提醒，并抄送 PM；22:00 截止后未交的进「最终未交名单」',
        '',
        '## 提交完顺手做的一件事',
        '点「**复制对外版发群**」，把给 Kelvin 的那一版直接发微信群（成本 / 金额 / 内部链接 / 当日卡点不会出现）',
        '',
        '会议、行政、交接归到「其他」管线。',
        '规则出处：[[doc:周报规则]] · [[doc:每日汇报两版规则]] · [[doc:权限与角色]]'
      ].join('\n'),
        /* v1.20 划词批注（Google Docs 式）：quote = 选中的正文文字，prefix/suffix 用于同文重名时定位 */
        annos:[
        { id:'ka1', quote:'做了什么、花多久、到哪一步、产出在哪', prefix:'', suffix:'。',
          author:'olivia', at:'2026-10-12T17:40', resolved:false,
          text:'四件事缺一不可，尤其「产出在哪」——没有链接的完成不算完成。',
          replies:[
            { author:'song', at:'2026-10-12T19:05', text:'收到，本周组内自查一遍条目质量。' }
          ] },
        { id:'ka2', quote:'明日工作计划', prefix:'汇报当日任务内容 + ', suffix:'',
          author:'chang', at:'2026-10-12T21:12', resolved:false,
          text:'这里能不能给个示例？新人第一次填容易把「明日计划」写成今天的延续。',
          replies:[] }
        ] },
      { id:'kb6', spaceId:'sp-rule', parentId:null, type:'doc', title:'每日汇报两版规则',
        author:'olivia', updatedAt:'2026-10-12T15:10', body:[
        '# 每日汇报要有两个版本',
        '',
        '每天从日报一键生成两版汇报文本，**同源不同权**——同一份数据，只差字段可见范围：',
        '',
        '| | 内部版 | 对外版（发 Kelvin） |',
        '|---|---|---|',
        '| 成本 / 金额 | 含 | **一律不含** |',
        '| 内部链接 | 含 | 只留可对外访问的正式链接 |',
        '| 条目级卡点（阻塞备注） | 写内部依赖与原因 | 保留，改成「待协调」措辞 |',
        '| **日报级「当日卡点」** | 含 | **完全没有这一栏**（不是被过滤，是不生成） |',
        '| 明日工作任务 | 含 | 含 |',
        '',
        '## 「当日卡点」为什么对外版不显示',
        '日报末尾有一栏**当日卡点**（选填），写的是当天卡在哪、等谁、等什么数据。',
        '它天然是**内部协调事项** —— 说给 PM 和老板听，不是给客户看的进度描述。所以：',
        '',
        '- 对外版**不生成这一栏**（白名单生成，不是事后清洗），它不在脱敏的射程里，也就不会漏',
        '- 条目里的「阻塞」照旧：对外版保留，但措辞改成「待协调」',
        '- 它没有开关，也不需要开关 —— 因为它本来就不进对外版',
        '',
        '## 先明确一件事：这个网站只对内',
        '本系统**不向客户侧开放**（Kelvin 团队无账号、不可登录）。所以：',
        '',
        '- **两版文本在本系统里都对内部成员可见**，不存在「客户登录进来只能看一版」这回事',
        '- 区别不在「谁能看」，而在**「哪一版能发出去」**：内部版发给内部（群 / 内会 / 周会）',
        '- 对外版是**唯一可以直接发出公司的那一份**，所以它必须过脱敏 + 泄漏扫描',
        '',
        '## 对外版包含什么',
        '- **除「当日卡点」以外的全部内容都进对外版**：所有工作条目 + 明日工作任务',
        '- 内部链接（内网 / 淘宝订单 / localhost）在链接层面会被清洗掉，不写进对外版',
        '- 复制前系统再扫一遍自由文本（见下），扫到敏感信息就拦住不给复制',
        '',
        '## 外发审查（复制对外版之前必须过）',
        '对外版生成后系统自动扫描五类敏感信息，扫到即**禁止复制**并在文本框里标红：',
        '1. **金额**——¥、$、数字 + 元、金额、报价',
        '2. **工时**——工时、人天、加班、N 小时（日报不再采集工时，但描述里写了照样会扫到）',
        '3. **成本**——成本、单价、预算、计费',
        '4. **采购信息**——淘宝、订单号、供应商、发票、对公、退货',
        '5. **内部标识**——内部系统 / 代号 / 链接 / 仓库、内网、docs.internal',
        '',
        '> 卡点不生成、链接做清洗，都挡不住人在事项描述里随手写「实测 $14.67」——',
        '> 所以生成之后**必须再扫一遍自由文本**，两道缺一不可。',
        '> 扫到的修法：回填报页把描述里的金额 / 成本 / 内部链接改写掉。'
      ].join('\n') },
      { id:'kb8', spaceId:'sp-rule', parentId:null, type:'doc', title:'客户侧协作边界',
        author:'olivia', updatedAt:'2026-10-12T15:12', body:[
        '# 谁是我们的人，谁不是',
        '',
        '| | 内部成员 | 客户侧参与人 |',
        '|---|---|---|',
        '| 本系统账号 | 有（登录后按角色看） | **无 · 不可登录** |',
        '| 填日报 | 是，每工作日一条 | **否** |',
        '| 进提交率分母 | 是（老板 / PM 除外） | 否 |',
        '| 未交时被催办 | 是 | **绝不** |',
        '| 产出数据 | 内部产能数字 | 客户侧数据，PM 代录 |',
        '',
        '**客户侧参与人**：Kelvin 老师（客户 / 决策）、坤（可用性筛选 / 点位规划）、Tim 老师（渲染质量验收）。',
        '他们只出现在系统里作为**数据来源标注**，不是用户。',
        '',
        '> 这张表就是「谁能收到催办」的定义。名单里混进客户侧的人，',
        '> 系统就会在 18:30 给客户发「你还没交日报」——这是对外事故。',
        '> 系统层面已经堵死：客户侧没有账号，连登录页都进不来。'
      ].join('\n') },
      { id:'kb15', spaceId:'sp-rule', parentId:null, type:'doc', title:'权限与角色',
        author:'olivia', updatedAt:'2026-10-12T15:15', body:[
        '# 三级权限',
        '',
        '本系统**只对内部开放**。站内分三级身份：',
        '',
        '| 级别 | 角色 | 谁能对号入座 |',
        '|---|---|---|',
        '| 最高权限 | 老板 | Candice、柳迪 |',
        '| 最高权限 | PM | 王润佳（Olivia） |',
        '| 最高权限 | TA Leader | 宋天意（**同样交日报 / 每日任务**，只是还能管理） |',
        '| 内部成员 | TA | 王弋、罗思远、李宇尧、常吉祥、宏枢、孙世甲、刘一鸣 |',
        '| 内部成员 | 美术 | 与 TA **并列的独立角色**（默认能力相同，可各自配权限） |',
        '| 内部成员 | 实习生 | 安雅萱 |',
        '| — | 客户侧参与人 | Kelvin、坤、Tim（**无账号**） |',
        '',
        '## 页面按人一致，差别只在「能改什么」',
        'TA Leader、TA、美术、实习生 **看到的是同一套页面** —— 都能进日报填报、我的日报、每日任务、',
        '日报看板、未交名单、管理页。**不再用侧栏藏页面**，页面上也不写死角色名，',
        '一律问「角色与权限」矩阵：某项能力没勾，按钮就不出现/不可点。',
        '',
        '## 最高权限（老板 / PM / TA Leader）',
        '- 全部页面，含**未交名单与催办**',
        '- **口径配置**、成员与管线、工作日历',
        '- **客户侧数据代录**（坤 / Tim 回传的数字）',
        '- **角色与权限矩阵、催办话术、人员增删改角色**（设置 → 角色与权限 / 人员 / 看板与提醒）',
        '- **成本与支出可录入采购**（负责采买的人不是只读）',
        '- 知识库空间管理、重置演示数据',
        '',
        '## 内部成员（TA / 美术 / 实习生）',
        '- 与 TA Leader **同一套页面**；默认权限位全开（原型阶段按「所有人都可编辑」下发）',
        '- 只填**自己的**日报；一般只关注自己的提交状态',
        '- 知识库读写；产能 / 成本与支出可看，可录入采购',
        '',
        '## 交日报 / 交周报的边界',
        '**应提交 = 两个组的成员 + 实习生 + TA Leader，一共 8 人**：',
        '常吉祥、李宇尧、孙世甲、王弋、罗思远、刘一鸣、安雅萱、宋天意。',
        '老板与 PM **不交日报** —— 他们是流程的消费方，不进提交率分母、不被催办。',
        '宏枢老师也不交（采购条线由刘一鸣在自己的日报里代表提交）。',
        '',
        '> 说明：**应提交名单就是这 8 人** —— 每日 22:00 的未交统计、催办、周报截止都按这份名单算；',
        '> 名单外的人（老板 / PM / 宏枢老师）不会被催办，也不进提交率分母。',
        '> TA Leader 与大家同规则：未交一样会进未交名单、一样被催办。',
        '',
        '## 周报（见 [[doc:周报规则]]）',
        '- **要交周报的**：与要交日报的是同一批 8 人（截止周一 17:00）',
        '- **能发「本周工作任务」的**：只有 PM（周二周会后发布），发布后**所有人可见**',
        '- 老板 / PM：可查看、可催办，但不代填老师的周报'
      ].join('\n') },
      { id:'kb16', spaceId:'sp-rule', parentId:null, type:'doc', title:'周报规则',
        author:'olivia', updatedAt:'2026-10-12T16:10', body:[
        '# 周报：周一交结果，周二发任务',
        '',
        '日报是每天的动作，周报是每周的账 —— **两件事分开，时间点也不同**。',
        '',
        '## 两个时间点',
        '',
        '| 时间 | 谁做 | 做什么 |',
        '|---|---|---|',
        '| **周一 17:00 前** | 两个组成员 + 实习生 + TA Leader（8 人） | 交**上周任务结果** + 本周目标建议 + 风险 |',
        '| **周二周会之后** | **PM** | 发布**本周工作任务**，所有人可见 |',
        '',
        '> 周一 14:00 开始收料，17:00 是交的截止；周二开完内外两个会，PM 按会议结论定版本周任务。',
        '',
        '## 老师交什么（三栏）',
        '1. **上周任务结果** —— 做完了什么，带数字。这栏会被 PM 收进周会材料',
        '2. **本周目标建议**（1–3 条，按管线写）—— 这是给 PM 的**输入**，不是最终结论',
        '3. **风险 / 需支持** —— 需要老板或 PM 拍板的事写在这里，别静默',
        '',
        '## PM 交什么（一栏）',
        '**本周工作任务**：把各组的目标建议收拢、排优先级，在周二周会后发布，所有人都能看到。',
        '发布后老师可以在「我的周报」页看到自己的工作目标。',
        '',
        '## 和日报怎么对上',
        '- 上周每天日报里的「**明日工作任务**」，周一收拢起来就是各组交上来的本周目标建议',
        '- 周报**不带成本、不带卡点** —— 与对外版日报同口径，可以直接进周会 PPT',
        '',
        '## 硬规则',
        '1. 上周结果**写清数字**，不写「按计划推进」这类无信息量的话',
        '2. **周一 17:00 后交的视为逾期**，与日报的 22:00 截止是两套时点',
        '3. 本周任务发布后即锁定；要改就走 PM 更新，会记录更新人和时间',
        '4. 交周报的人 = 交日报的人（同一批 8 人）；只有老板 / PM 不交',
        '',
        '相关：[[doc:日报填写规则]] · [[doc:权限与角色]] · [[doc:两个组与分工]]'
      ].join('\n') },
      { id:'kb17', spaceId:'sp-meta', parentId:null, type:'doc', title:'两个组与分工',
        author:'olivia', updatedAt:'2026-10-12T16:12', body:[
        '# 两个组',
        '',
        '日报按组交、周会材料按组收。两个组**都由 TA Leader 宋天意统一管**。',
        '',
        '| 组 | 成员 | 主责条线 |',
        '|---|---|---|',
        '| **场景生成组** | 常吉祥 | Codex / AI 场景生成 |',
        '| | 李宇尧 | API + Harness 管线 |',
        '| | 孙世甲 | 渲染链路与 QC |',
        '| **3DGS 组** | 王弋 | 采集与重建 |',
        '| | 罗思远 | 采集 / 渲染农场 |',
        '| | 刘一鸣 | 渲染批次 **+ 资产采购**（接手宏枢老师） |',
        '| | 安雅萱（实习） | 样本整理与标注 |',
        '',
        '## 宏枢老师与刘一鸣：两个人，一条线',
        '宏枢老师负责**场景资产采购 / 查重 / 授权核对**，但**不单独交日报** ——',
        '采购条线由**刘一鸣在自己的日报里代表提交**（同一条日报里下挂采购条目）。',
        '',
        '> 结果就是：**未交名单里没有宏枢老师**，但采购的数字、金额、台账一条都不缺。',
        '',
        '## 客户侧不是我们的成员',
        'Kelvin、坤（可用性筛选 / 点位规划）、Tim（渲染质量验收）属于**客户侧**：',
        '不填日报、不进成员名单、不进未交名单、不催办，也**没有系统账号**。',
        '客户侧的数字由 **PM 代录**。详见 [[doc:客户侧协作边界]]。',
        '',
        '相关：[[doc:项目概览]] · [[doc:权限与角色]] · [[doc:周报规则]]'
      ].join('\n') },

      /* ---- 技术文档 ---- */
      { id:'kb9',  spaceId:'sp-tech', parentId:'kb-f1', type:'doc', title:'3DGS 重建参数与常见问题',
        author:'wang', updatedAt:'2026-10-09T16:10', body:[
        '# 3DGS 重建参数与常见问题',
        '',
        '## 当前批次参数',
        '- 采集重叠率要求 **≥ 70%**（外包验收标准，低于 55% 直接退回）',
        '- 纹理空洞多为重叠率不足导致，重跑前先补采点位',
        '- 命名规则：批次号 + 序号（如 B-087），渲染侧依赖这个命名',
        '',
        '## 常见问题',
        '- **纹理空洞** → 补采后重跑，不要只调参数',
        '- **重建失败清单** → 每周整理一次，累计数进产能链路',
        '- **上传 S3** → 质检通过才上传；上传完成数单独统计'
      ].join('\n') },
      { id:'kb10', spaceId:'sp-tech', parentId:'kb-f1', type:'doc', title:'API + Harness 使用说明',
        author:'li', updatedAt:'2026-10-08T19:05', body:[
        '# API + Harness 使用说明',
        '',
        '## 调度',
        '- 批量调度模块支持失败自动重试，最多 3 次',
        '- 并发写入冲突已修复（P1），单场景耗时由 26 分钟降至 18 分钟',
        '',
        '## 成本口径（写给要引用数字的人）',
        '- 单场景实测 **$14.67**，是「直接生产支出」的单位成本',
        '- 这个数字**只能进内部材料**，给 Kelvin 的汇报里不出现',
        '- 它不能与人力成本相加——两层成本口径，禁止混合',
        '',
        '## 沉淀',
        '- 已整理为工程插件并提 PR；单元测试覆盖核心调度路径'
      ].join('\n') },
      { id:'kb11', spaceId:'sp-tech', parentId:'kb-f1', type:'doc', title:'渲染批次与 QC',
        author:'sun', updatedAt:'2026-10-09T17:45', body:[
        '# 渲染批次与 QC',
        '',
        '## 流程',
        '1. 按客户确认点位生成渲染清单（批次号 R-xx）',
        '2. 参数预检 → 批次渲染 → 失败重跑 → QC',
        '3. QC 报告归档，通过率进产能链路',
        '',
        '## 验收口径',
        '- 客户侧验收由 Tim 老师执行，结果由 PM 代录',
        '- 显存溢出是当前主要失败原因，重跑前先降分辨率试一档',
        '',
        '## skill 化',
        '- 渲染链路正在沉淀为可复用 skill，目标是不依赖个人经验排参数'
      ].join('\n') },
      { id:'kb12', spaceId:'sp-tech', parentId:null, type:'doc', title:'场景资产采购与查重指引',
        author:'hongshu', updatedAt:'2026-10-07T11:20', body:[
        '# 场景资产采购与查重',
        '',
        '## 采购',
        '- 淘宝采购留订单截图与金额，台账按「项目 + 金额」归档',
        '- 金额以「分」为最小单位入库，避免浮点误差',
        '- 未开票的凭证金额记 0 占位，不删除记录',
        '',
        '## 查重',
        '- 入库前先与台账查重，重复资产标记并退回',
        '- 授权不全的资产走退货流程，台账保留记录',
        '',
        '## 与客户的关系',
        '- 采购金额**只进内部材料**；给 Kelvin 的汇报里只说「新增 N 套可用资产」',
        '- 「可用」的判定来自坤的筛选结果，属客户侧数据，由 PM 代录'
      ].join('\n') },
      { id:'kb-f1', spaceId:'sp-tech', parentId:null, type:'folder', title:'管线手册' },

      /* ---- 会议纪要 ---- */
      { id:'kb13', spaceId:'sp-min', parentId:null, type:'doc', title:'2026-10-06 周会纪要',
        author:'olivia', updatedAt:'2026-10-06T14:30', body:[
        '# 10.06 周会纪要（要点）',
        '',
        '## 决议',
        '- **除 PM / 工程安全外，不再每周产出 PPT**——注意限定语：PM 的周会 PPT 照做',
        '- 用一个持续维护的网站呈现进展，**不得放在第三方平台**（数据外流风险）',
        '',
        '## 数字口径',
        '- 现场被追问口径的数字：采集 133 / 已重建 63 / 台账 968 / 可用 600–700',
        '- 「有效场景」定义未拍板，列入待办',
        '',
        '## 待办',
        '- 周五更新 Google Sheet 进度块'
      ].join('\n') },
      { id:'kb14', spaceId:'sp-min', parentId:null, type:'doc', title:'2026-09-14 采集内部会议纪要',
        author:'olivia', updatedAt:'2026-09-14T16:00', body:[
        '# 1000 个 3DGS 场景采集 · 内部会议',
        '',
        '## 目标与拆解',
        '- 总量 1000 个场景，按采集 → 重建 → 可用筛选 → 点位 → 渲染分层推进',
        '- 外包采集按批次交付，每批验收标准：重叠率、覆盖率、命名规范',
        '',
        '## 分工',
        '- 采集与农场机器：罗老师',
        '- 重建与质检：王老师',
        '- 渲染链路：孙老师',
        '',
        '> 当时的分工表里没有考虑客户侧环节的边界，后续以「客户侧协作边界」为准。'
      ].join('\n') }
    ]
  };

  return {
    people, roles, groups, pipelines, projects, priorities, newsCats, config, calendar,
    remindTemplates,
    clientData, baseline, reports, weekReports, weekPlans, reminders, logs, kb, news, tasks,
    /* 工作台个性化：卡片顺序 / 折叠 / 隐藏（随 localStorage 一起存） */
    prefs: { dash: { order:null, collapsed:[], hidden:[] } },
    /* 数据结构版本号：与 localStorage 里存的 schemaVersion 不一致时，
       Store.load() 会丢弃旧缓存、按本种子重建 —— 防止升级后旧缓存撑不起新页面而白屏。
       **改了种子结构（增删字段 / 改字段含义）就 +1。** */
    schemaVersion: 12,
    /* ---- 登录页（原型）----
       静态原型没有短信网关，也没有接企业微信 / 微信开放平台：
       验证码固定为 demoSmsCode；微信二维码是本地绘制的占位图，扫码确认走「模拟扫码」。
       真接后端时只换 Store.sendCode / Store.loginByPhone / 二维码那三处，页面不用动。 */
    demoSmsCode:'8888',                    // 演示验证码（正式环境由短信下发）
    demoSmsMinutes:5,                      // 验证码有效期（分钟）
    demoLoginPicks:['olivia','candice','ta','wang'],   // 登录页「演示身份」快捷填入
    demoDate:'2026-10-09',                 // 演示基准日（最近工作日）
    /* 演示时钟：全站「现在」锚定到演示日的某个时刻，倒计时 / 提醒态才有意义。
       真实环境换成 new Date()；原型里保持可复现。 */
    demoNow:'2026-10-09T10:20',
    today:'2026-10-10'                     // 系统当前日
  };
})();
