import { ImportRoad, PositionedFileHistory } from '../types/repository';
import { inferStackLayer, StackLayer } from './stack-layers';

export interface ArchitectureRuleEdge {
  from: string;
  to: string;
  count: number;
}

export interface ArchitectureRuleAnalysis {
  forbiddenEdgeMap: Map<string, number>;
  cyclicEdgeMap: Map<string, number>;
  forbiddenEdges: ArchitectureRuleEdge[];
  cycleEdges: ArchitectureRuleEdge[];
  cycleCount: number;
  cyclicNodeCount: number;
}

function edgeKey(from: string, to: string): string {
  return `${from}=>${to}`;
}

function layerRank(layer: StackLayer): number | null {
  if (layer === 'ui') {
    return 5;
  }
  if (layer === 'api') {
    return 4;
  }
  if (layer === 'domain') {
    return 3;
  }
  if (layer === 'data') {
    return 2;
  }
  if (layer === 'infra') {
    return 1;
  }

  return null;
}

export function analyzeArchitectureRules(
  files: PositionedFileHistory[],
  imports: ImportRoad[],
): ArchitectureRuleAnalysis {
  const fileSet = new Set(files.map((file) => file.path));
  const adjacency = new Map<string, string[]>();
  files.forEach((file) => {
    adjacency.set(file.path, []);
  });

  const forbiddenEdgeMap = new Map<string, number>();
  const normalizedEdges: Array<{ from: string; to: string; count: number }> = [];

  imports.forEach((road) => {
    if (!fileSet.has(road.from) || !fileSet.has(road.to)) {
      return;
    }

    adjacency.get(road.from)?.push(road.to);
    normalizedEdges.push({ from: road.from, to: road.to, count: road.count });

    const fromRank = layerRank(inferStackLayer(road.from));
    const toRank = layerRank(inferStackLayer(road.to));
    if (fromRank !== null && toRank !== null && fromRank < toRank) {
      const key = edgeKey(road.from, road.to);
      forbiddenEdgeMap.set(key, (forbiddenEdgeMap.get(key) ?? 0) + road.count);
    }
  });

  const sccs = tarjanScc(adjacency);
  const nodeToComponent = new Map<string, number>();
  sccs.forEach((component, index) => {
    component.forEach((node) => {
      nodeToComponent.set(node, index);
    });
  });

  const cyclicComponent = new Set<number>();
  let cyclicNodeCount = 0;
  sccs.forEach((component, index) => {
    if (component.length > 1) {
      cyclicComponent.add(index);
      cyclicNodeCount += component.length;
      return;
    }

    const node = component[0];
    if (!node) {
      return;
    }

    if ((adjacency.get(node) ?? []).includes(node)) {
      cyclicComponent.add(index);
      cyclicNodeCount += 1;
    }
  });

  const cyclicEdgeMap = new Map<string, number>();
  normalizedEdges.forEach((edge) => {
    const fromComponent = nodeToComponent.get(edge.from);
    const toComponent = nodeToComponent.get(edge.to);
    if (
      fromComponent === undefined ||
      toComponent === undefined ||
      fromComponent !== toComponent ||
      !cyclicComponent.has(fromComponent)
    ) {
      return;
    }

    const key = edgeKey(edge.from, edge.to);
    cyclicEdgeMap.set(key, (cyclicEdgeMap.get(key) ?? 0) + edge.count);
  });

  const forbiddenEdges = Array.from(forbiddenEdgeMap.entries())
    .map(([key, count]) => {
      const [from, to] = key.split('=>');
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 80);

  const cycleEdges = Array.from(cyclicEdgeMap.entries())
    .map(([key, count]) => {
      const [from, to] = key.split('=>');
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 120);

  return {
    forbiddenEdgeMap,
    cyclicEdgeMap,
    forbiddenEdges,
    cycleEdges,
    cycleCount: cyclicComponent.size,
    cyclicNodeCount,
  };
}

function tarjanScc(graph: Map<string, string[]>): string[][] {
  const result: string[][] = [];
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indexMap = new Map<string, number>();
  const lowMap = new Map<string, number>();
  let index = 0;

  const strongConnect = (node: string) => {
    indexMap.set(node, index);
    lowMap.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    const neighbors = graph.get(node) ?? [];
    neighbors.forEach((neighbor) => {
      if (!graph.has(neighbor)) {
        return;
      }

      if (!indexMap.has(neighbor)) {
        strongConnect(neighbor);
        lowMap.set(
          node,
          Math.min(lowMap.get(node) ?? Number.MAX_SAFE_INTEGER, lowMap.get(neighbor) ?? 0),
        );
        return;
      }

      if (onStack.has(neighbor)) {
        lowMap.set(
          node,
          Math.min(lowMap.get(node) ?? Number.MAX_SAFE_INTEGER, indexMap.get(neighbor) ?? 0),
        );
      }
    });

    if ((lowMap.get(node) ?? -1) !== (indexMap.get(node) ?? -2)) {
      return;
    }

    const component: string[] = [];
    while (stack.length > 0) {
      const item = stack.pop();
      if (!item) {
        break;
      }

      onStack.delete(item);
      component.push(item);
      if (item === node) {
        break;
      }
    }

    result.push(component);
  };

  Array.from(graph.keys()).forEach((node) => {
    if (!indexMap.has(node)) {
      strongConnect(node);
    }
  });

  return result;
}

