/// <reference lib="webworker" />
// Web Worker for running dagre layout off the main thread
// Receives nodes+edges+config, returns positioned nodes.

import dagre from 'dagre';

type NodeData = {
  label: string;
  items?: any[];
  allItems?: any[];
  isExpanded?: boolean;
  isArray?: boolean;
  nodeId?: string;
};

type FlowNode = {
  id: string;
  data: NodeData;
  position: { x: number; y: number };
};

type Edge = { id: string; source: string; target: string };

type LayoutConfig = {
  NODE_WIDTH: number;
  MAX_DISPLAY_ITEMS: number;
  METRICS: {
    NODE_PADDING_Y: number;
    NODE_BORDER_Y: number;
    HEADER_HEIGHT: number;
    ITEMS_TOP_MARGIN: number;
    ITEM_ROW_HEIGHT: number;
    MORE_BUTTON_HEIGHT: number;
  };
  DAGRE: {
    RANK_DIR: 'LR' | 'TB' | 'BT' | 'RL';
    NODE_SEP: number;
    RANK_SEP: number;
    EDGE_SEP: number;
    RANKER: 'network-simplex' | 'tight-tree' | 'longest-path';
    ALIGN: 'UL' | 'UR' | 'DL' | 'DR' | undefined;
    MARGIN_X: number;
    MARGIN_Y: number;
  };
  OVERLAP: {
    MIN_SPACING: number;
    X_TOLERANCE: number;
  };
};

type LayoutRequest = {
  type: 'layout';
  nodes: FlowNode[];
  edges: Edge[];
  measuredHeights: Array<[string, number]>; // entries of Map
  showAllItemsNodeIds: string[];
  config: LayoutConfig;
};

type ProgressMsg = { type: 'progress'; phase: 'build' | 'layout'; progress: number };
type DoneMsg = { type: 'done'; nodes: FlowNode[] };
type WorkerMsg = ProgressMsg | DoneMsg;

const ctx: any = self;

function estimateDisplayItemCount(node: FlowNode, cfg: LayoutConfig, showAll: boolean): number {
  if (!node.data?.isExpanded) return 0;
  const total = node.data.items?.length ?? 0;
  if (showAll) return total;
  return Math.min(total, cfg.MAX_DISPLAY_ITEMS);
}

function hasMoreButton(node: FlowNode, cfg: LayoutConfig, showAll: boolean): boolean {
  if (!node.data?.isExpanded) return false;
  const total = node.data.items?.length ?? 0;
  return total > cfg.MAX_DISPLAY_ITEMS && !showAll;
}

function estimateNodeHeight(node: FlowNode, cfg: LayoutConfig, showAll: boolean): number {
  const M = cfg.METRICS;
  let h = M.NODE_PADDING_Y + M.NODE_BORDER_Y + M.HEADER_HEIGHT;
  if (node.data?.isExpanded) {
    const count = estimateDisplayItemCount(node, cfg, showAll);
    const extraBtn = hasMoreButton(node, cfg, showAll) ? M.MORE_BUTTON_HEIGHT : 0;
    h += M.ITEMS_TOP_MARGIN + count * M.ITEM_ROW_HEIGHT + extraBtn;
  }
  return Math.max(h, 32);
}

ctx.onmessage = (ev: MessageEvent<LayoutRequest>) => {
  const msg = ev.data;
  if (msg.type !== 'layout') return;

  const { nodes, edges, measuredHeights, showAllItemsNodeIds, config } = msg;

  const measuredMap = new Map<string, number>(measuredHeights);
  const showAllSet = new Set(showAllItemsNodeIds);

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));

  graph.setGraph({
    rankdir: config.DAGRE.RANK_DIR,
    nodesep: config.DAGRE.NODE_SEP,
    ranksep: config.DAGRE.RANK_SEP,
    edgesep: config.DAGRE.EDGE_SEP,
    ranker: config.DAGRE.RANKER,
    align: config.DAGRE.ALIGN,
    marginx: config.DAGRE.MARGIN_X,
    marginy: config.DAGRE.MARGIN_Y
  });

  const total = nodes.length;
  let processed = 0;
  const report = (phase: 'build' | 'layout', p: number) => {
    ctx.postMessage({ type: 'progress', phase, progress: p } as ProgressMsg);
  };

  // Build nodes
  for (const n of nodes) {
    const measured = measuredMap.get(n.id);
    const showAll = showAllSet.has(n.id);
    const height = measured ?? estimateNodeHeight(n, config, showAll);
    graph.setNode(n.id, { width: config.NODE_WIDTH, height });
    processed++;
    if (processed % 200 === 0) report('build', Math.min(0.9, processed / Math.max(1, total)));
  }
  // Build edges
  for (const e of edges) {
    graph.setEdge(e.source, e.target);
  }
  report('build', 1);

  // Run layout
  report('layout', 0);
  dagre.layout(graph);
  report('layout', 1);

  // Map positions back
  const result: FlowNode[] = nodes.map((node) => {
    const g = graph.node(node.id) as dagre.Node;
    const positioned: FlowNode = {
      ...node,
      position: { x: g.x, y: g.y }
    };
    return positioned;
  });

  // Column overlap adjustment
  const nodesByColumn = new Map<number, Array<{ node: FlowNode; g: dagre.Node }>>();
  for (const node of result) {
    const g = graph.node(node.id) as dagre.Node;
    if (!g) continue;
    let foundKey: number | null = null;
    for (const key of nodesByColumn.keys()) {
      if (Math.abs(g.x - key) <= config.OVERLAP.X_TOLERANCE) {
        foundKey = key;
        break;
      }
    }
    if (foundKey !== null) nodesByColumn.get(foundKey)!.push({ node, g });
    else nodesByColumn.set(g.x, [{ node, g }]);
  }

  nodesByColumn.forEach((nodesInColumn) => {
    if (nodesInColumn.length > 1) {
      nodesInColumn.sort((a, b) => a.node.position.y - b.node.position.y);
      for (let i = 1; i < nodesInColumn.length; i++) {
        const prev = nodesInColumn[i - 1];
        const curr = nodesInColumn[i];
        const prevBottom = prev.node.position.y + prev.g.height / 2;
        const currTop = curr.node.position.y - curr.g.height / 2;
        const minSpacing = config.OVERLAP.MIN_SPACING;
        if (currTop < prevBottom + minSpacing) {
          const adj = prevBottom + minSpacing - currTop;
          curr.node.position.y += adj;
          for (let j = i + 1; j < nodesInColumn.length; j++) nodesInColumn[j].node.position.y += adj;
        }
      }
    }
  });

  ctx.postMessage({ type: 'done', nodes: result } as DoneMsg);
};

export {};

