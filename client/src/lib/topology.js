// Layout for the network map: a top-down tree FortiGate -> core -> switches -> servers.
// Pure geometry (pixels in an unscaled canvas); the NetworkMap component draws it.

export const SIZE = {
  gatewayW: 240, gatewayH: 76,
  switchW: 236, switchH: 96,
  stackW: 252, chipH: 46, chipGap: 6, stackPadTop: 10, trunkX: 11, stackColGap: 20, chipIndent: 24,
  hGap: 28, vGap: 88, margin: 24,
};
export const MAX_SERVERS_PER_STACK = 8;

const stackHeight = (count) => SIZE.stackPadTop + count * SIZE.chipH + Math.max(0, count - 1) * SIZE.chipGap;

// Width of each subtree: a node is centred over its children, which sit side by side.
function measure(node) {
  if (!node.children.length) {
    node.span = node.w;
    return node.span;
  }
  const childrenW = node.children.reduce((sum, c) => sum + measure(c.node), 0) + SIZE.hGap * (node.children.length - 1);
  node.childrenW = childrenW;
  node.span = Math.max(node.w, childrenW);
  return node.span;
}

function place(node, left, top, depth = 0) {
  node.x = left + (node.span - node.w) / 2;
  node.y = top;
  node.depth = depth;
  let cx = left + (node.span - (node.childrenW ?? 0)) / 2;
  for (const { node: child } of node.children) {
    place(child, cx, top + node.h + SIZE.vGap, depth + 1);
    cx += child.span + SIZE.hGap;
  }
}

/** Orthogonal connector with rounded corners: down from the parent, along a bus, down to the child. */
function elbow(x1, y1, x2, y2, busY, radius = 10) {
  if (Math.abs(x1 - x2) < 0.5) return `M${x1},${y1} V${y2}`;
  const dir = x2 > x1 ? 1 : -1;
  const r = Math.min(radius, Math.abs(x2 - x1) / 2, busY - y1, y2 - busY);
  return `M${x1},${y1} V${busY - r} Q${x1},${busY} ${x1 + dir * r},${busY} H${x2 - dir * r} Q${x2},${busY} ${x2},${busY + r} V${y2}`;
}

/**
 * Build the map. Returns positioned nodes (gateway, switch, stack), connectors between them,
 * the detached-switch area, and the canvas size.
 */
export function buildTopology(network, idx, { showServers = true, maxStackRows = null, maxServersPerStack = MAX_SERVERS_PER_STACK } = {}) {
  const make = (id, type, w, h, extra) => ({ id, type, w, h, children: [], ...extra });
  // With maxStackRows, a long list of servers wraps into columns (wider, shorter) - for wide screens.
  const stackFor = (key, servers) => {
    const shown = servers.slice(0, maxServersPerStack);
    const more = servers.length - shown.length;
    const items = shown.length + (more ? 1 : 0);
    const cols = maxStackRows ? Math.max(1, Math.ceil(items / maxStackRows)) : 1;
    const rows = Math.ceil(items / cols);
    const w = cols * SIZE.stackW + (cols - 1) * SIZE.stackColGap;
    return make(`stack:${key}`, 'stack', w, stackHeight(rows), { servers: shown, more, switchId: key, cols, rows });
  };

  const root = make('gw', 'gateway', SIZE.gatewayW, SIZE.gatewayH, { gateway: network.gateway });
  const byId = new Map([['gw', root]]);

  // Switches in tree order (parents before children), hung under their uplink parent.
  for (const id of idx.treeOrder) {
    const sw = idx.switchById.get(id);
    const node = make(`sw:${id}`, 'switch', SIZE.switchW, SIZE.switchH, { sw });
    byId.set(node.id, node);
    const parent = sw.uplink.parent === network.gateway.id ? root : byId.get(`sw:${sw.uplink.parent}`);
    (parent ?? root).children.push({ node, link: idx.linkById.get(sw.uplink.linkId) ?? null });
  }

  // Each switch's servers form a stack directly beneath it (first child, so leaf switches stay aligned).
  if (showServers) {
    for (const id of idx.treeOrder) {
      const servers = idx.serversFor(id);
      if (servers.length) byId.get(`sw:${id}`).children.unshift({ node: stackFor(id, servers), link: null });
    }
    const direct = idx.serversFor(null);
    if (direct.length) root.children.push({ node: stackFor('direct', direct), link: null });
  }

  measure(root);
  place(root, SIZE.margin, SIZE.margin);

  // Switches the FortiGate cannot place in the tree (offline) go in a separate area on the right.
  const detached = network.switches.filter((s) => !s.role).map((sw) => {
    const node = make(`sw:${sw.id}`, 'switch', SIZE.switchW, SIZE.switchH, { sw, detached: true });
    const servers = showServers ? idx.serversFor(sw.id) : [];
    if (servers.length) node.children.push({ node: stackFor(sw.id, servers), link: null });
    measure(node);
    return node;
  });
  let detachedArea = null;
  if (detached.length) {
    const left = SIZE.margin + root.span + 64;
    const top = SIZE.margin + SIZE.gatewayH + SIZE.vGap;
    let x = left + 16;
    for (const node of detached) {
      place(node, x, top + 30, 1);
      x += node.span + SIZE.hGap;
    }
    detachedArea = { x: left, y: top, w: x - SIZE.hGap - left + 16, h: 0 };
  }

  // Flatten and connect.
  const nodes = [];
  const edges = []; // switch/FortiGate links
  const stackLines = []; // shared trunk from a switch down each column of its servers
  const serverLines = []; // per server: the short branch into its chip, plus a full path for the flow
  const parentOf = new Map();

  // Servers hang off a trunk: switch -> bus -> top of column 0 -> (along the top to column c) -> down -> into the chip.
  const connectStack = (sw, stack, x1, y1, busY) => {
    const colX = (c) => stack.x + c * (SIZE.stackW + SIZE.stackColGap);
    const trunkX = (c) => colX(c) + SIZE.trunkX;
    const rowY = (r) => stack.y + SIZE.stackPadTop + r * (SIZE.chipH + SIZE.chipGap) + SIZE.chipH / 2;
    const items = stack.servers.length + (stack.more ? 1 : 0);
    const lastRow = (c) => Math.min(stack.rows, items - c * stack.rows) - 1;
    const toTop = elbow(x1, y1, trunkX(0), stack.y, busY);

    let trunk = `${toTop} V${rowY(lastRow(0))}`;
    for (let c = 1; c < stack.cols; c++) trunk += ` M${trunkX(0)},${stack.y} H${trunkX(c)} V${rowY(lastRow(c))}`;
    stackLines.push({ id: `${stack.id}:trunk`, from: sw.id, stack: stack.id, macs: stack.servers.map((d) => d.mac), path: trunk });
    parentOf.set(stack.id, sw.id);

    for (let i = 0; i < items; i++) {
      const c = Math.floor(i / stack.rows);
      const r = i % stack.rows;
      const chipLeft = colX(c) + SIZE.chipIndent;
      const device = stack.servers[i] ?? null; // null = the "+N more" chip
      const id = device ? `srv:${device.mac}` : `${stack.id}:more`;
      serverLines.push({
        id,
        from: sw.id,
        stack: stack.id,
        device,
        tick: `M${trunkX(c)},${rowY(r)} H${chipLeft}`,
        flow: device ? `${toTop}${c > 0 ? ` H${trunkX(c)}` : ''} V${rowY(r)} H${chipLeft}` : null,
      });
      if (device) parentOf.set(id, sw.id);
    }
  };

  const walk = (node) => {
    nodes.push(node);
    for (const { node: child, link } of node.children) {
      const x1 = node.x + node.w / 2;
      const y1 = node.y + node.h;
      const busY = y1 + SIZE.vGap * 0.38;
      if (child.type === 'stack') {
        connectStack(node, child, x1, y1, busY);
        nodes.push(child);
        continue;
      }
      const x2 = child.x + child.w / 2;
      const y2 = child.y;
      edges.push({
        id: `${node.id}->${child.id}`,
        from: node.id,
        to: child.id,
        kind: 'uplink',
        link,
        path: elbow(x1, y1, x2, y2, busY),
        label: link ? { x: x2, y: busY + (y2 - busY) / 2 } : null,
      });
      parentOf.set(child.id, node.id);
      walk(child);
    }
  };
  walk(root);
  for (const node of detached) walk(node);

  const maxBottom = Math.max(...nodes.map((n) => n.y + n.h));
  const maxRight = Math.max(...nodes.map((n) => n.x + n.w), detachedArea ? detachedArea.x + detachedArea.w : 0);
  if (detachedArea) detachedArea.h = Math.max(...detached.flatMap((n) => [n, ...n.children.map((c) => c.node)]).map((n) => n.y + n.h)) - detachedArea.y + 16;

  // parentOf: node -> parent, for highlighting a node's path up to the FortiGate.
  return { nodes, edges, stackLines, serverLines, parentOf, detachedArea, width: maxRight + SIZE.margin, height: maxBottom + SIZE.margin };
}

/** Node ids from `id` up to the root (inclusive), or the empty set. */
export function pathToRoot(parentOf, id) {
  const path = new Set();
  let current = id;
  while (current && !path.has(current)) {
    path.add(current);
    current = parentOf.get(current);
  }
  return path;
}
