// Pencil Execute source. Evaluate after the shared design/pen-web-admin.js
// shell source. Append an explicit call in the same Execute payload.
//
//   Print(buildWildboyAdminGapFrames().map(({ key, route, name }) => ({ key, route, name })));
//   Print(insertWildboyAdminGapFrames()); // Desktop 14–26 and narrow 40–41.
// The default insertion covers slots 14–26. Pass explicit `keys` and `startIndex`
// to insert optional variants in checked free slots. The shell must insert
// `overlay`, if provided, as an absolute sibling of the workspace in one Insert.

function buildWildboyAdminGapFrames() {
  const pages = [];

  function add(key, route, title, state, content, overlay, size = {}) {
    const [heading, ...children] = content;
    const [pageTitle, ...actions] = heading.children;
    pages.push({
      key,
      route,
      name: `${pageTitle.content} · ${state}`,
      section: title,
      width: 1280,
      height: 800,
      ...size,
      children,
      actions,
      ...(overlay ? { overlay } : {}),
    });
  }

  const orderRoute = '/activity-orders';
  const order = 'AC202611140108';
  const refundOrder = 'AC202611140103';
  const orders = [
    ['龙门山周末徒步', order, '2', '¥238.00', '待支付', '查看订单'],
    ['龙门山周末徒步', 'AC202611140107', '1', '¥0.00', '免支付已确认', '查看订单'],
    ['龙门山周末徒步', 'AC202611140106', '3', '¥285.60', '已支付', '查看订单'],
    ['南坡往返徒步', 'AC202611140105', '2', '¥178.00', '已关闭', '查看订单'],
    ['南坡往返徒步', 'AC202611140104', '1', '¥89.00', '已退款', '查看订单'],
    ['龙门山周末徒步', refundOrder, '2', '¥190.40', '退款待审核', '查看订单'],
    ['青谷初冬穿越', 'AC202611140102', '4', '¥636.00', '退款处理中', '查看订单'],
    ['青谷初冬穿越', 'AC202611140101', '1', '¥159.00', '已支付', '查看订单'],
  ];
  const orderList = (filtered = false) => {
    const rows = filtered ? orders.filter(item => item[0] === orders[0][0]) : orders;
    return [
      gapHeading(filtered ? '收费活动名单' : '活动订单', [gapButton('刷新订单', 'secondary', 'refresh-cw')]),
      ...(filtered ? [gapRow('活动范围', [
        gapText('龙门山周末徒步', { weight: '600' }),
        gapText('待支付订单仅占用名额', { color: gapColor.muted, size: 13 }),
        gapButton('查看全部活动订单', 'text', 'arrow-left'),
      ])] : []),
      gapTable('活动订单', ['活动 / 订单号', '人数', '订单金额', '订单状态', '操作'], rows.map(
        ([activity, number, people, amount, status, action]) => [
          gapDouble(activity, number), gapAmount(people), gapAmount(amount), gapBadge(status, {
            待支付: 'attention', 已支付: 'positive', 免支付已确认: 'positive',
            退款待审核: 'attention', 退款处理中: 'attention',
          }[status] || 'neutral'), gapButton(action, 'text'),
        ],
      ), ['fill_container', 88, 128, 174, 144], { rowHeight: 48 }),
      gapPager(`第 1 页 · 当前 ${rows.length} 条`, false, !filtered),
      gapHint('金额为下单时的成交快照。待支付订单尚未确认报名。'),
    ];
  };
  const orderSummary = (number, status, amount, original = null) => gapPanel('订单摘要', [
    gapRow('订单标题', [gapText('龙门山周末徒步', { size: 18, weight: '680', grow: true }), gapBadge(status, 'attention')]),
    gapRow('交易摘要', [
      gapFact('订单编号', number), gapFact('参加人数', '2 人'),
      gapFact('成交金额', amount), ...(original ? [gapFact('优惠前金额', original)] : []),
    ], { gap: 16 }),
  ]);
  const people = gapPanel('关联参加者', [
    gapRow('参加者', [gapText('参加者', { weight: '650', grow: true }), gapButton('查看姓名电话', 'text', 'eye')]),
    gapText('林••   138****0000   ·   陈••   139****0000', { color: gapColor.muted }),
    gapText('用于活动履约。证件号码继续脱敏。', { size: 12, color: gapColor.muted }),
  ]);

  add('activity-orders-list', orderRoute, '活动订单', '全部订单', orderList());
  add('activity-orders-scoped', orderRoute, '活动订单', '指定活动名单', orderList(true));
  add('activity-orders-payment', orderRoute, '活动订单', '待支付详情', orderList(), gapModal('订单详情', [
    orderSummary(order, '待支付', '¥238.00'),
    gapText('微信交易号：尚无核验成功的支付回执', { color: gapColor.muted }),
    gapRow('按需资料', [gapButton('加载参加者', 'secondary'), gapButton('查看用户标识', 'text', 'eye')]),
    gapHint('查单发现已支付时保留名额；微信状态未确认时继续占用名额。'),
  ], [gapButton('关闭'), gapButton('关闭未付订单', 'danger-outline'), gapButton('核对支付状态', 'primary')], 760));
  add('activity-orders-refund', orderRoute, '活动订单', '退款审核', orderList(), gapModal('订单详情', [
    orderSummary(refundOrder, '退款待审核', '¥190.40', '¥238.00'), people,
    gapRow('退款标题', [gapText('退款申请', { size: 16, weight: '650', grow: true }), gapText('全额 ¥190.40', { weight: '650' })]),
    gapText('申请原因：出行时间调整', { color: gapColor.muted }),
    gapField('审核备注（拒绝时必填）', '说明拒绝原因或补充审核记录', { placeholder: true, height: 64 }),
    gapHint('批准后由微信处理；退款成功后才释放名额。'),
  ], [gapButton('关闭'), gapButton('拒绝退款', 'danger-outline'), gapButton('批准全额退款', 'primary')], 780));
  add('activity-orders-recovery', orderRoute, '活动订单', '退款异常待核对', orderList(), gapModal('订单详情', [
    orderSummary(refundOrder, '退款异常', '¥190.40', '¥238.00'),
    gapHint('微信返回退款异常。先核对原退款单；仍异常时联系微信支付。名额会继续保留。', 'attention'),
    gapRow('退款编号和状态', [gapFact('退款单号', 'AR202611140103'), gapFact('当前结果', '异常 · 待核对')]),
  ], [gapButton('关闭'), gapButton('重新加载退款资料', 'secondary'), gapButton('核对退款结果', 'primary')], 700));

  const memberRoute = '/memberships';
  const members = [
    ['林小野', 'u_demo_000018', '会员', '常行会员'],
    ['陈山', 'u_demo_000017', '领队', '—'],
    ['微信用户', 'u_demo_000016', '散客', '—'],
    ['苏南', 'u_demo_000015', '会员', '日行会员'],
    ['微信用户', 'u_demo_000014', '散客', '—'],
    ['姜雨', 'u_demo_000013', '会员', '远行会员 · 已停用'],
  ];
  const memberTabs = active => gapTabs(['会员等级', '用户业务身份'], active);
  const memberTiers = () => [
    gapHeading('会员管理', [gapButton('新建等级', 'primary', 'plus')]), memberTabs(0),
    gapTable('会员等级', ['等级名称', '排序', '状态', '活动优惠', '商品优惠', '操作'], [
      ['日行会员', '10', gapBadge('启用', 'positive'), '未启用', '9.5 折', gapButton('编辑等级', 'text')],
      ['常行会员', '20', gapBadge('启用', 'positive'), '8 折 · 每单最多 1 人', '每件立减 ¥10.00', gapButton('编辑等级', 'text')],
      ['远行会员', '30', gapBadge('停用'), '新订单不享受优惠', '新订单不享受优惠', gapButton('编辑等级', 'text')],
    ], ['fill_container', 88, 116, 204, 176, 112]),
    gapHint('活动和商品优惠分别设置。更新规则不影响历史订单成交金额。'),
  ];
  const memberUsers = () => [
    gapHeading('会员管理', [gapButton('刷新列表', 'secondary', 'refresh-cw')]), memberTabs(1),
    gapRow('身份筛选', [gapInput('昵称或完整用户 ID', { width: 248, icon: 'search', placeholder: true }),
      gapInput('全部身份', { width: 136, select: true }), gapButton('搜索', 'secondary')]),
    gapTable('业务身份', ['用户 / 完整 ID', '业务身份', '会员等级', '操作'], members.map(
      ([name, id, type, tier]) => [gapDouble(name, id), gapBadge(type, type === '会员' ? 'positive' : 'neutral'), tier, gapButton('编辑身份', 'text')],
    ), ['fill_container', 150, 250, 130], { rowHeight: 48 }),
    gapPager('第 1 页 · 共 6 位用户', false, false),
  ];
  add('memberships-tiers', memberRoute, '会员管理', '等级列表', memberTiers());
  add('memberships-users', memberRoute, '会员管理', '用户业务身份', memberUsers());
  add('memberships-tier-editor', memberRoute, '会员管理', '等级编辑', memberTiers(), gapModal('编辑会员等级', [
    gapRow('等级基本信息', [gapField('等级名称', '常行会员'), gapField('排序（0–10000）', '20', { width: 180 })], { alignItems: 'start' }),
    gapCheck('启用等级', true),
    gapRow('独立优惠规则', [
      gapPanel('活动优惠', [gapCheck('启用活动优惠', true),
        gapField('多人优惠范围 · 必选', '每单最多 1 个优惠名额', { select: true }),
        gapRow('活动折扣', [gapField('优惠方式', '打折', { select: true }), gapField('折扣（折）', '8', { width: 96 })], { gap: 8 }),
        gapText('按报名账号的会员等级计价。', { size: 12, color: gapColor.muted }),
      ]),
      gapPanel('商品优惠', [gapCheck('启用商品优惠', true),
        gapField('优惠方式', '减免金额', { select: true }),
        gapField('每件立减（元）', '10.00'),
        gapText('以商品现价为优惠前价格。', { size: 12, color: gapColor.muted }),
      ]),
    ], { alignItems: 'start' }),
    gapHint('停用等级后，新订单按优惠前价格计价。'),
  ], [gapButton('取消'), gapButton('保存等级', 'primary')], 860));
  add('memberships-user-editor', memberRoute, '会员管理', '分配业务身份', memberUsers(), gapModal('编辑用户身份', [
    gapDouble('林小野', '完整用户 ID  u_demo_000018'),
    gapField('业务身份', '会员', { select: true }),
    gapField('会员等级', '常行会员', { select: true }),
    gapHint('散客和领队不关联会员等级。设置为领队不会授予管理员权限。'),
  ], [gapButton('取消'), gapButton('保存身份', 'primary')], 540));

  const articleRoute = '/articles';
  const articles = [
    ['关于野小子户外俱乐部', '已发布', '野小子官方介绍', '查看文章'],
    ['龙门山周末徒步回顾', '已发布', '探索页文章', '查看文章'],
    ['初冬徒步装备清单', '草稿', '—', '编辑文章'],
    ['青谷活动路线手记', '草稿', '—', '编辑文章'],
  ];
  const articleList = () => [
    gapHeading('文章管理', [gapButton('刷新文章', 'secondary', 'refresh-cw'), gapButton('新建文章', 'primary', 'plus')]),
    gapTable('文章', ['标题', '状态', '公开入口', '操作'], articles.map(([title, state, target, action]) => [
      title, gapBadge(state, state === '已发布' ? 'positive' : 'neutral'), target, gapButton(action, 'text'),
    ]), ['fill_container', 140, 238, 132]),
    gapHint('只有已发布文章可以设为官方介绍。'),
  ];
  add('articles-list', articleRoute, '文章管理', '文章列表', articleList());
  add('articles-editor', articleRoute, '文章管理', '草稿编辑', articleList(), gapModal('编辑文章', [
    gapTabs(['基本资料', '图文正文'], 0),
    gapRow('文章标题和状态', [gapField('标题 · 必填', '初冬徒步装备清单'), gapBadge('草稿')], { alignItems: 'center' }),
    gapField('摘要', '从保暖分层到头灯，出发前逐项检查。', { height: 68 }),
    gapRow('封面和关联活动', [gapField('封面图片地址', '/assets/equipment.jpg'), gapField('关联活动（选填）', '不关联活动', { select: true })]),
    gapRow('封面操作', [gapButton('上传封面', 'secondary', 'upload'), gapText('HTTPS 或 /assets/ 图片地址', { size: 12, color: gapColor.muted })]),
    gapText('先保存文章信息和图文，再发布文章。', { size: 13, color: gapColor.muted }),
  ], [gapButton('关闭'), gapButton('发布文章', 'disabled'), gapButton('保存文章信息', 'primary')], 820));
  add('articles-content', articleRoute, '文章管理', '图文正文', articleList(), gapModal('编辑文章', [
    gapTabs(['基本资料', '图文正文'], 1),
    gapRow('添加图文块', [gapButton('添加文字', 'secondary', 'type'), gapButton('添加图片', 'secondary', 'image'), gapButton('添加表格', 'secondary', 'table')]),
    gapPanel('文字内容块', [
      gapRow('图文内容动作', [gapText('文字 · 出发前准备', { weight: '650', grow: true }), gapButton('编辑', 'text'), gapButton('下移', 'text'), gapButton('删除', 'danger-outline')]),
      gapText('请按路线长度、海拔与天气准备保暖层及照明用品。', { color: gapColor.muted }),
    ]),
    gapPanel('图片内容块', [
      gapRow('图片内容动作', [gapText('图片 · 装备示意', { weight: '650', grow: true }), gapButton('替换图片', 'text'), gapButton('上移', 'text'), gapButton('删除', 'danger-outline')]),
      gapText('/assets/equipment.jpg', { color: gapColor.muted }),
    ]),
  ], [gapButton('关闭'), gapButton('保存图文', 'primary')], 820));
  add('articles-official', articleRoute, '文章管理', '设置官方介绍确认', articleList(), gapModal('设为官方介绍？', [
    gapFact('所选文章', '龙门山周末徒步回顾'),
    gapText('探索页「野小子」入口将打开这篇文章。原官方介绍仍是已发布文章，会回到探索页文章轮播。', { grow: true }),
  ], [gapButton('取消'), gapButton('确认设为官方介绍', 'primary')], 560));
  add('articles-publish', articleRoute, '文章管理', '发布确认', articleList(), gapModal('发布文章？', [
    gapFact('所选文章', '初冬徒步装备清单'),
    gapText('发布后，这篇文章将在小程序探索页公开展示。', { grow: true }),
  ], [gapButton('取消'), gapButton('确认发布', 'primary')], 560));

  const settingsRoute = '/settings';
  const entries = [
    ['1', '本周活动', '已有页面', '本周活动'],
    ['2', '国内游行', '已有页面', '国内游行'],
    ['3', '联系我们', '弹窗', '弹窗文字；图片未设置'],
    ['4', '野小子', '文章页面', '当前官方介绍'],
  ];
  const settings = (index, issue = '', narrow = false) => {
    const [number, title, kind] = entries[index];
    const popup = kind === '弹窗';
    const sourceError = issue === 'source';
    const conflict = issue === 'conflict';
    const fieldHeight = narrow ? 44 : 36;
    const selector = gapPanel('首页入口', [
      gapText('首页入口', { size: 16, weight: '700' }),
      ...entries.map(([slot, label, type, dest], i) => gapRow(`入口 ${slot}`, [
        gapIcon(['calendar', 'mountain', 'qr-code', 'book-open'][i], 17),
        gapColumn('入口摘要', [
          gapText(`${slot}  ${label}`, { weight: i === index ? '700' : '500' }),
          gapText(`${type} · ${dest}`, { size: 12, color: gapColor.muted }),
        ], { gap: 2 }),
        gapIcon('chevron-right', 15),
      ], { fill: i === index ? gapColor.soft : gapColor.surface, padding: [6, 9], cornerRadius: 8, height: narrow ? 46 : 54 })),
    ], { width: narrow ? 'fill_container' : 288, gap: 4 });
    const fields = gapPanel(`编辑入口 ${number}`, [
      gapText(`入口 ${number} · ${title}`, { size: 18, weight: '700' }),
      gapRow('入口字段', [gapField('名称', title, { height: fieldHeight }), gapField('图标', ['本周山野', '远行山野', '二维码', '野小子'][index], { select: true, height: fieldHeight })]),
      gapRow('类型与目标', [gapField('类型', kind, { select: true, height: fieldHeight }), popup
        ? gapField('弹窗标题（选填）', '联系我们', { height: fieldHeight })
        : gapField(kind === '文章页面' ? '文章' : '目标页面', entries[index][3], { select: true, height: fieldHeight })]),
      ...(popup ? [gapField('弹窗文字', '活动咨询请与组织方联系。', { height: 70 }),
        gapField('二维码 / 图片地址（选填）', 'HTTPS 或 /assets/ 图片地址', { placeholder: true }),
        gapRow('图片上传', [gapButton('上传图片', 'secondary', 'upload'), gapText('当前未设置图片', { size: 13, color: gapColor.muted })]),
      ] : []),
      ...(sourceError ? [gapHint('文章选项加载失败。重试后核对文章是否可用。', 'attention'), gapRow('文章来源恢复', [gapButton('重试文章选项', 'secondary')])] : []),
    ]);
    return [gapHeading('基础配置', narrow ? [] : [gapButton('重新加载配置', 'secondary', 'refresh-cw'), gapButton('保存首页配置', conflict ? 'disabled' : 'primary')]),
      ...(conflict ? [gapHint('配置版本或文章状态已变化。当前输入已保留，请重新加载并核对后再保存。', 'attention')] : []),
      narrow ? gapColumn('四入口配置', [selector, fields], { gap: 10 }) : gapRow('四入口配置', [selector, fields], { alignItems: 'start', gap: 16 }),
      gapHint('四个入口使用同一份草稿。保存后在小程序下次刷新首页时生效。'),
      ...(narrow ? [gapRow('配置操作', [gapButton('重新加载', 'secondary', 'refresh-cw', 44), gapButton('保存首页配置', 'primary', null, 44)], { justifyContent: 'space_between' })] : []),
    ];
  };
  add('settings-overview', settingsRoute, '基础配置', '四入口与目标页', settings(0));
  add('settings-popup', settingsRoute, '基础配置', '弹窗内容配置', settings(2));
  add('settings-recovery', settingsRoute, '基础配置', '版本冲突恢复', settings(0, 'conflict'));
  add('settings-article-source', settingsRoute, '基础配置', '文章来源重试', settings(3, 'source'));
  add('settings-narrow', settingsRoute, '基础配置', '窄屏', settings(0, '', true), null, { width: 390, height: 844 });
  add('activity-orders-narrow', orderRoute, '活动订单', '窄屏', [
    gapHeading('活动订单', [gapButton('刷新', 'secondary', 'refresh-cw', 44)]),
    gapColumn('活动订单窄屏列表', orders.slice(0, 4).map(([activity, number, count, amount, status]) => gapPanel(`订单 / ${number}`, [
      gapRow('活动与状态', [gapText(activity, { weight: '700', grow: true }), gapBadge(status, status === '待支付' ? 'attention' : 'neutral')]),
      gapText(number, { size: 12, color: gapColor.muted }),
      gapRow('订单金额与详情', [gapText(`${count} 人 · ${amount}`, { weight: '600', grow: true }), gapButton('查看订单', 'secondary', null, 44)], { gap: 6 }),
    ], { gap: 3, padding: [8, 10] })), { gap: 8 }),
    gapRow('订单分页', [gapText('第 1 页', { size: 12, color: gapColor.muted, grow: true }), gapButton('上一页', 'disabled', null, 44), gapButton('下一页', 'secondary', null, 44)]),
    gapHint('待支付订单尚未确认报名。'),
  ], null, { width: 390, height: 844 });

  return pages;
}

const gapColor = {
  ...wb,
  white: '#FFFFFF', yellowBg: '#F7EDD6', yellowText: '#6D4B18',
};

function gapText(content, { size = 14, weight = '400', color = gapColor.ink, grow = false, name = '文字' } = {}) {
  return {
    ...wbText(content, size, color, weight), name,
    ...(grow ? { width: 'fill_container', textGrowth: 'fixed-width', lineHeight: 1.5 } : {}),
  };
}

function gapIcon(icon, size = 16, fill = gapColor.primary) {
  return { ...wbIcon(icon, fill, size), name: `图标 / ${icon}` };
}

function gapRow(name, children, props = {}) {
  return wbRow(children, { name, width: 'fill_container', ...props });
}

function gapColumn(name, children, props = {}) {
  return wbStack(children, { name, width: 'fill_container', gap: 8, ...props });
}

function gapButton(label, kind = 'secondary', icon, height = 36) {
  const variant = {
    primary: { fill: gapColor.primary, color: gapColor.white },
    secondary: { fill: gapColor.surface, color: gapColor.primary, stroke: gapColor.line },
    selected: { fill: gapColor.soft, color: gapColor.primary },
    disabled: { fill: gapColor.soft, color: gapColor.muted },
    text: { color: gapColor.primary },
    'danger-outline': { fill: gapColor.dangerBg, color: gapColor.danger },
  }[kind];
  return gapRow(`按钮 / ${label}`, [
    ...(icon ? [gapIcon(icon, 16, variant.color)] : []),
    gapText(label, { size: 13, weight: '600', color: variant.color }),
  ], {
    width: 'fit_content', height, padding: [0, kind === 'text' ? 6 : 12], cornerRadius: 8,
    justifyContent: 'center', ...(variant.fill ? { fill: variant.fill } : {}),
    ...(variant.stroke ? { stroke: variant.stroke, strokeWidth: 1 } : {}),
  });
}

function gapInput(value, { width = 'fill_container', height = 36, select = false, icon, placeholder = false } = {}) {
  return gapRow(`输入 / ${value}`, [
    ...(icon ? [gapIcon(icon, 16, gapColor.muted)] : []),
    gapText(value, { color: placeholder ? gapColor.muted : gapColor.ink, grow: true }),
    ...(select ? [gapIcon('chevron-down', 16)] : []),
  ], {
    width, height, padding: [8, 10], alignItems: height <= 44 ? 'center' : 'start',
    cornerRadius: 8, fill: gapColor.surface, stroke: gapColor.line, strokeWidth: 1,
  });
}

function gapField(label, value, { width = 'fill_container', ...options } = {}) {
  return gapColumn(`字段 / ${label}`, [gapText(label, { size: 13, weight: '600' }), gapInput(value, options)], { width, gap: 5 });
}

function gapCheck(label, checked = false) {
  return gapRow(`复选框 / ${label}`, [gapIcon(checked ? 'square-check' : 'square', 18), gapText(label)], { height: 26 });
}

function gapHeading(title, actions = []) {
  return gapRow('页面标题与操作', [gapText(title, { name: '页面标题', size: 24, weight: '700', grow: true }), ...actions], { height: 40 });
}

function gapTabs(labels, active) {
  return gapRow('页签', labels.map((label, i) => gapButton(label, i === active ? 'selected' : 'text')), { gap: 4 });
}

function gapBadge(label, tone = 'neutral') {
  const color = tone === 'attention' ? gapColor.yellowText : tone === 'positive' ? gapColor.primary : gapColor.muted;
  const fill = tone === 'attention' ? gapColor.yellowBg : tone === 'positive' ? gapColor.soft : gapColor.bg;
  return gapRow(`状态 / ${label}`, [gapText(label, { size: 12, weight: '600', color })], {
    width: 'fit_content', height: 24, padding: [0, 8], cornerRadius: 6, fill,
  });
}

function gapDouble(first, second) {
  return gapColumn(`两行 / ${first}`, [gapText(first, { weight: '600', grow: true }), gapText(second, { size: 12, color: gapColor.muted, grow: true })], { gap: 1 });
}

function gapFact(label, value) {
  return gapColumn(`摘要 / ${label}`, [gapText(label, { size: 12, color: gapColor.muted }), gapText(value, { weight: '600', grow: true })], { gap: 3 });
}

function gapAmount(value) {
  return gapRow('数字列', [gapText(value, { weight: '600' })], { justifyContent: 'end' });
}

function gapTable(name, headings, rows, widths, { rowHeight = 44 } = {}) {
  function cell(item, width, head, index) {
    return gapRow(`单元格 / ${headings[index]}`, [typeof item === 'string'
      ? gapText(item, { size: head ? 12 : 14, color: head ? gapColor.muted : gapColor.ink, weight: head ? '600' : '400', grow: true })
      : item], { width, height: 'fill_container', padding: [0, 12] });
  }
  return gapColumn(`数据表 / ${name}`, [
    gapRow('表头', headings.map((item, i) => cell(item, widths[i], true, i)), { height: 40, gap: 0, fill: gapColor.soft }),
    ...rows.map((row, rowIndex) => gapRow(`数据行 ${rowIndex + 1}`, row.map((item, i) => cell(item, widths[i], false, i)), {
      height: rowHeight, gap: 0, fill: gapColor.surface, stroke: gapColor.line, strokeWidth: { top: 1 },
    })),
  ], { gap: 0, clip: true, cornerRadius: 8, stroke: gapColor.line, strokeWidth: 1 });
}

function gapPager(summary, prev, next) {
  return gapRow('分页', [gapText(summary, { size: 12, color: gapColor.muted, grow: true }), gapButton('上一页', prev ? 'secondary' : 'disabled'), gapButton('下一页', next ? 'secondary' : 'disabled')]);
}

function gapHint(message, tone = 'neutral') {
  const attention = tone === 'attention';
  return gapRow('操作提示', [
    gapIcon(attention ? 'circle-alert' : 'info', 16, attention ? gapColor.yellowText : gapColor.primary),
    gapText(message, { size: 13, color: attention ? gapColor.yellowText : gapColor.muted, grow: true }),
  ], { fill: attention ? gapColor.yellowBg : gapColor.soft, cornerRadius: 8, padding: [9, 11], alignItems: 'center' });
}

function gapPanel(name, content, props) {
  return gapColumn(`面板 / ${name}`, content, { padding: 14, gap: 10, cornerRadius: 10, fill: gapColor.surface, stroke: gapColor.line, strokeWidth: 1, ...props });
}

function gapModal(title, content, actions, width) {
  return gapColumn('弹层遮罩', [gapColumn(`弹层 / ${title}`, [
    gapRow('弹层标题', [gapText(title, { size: 20, weight: '700', grow: true }), gapRow('关闭弹层', [gapIcon('x', 18)], { width: 34, height: 34, justifyContent: 'center' })]),
    ...content,
    gapRow('弹层底部操作', actions, { justifyContent: 'end', padding: [12, 0, 0, 0], stroke: gapColor.line, strokeWidth: { top: 1 } }),
  ], { width, gap: 12, padding: 20, cornerRadius: 12, fill: gapColor.surface })], {
    layoutPosition: 'absolute', x: 0, y: 0, width: 1280, height: 800,
    justifyContent: 'center', alignItems: 'center', fill: '#11291F80',
  });
}

function insertWildboyAdminGapFrames({ keys, startIndex = 14 } = {}) {
  if (!Number.isInteger(startIndex) || startIndex < 0) throw new Error('Specify a free starting slot.');
  const built = buildWildboyAdminGapFrames();
  const defaultKeys = [
    'activity-orders-list', 'activity-orders-payment', 'activity-orders-refund',
    'memberships-tiers', 'memberships-users', 'memberships-tier-editor', 'memberships-user-editor',
    'articles-list', 'articles-editor', 'articles-official',
    'settings-overview', 'settings-popup', 'settings-recovery',
    'settings-narrow', 'activity-orders-narrow',
  ];
  const selected = (keys || defaultKeys).map(key => {
    const frame = built.find(item => item.key === key);
    if (!frame) throw new Error(`Unknown frame key: ${key}`);
    return frame;
  });
  if (new Set(selected.map(frame => frame.key)).size !== selected.length) throw new Error('Frame keys must be unique.');
  const existingNames = new Set(Get((node, context) => {
    context.skipChildren();
    return node.name;
  }));
  const duplicates = selected.filter(frame => existingNames.has(`Web / ${frame.name}`));
  if (duplicates.length) throw new Error(`The following frames already exist: ${duplicates.map(frame => frame.name).join(', ')}`);
  return selected.map(({ key, ...frame }, offset) => {
    const index = !keys && offset >= 13 ? 40 + offset - 13 : startIndex + offset;
    return { key, route: frame.route, name: `Web / ${frame.name}`, id: wbScreen({ ...frame, index }), index };
  });
}

