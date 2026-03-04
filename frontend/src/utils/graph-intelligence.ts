import { ImportRoad, PositionedFileHistory } from '../types/repository';
import { analyzeArchitectureRules } from './architecture-rules';

export interface GraphHub {
  path: string;
  score: number;
  incoming: number;
  outgoing: number;
}

export interface GraphIntelligence {
  nodeCount: number;
  edgeCount: number;
  density: number;
  cycleCount: number;
  cyclicNodeCount: number;
  layerViolationCount: number;
  forbiddenEdges: Array<{ from: string; to: string; count: number }>;
  cycleEdges: Array<{ from: string; to: string; count: number }>;
  hubs: GraphHub[];
}

export function analyzeGraphIntelligence(
  files: PositionedFileHistory[],
  imports: ImportRoad[],
): GraphIntelligence {
  if (files.length === 0) {
    return {
      nodeCount: 0,
      edgeCount: 0,
      density: 0,
      cycleCount: 0,
      cyclicNodeCount: 0,
      layerViolationCount: 0,
      forbiddenEdges: [],
      cycleEdges: [],
      hubs: [],
    };
  }

  const fileSet = new Set(files.map((file) => file.path));
  const adjacency = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  const weighted = new Map<string, number>();

  files.forEach((file) => {
    adjacency.set(file.path, []);
    incoming.set(file.path, 0);
    outgoing.set(file.path, 0);
    weighted.set(file.path, 0);
  });

  let edgeCount = 0;
  const ruleAnalysis = analyzeArchitectureRules(files, imports);
  const layerViolationCount = Array.from(ruleAnalysis.forbiddenEdgeMap.values()).reduce(
    (sum, count) => sum + count,
    0,
  );

  imports.forEach((road) => {
    if (!fileSet.has(road.from) || !fileSet.has(road.to)) {
      return;
    }

    adjacency.get(road.from)?.push(road.to);
    edgeCount += 1;

    outgoing.set(road.from, (outgoing.get(road.from) ?? 0) + road.count);
    incoming.set(road.to, (incoming.get(road.to) ?? 0) + road.count);
    weighted.set(road.from, (weighted.get(road.from) ?? 0) + road.count * 0.9);
    weighted.set(road.to, (weighted.get(road.to) ?? 0) + road.count * 1.1);

  });

  const hubs: GraphHub[] = files
    .map((file) => ({
      path: file.path,
      score: weighted.get(file.path) ?? 0,
      incoming: incoming.get(file.path) ?? 0,
      outgoing: outgoing.get(file.path) ?? 0,
    }))
    .filter((hub) => hub.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const nodeCount = files.length;
  const maxEdges = Math.max(1, nodeCount * (nodeCount - 1));
  const density = Math.min(1, edgeCount / maxEdges);

  return {
    nodeCount,
    edgeCount,
    density,
    cycleCount: ruleAnalysis.cycleCount,
    cyclicNodeCount: ruleAnalysis.cyclicNodeCount,
    layerViolationCount,
    forbiddenEdges: ruleAnalysis.forbiddenEdges,
    cycleEdges: ruleAnalysis.cycleEdges,
    hubs,
  };
}
