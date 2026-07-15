/**
 * Region 分配 — 步骤生成器
 *
 * 动画展示 HBase Region 分配流程：
 * 建表后 HMaster 在 ZK 创建 region 节点，将 region 分配到某 RegionServer；
 * RegionServer 在 ZK 上报状态，region 状态转换 OFFLINE→OPENING→OPEN；
 * 负载均衡时重新分配。
 */
import type { Step, VisualElement, VariableState } from '../types'

/** Region 分配伪代码 */
export const TEMPLATE_CODE = `// HMaster 分配 Region
public void assign(RegionInfo region) {
    // 1. ZK 下创建 region 节点
    AssignmentManager am = master.getAssignmentManager();
    zkw.create("/regions/" + region.getEncodedName());
    // 2. 选定目标 RegionServer
    RegionServerNode rs = balancer.randomAssignment(region);
    am.plan = new RegionPlan(region, rs);
    // 3. 下发 OPEN 指令，状态 OFFLINE->OPENING
    rsServer.openRegion(region);
    // 4. RegionServer 在 ZK 上报状态 -> OPEN
    zkw.reportState(region, RegionState.State.OPEN);
}`

// 画布布局常量
const LAYOUT = {
  client: { x: 40, y: 220, w: 120, h: 60, label: 'Client' },
  master: { x: 230, y: 220, w: 160, h: 60, label: 'HMaster' },
  am: { x: 230, y: 100, w: 160, h: 50, label: 'AssignmentManager' },
  zk: { x: 460, y: 60, w: 150, h: 60, label: 'ZooKeeper' },
  rs1: { x: 660, y: 110, w: 150, h: 60, label: 'RS-1' },
  rs2: { x: 660, y: 210, w: 150, h: 60, label: 'RS-2' },
  rs3: { x: 660, y: 310, w: 150, h: 60, label: 'RS-3' },
  region: { x: 850, y: 220, w: 130, h: 60, label: 'Region' },
}

function makeElements(highlight?: string): VisualElement[] {
  const mk = (
    key: keyof typeof LAYOUT,
    type: string,
    state: string
  ): VisualElement => {
    const l = LAYOUT[key]
    return {
      id: key,
      type,
      label: l.label,
      x: l.x,
      y: l.y,
      width: l.w,
      height: l.h,
      state: key === highlight ? 'active' : state,
    }
  }
  return [
    mk('client', 'client', 'idle'),
    mk('master', 'master', 'idle'),
    mk('am', 'am', 'idle'),
    mk('zk', 'zk', 'idle'),
    mk('rs1', 'rs', 'idle'),
    mk('rs2', 'rs', 'idle'),
    mk('rs3', 'rs', 'idle'),
    mk('region', 'region', 'idle'),
  ]
}

export function generateSteps(): Step[] {
  const steps: Step[] = []
  let idx = 0

  const push = (
    desc: string,
    line: number,
    vars: VariableState[],
    elements: VisualElement[],
    arrows: { from: string; to: string; label?: string }[] = [],
    actionLabel?: string,
    statusText?: string
  ) => {
    steps.push({
      index: idx++,
      description: desc,
      currentLine: line,
      variables: vars,
      elements,
      connections: arrows.map((a, i) => ({
        id: `arrow-${i}`,
        fromId: a.from,
        toId: a.to,
        kind: 'arrow' as const,
        label: a.label,
      })),
      annotations: [],
      actionLabel,
      statusText: statusText ?? desc,
    })
  }

  // 步骤 0：拓扑总览
  push(
    '建表时 HMaster 通过 AssignmentManager 在 ZK 注册 region，并分配到 RegionServer 集群',
    0,
    [],
    makeElements(),
    [
      { from: 'master', to: 'am', label: '管理' },
      { from: 'am', to: 'zk', label: '注册' },
      { from: 'master', to: 'rs1', label: '分配' },
      { from: 'master', to: 'rs2', label: '分配' },
      { from: 'master', to: 'rs3', label: '分配' },
      { from: 'rs2', to: 'region', label: '托管' },
    ],
    'OVERVIEW',
    'Region 分配拓扑'
  )

  // 步骤 1：建表，region 初始 OFFLINE
  push(
    '建表：region 初始状态为 OFFLINE，尚未分配到任何 RegionServer',
    4,
    [
      { name: 'regionState', value: 'OFFLINE', line: 4, type: 'RegionState' },
      { name: 'region', value: 'tableA,reg1', line: 4, type: 'RegionInfo' },
    ],
    makeElements('master'),
    [{ from: 'master', to: 'region', label: '1.create' }],
    'CREATE',
    '建表 region=OFFLINE'
  )

  // 步骤 2：ZK 创建节点
  push(
    'HMaster 在 ZK /hbase/regions 下创建该 region 的节点（持久 znode）',
    6,
    [
      { name: 'zkPath', value: '/hbase/regions/xxx', line: 6, type: 'String' },
      { name: 'regionState', value: 'OFFLINE', line: 4 },
    ],
    makeElements('zk'),
    [{ from: 'am', to: 'zk', label: '2.create znode' }],
    'ZK',
    'ZK 创建 region 节点'
  )

  // 步骤 3：负载均衡选 RS
  push(
    'AssignmentManager 通过 balancer 选定负载最低的 RegionServer（本次选 RS-2）',
    8,
    [
      { name: 'assignedRS', value: 'RS-2', line: 8, type: 'RegionServer' },
      { name: 'rs1.load', value: '5 regions', line: 8 },
      { name: 'rs2.load', value: '3 regions (最低)', line: 8 },
      { name: 'rs3.load', value: '6 regions', line: 8 },
    ],
    makeElements('rs2'),
    [{ from: 'am', to: 'rs2', label: '3.randomAssignment' }],
    'BALANCE',
    '选定 RS-2'
  )

  // 步骤 4：下发 OPEN，状态 OPENING
  push(
    'HMaster 向 RS-2 下发 OPEN 指令，region 状态转为 OPENING',
    10,
    [
      { name: 'regionState', value: 'OPENING', line: 10, type: 'RegionState' },
      { name: 'assignedRS', value: 'RS-2', line: 8 },
    ],
    makeElements('rs2'),
    [{ from: 'master', to: 'rs2', label: '4.openRegion' }],
    'OPENING',
    '下发 OPEN，OPENING'
  )

  // 步骤 5：RS 上报状态 OPEN
  push(
    'RS-2 在 ZK 上报 region 状态为 OPEN，HMaster 收到通知完成分配',
    12,
    [
      { name: 'regionState', value: 'OPEN', line: 12, type: 'RegionState' },
      { name: 'zkPath', value: '/hbase/regions/xxx=OPEN', line: 12 },
    ],
    makeElements('rs2'),
    [
      { from: 'rs2', to: 'zk', label: '5.reportState' },
      { from: 'zk', to: 'master', label: 'watch' },
    ],
    'OPEN',
    '上报 OPEN'
  )

  // 步骤 6：分配完成
  push(
    '分配完成：region 托管在 RS-2，状态 OPEN，可接收读写请求',
    12,
    [
      { name: 'regionState', value: 'OPEN', line: 12, type: 'RegionState' },
      { name: 'assignedRS', value: 'RS-2', line: 8 },
    ],
    makeElements('region'),
    [{ from: 'rs2', to: 'region', label: '托管' }],
    'DONE',
    '分配完成 OPEN@RS-2'
  )

  // 步骤 7：负载均衡重分配
  push(
    '负载不均时 balancer 触发重新分配：将 region 从 RS-2 迁移到 RS-3，状态流转 SPLITTING→CLOSED→OPENING→OPEN',
    8,
    [
      { name: 'assignedRS', value: 'RS-2 → RS-3', line: 8, type: 'RegionServer' },
      { name: 'regionState', value: 'CLOSED→OPENING→OPEN', line: 10 },
    ],
    makeElements('rs3'),
    [{ from: 'master', to: 'rs3', label: '6.reassign' }],
    'REBALANCE',
    '负载均衡重分配'
  )

  return steps
}
