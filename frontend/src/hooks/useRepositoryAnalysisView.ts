import { useMemo } from 'react';
import { RepositoryResult } from '../types/repository';
import {
  deriveBranchSignals,
  extractBranchNamesFromMessage,
  fileMatchesBranch,
} from '../utils/branches';
import { analyzeRepositoryInsights } from '../utils/insights';
import { getLanguageFromPath } from '../utils/language';
import { buildFileRiskMap, riskBand } from '../utils/risk';
import { buildSnapshot } from '../utils/snapshot';

function topDistrict(folder: string): string {
  if (!folder || folder === 'root') {
    return 'root';
  }

  return folder.split('/')[0] ?? 'root';
}

interface UseRepositoryAnalysisViewParams {
  data: RepositoryResult | null;
  timelineTs: number | null;
  compareTs: number | null;
  compareEnabled: boolean;
  selectedPath: string | null;
  languageFilter: string;
  authorFilter: string;
  districtFilter: string;
  branchFilter: string;
  branchOnlyMode: boolean;
  riskFilter: 'all' | 'low' | 'medium' | 'high';
  pathFilter: string;
}

export function useRepositoryAnalysisView({
  data,
  timelineTs,
  compareTs,
  compareEnabled,
  selectedPath,
  languageFilter,
  authorFilter,
  districtFilter,
  branchFilter,
  branchOnlyMode,
  riskFilter,
  pathFilter,
}: UseRepositoryAnalysisViewParams) {
  const timelineData = useMemo(() => buildSnapshot(data, timelineTs), [data, timelineTs]);

  const compareData = useMemo(() => {
    if (!compareEnabled) {
      return null;
    }

    return buildSnapshot(data, compareTs);
  }, [compareEnabled, compareTs, data]);

  const riskProfiles = useMemo(
    () => buildFileRiskMap(timelineData?.files ?? [], timelineTs ?? undefined),
    [timelineData, timelineTs],
  );

  const compareRiskProfiles = useMemo(
    () =>
      buildFileRiskMap(
        compareData?.files ?? [],
        compareTs ?? timelineTs ?? undefined,
      ),
    [compareData, compareTs, timelineTs],
  );

  const languageOptions = useMemo(() => {
    if (!timelineData) {
      return [];
    }

    const count = new Map<string, number>();
    timelineData.files.forEach((file) => {
      const language = getLanguageFromPath(file.path);
      count.set(language, (count.get(language) ?? 0) + 1);
    });

    return Array.from(count.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name)
      .slice(0, 20);
  }, [timelineData]);

  const authorOptions = useMemo(() => {
    if (!timelineData) {
      return [];
    }

    const count = new Map<string, number>();
    timelineData.files.forEach((file) => {
      file.commits.forEach((commit) => {
        count.set(commit.author, (count.get(commit.author) ?? 0) + 1);
      });
    });

    return Array.from(count.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name)
      .slice(0, 40);
  }, [timelineData]);

  const districtOptions = useMemo(() => {
    if (!timelineData) {
      return [];
    }

    const count = new Map<string, number>();
    timelineData.files.forEach((file) => {
      const district = topDistrict(file.folder);
      count.set(district, (count.get(district) ?? 0) + 1);
    });

    return Array.from(count.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name)
      .slice(0, 24);
  }, [timelineData]);

  const branchOptions = useMemo(() => {
    if (!timelineData) {
      return [];
    }

    const source =
      (timelineData.branches ?? []).length > 0
        ? timelineData.branches
        : deriveBranchSignals(timelineData.files);

    return source
      .map((branch) => branch.name)
      .filter((name) => Boolean(name))
      .slice(0, 20);
  }, [timelineData]);

  const jumpOptions = useMemo(() => {
    if (!timelineData) {
      return [];
    }

    return [...timelineData.files]
      .sort((a, b) => b.commits.length - a.commits.length || b.totalChanges - a.totalChanges)
      .slice(0, 1200)
      .map((file) => file.path);
  }, [timelineData]);

  const filteredData = useMemo(() => {
    if (!timelineData) {
      return timelineData;
    }

    const normalizedPathFilter = pathFilter.trim().toLowerCase();
    const filteredFiles = timelineData.files
      .map((file) => {
        if (branchOnlyMode && branchFilter !== 'all') {
          const filteredCommits = file.commits.filter((commit) => {
            const branches = commit.branches ?? extractBranchNamesFromMessage(commit.message);
            return branches.some(
              (branch) => branch.toLowerCase() === branchFilter.toLowerCase(),
            );
          });

          if (filteredCommits.length === 0) {
            return null;
          }

          return {
            ...file,
            commits: filteredCommits,
            totalAdditions: filteredCommits.reduce((sum, commit) => sum + commit.additions, 0),
            totalDeletions: filteredCommits.reduce((sum, commit) => sum + commit.deletions, 0),
            totalChanges: filteredCommits.reduce((sum, commit) => sum + commit.changes, 0),
          };
        }

        return file;
      })
      .filter((file): file is (typeof timelineData.files)[number] => file !== null)
      .filter((file) => {
        if (selectedPath && file.path === selectedPath) {
          return true;
        }

        if (languageFilter !== 'all' && getLanguageFromPath(file.path) !== languageFilter) {
          return false;
        }

        if (
          authorFilter !== 'all' &&
          !file.commits.some((commit) => commit.author === authorFilter)
        ) {
          return false;
        }

        if (districtFilter !== 'all' && topDistrict(file.folder) !== districtFilter) {
          return false;
        }

        if (branchFilter !== 'all' && !fileMatchesBranch(file, branchFilter)) {
          return false;
        }

        if (riskFilter !== 'all') {
          const profile = riskProfiles.get(file.path);
          if (!profile || riskBand(profile.risk) !== riskFilter) {
            return false;
          }
        }

        if (normalizedPathFilter && !file.path.toLowerCase().includes(normalizedPathFilter)) {
          return false;
        }

        return true;
      });

    const visiblePaths = new Set(filteredFiles.map((file) => file.path));
    const filteredImports = (timelineData.imports ?? []).filter(
      (road) => visiblePaths.has(road.from) && visiblePaths.has(road.to),
    );

    return {
      ...timelineData,
      files: filteredFiles,
      imports: filteredImports,
      branches:
        branchFilter === 'all'
          ? timelineData.branches
          : (timelineData.branches ?? []).filter(
              (branch) => branch.name.toLowerCase() === branchFilter.toLowerCase(),
            ),
    };
  }, [
    authorFilter,
    branchFilter,
    branchOnlyMode,
    districtFilter,
    languageFilter,
    pathFilter,
    riskFilter,
    riskProfiles,
    selectedPath,
    timelineData,
  ]);

  const compareFilteredData = useMemo(() => {
    if (!compareData) {
      return null;
    }

    const normalizedPathFilter = pathFilter.trim().toLowerCase();
    const files = compareData.files
      .map((file) => {
        if (branchOnlyMode && branchFilter !== 'all') {
          const filteredCommits = file.commits.filter((commit) => {
            const branches = commit.branches ?? extractBranchNamesFromMessage(commit.message);
            return branches.some(
              (branch) => branch.toLowerCase() === branchFilter.toLowerCase(),
            );
          });

          if (filteredCommits.length === 0) {
            return null;
          }

          return {
            ...file,
            commits: filteredCommits,
            totalAdditions: filteredCommits.reduce((sum, commit) => sum + commit.additions, 0),
            totalDeletions: filteredCommits.reduce((sum, commit) => sum + commit.deletions, 0),
            totalChanges: filteredCommits.reduce((sum, commit) => sum + commit.changes, 0),
          };
        }

        return file;
      })
      .filter((file): file is (typeof compareData.files)[number] => file !== null)
      .filter((file) => {
        if (languageFilter !== 'all' && getLanguageFromPath(file.path) !== languageFilter) {
          return false;
        }

        if (
          authorFilter !== 'all' &&
          !file.commits.some((commit) => commit.author === authorFilter)
        ) {
          return false;
        }

        if (districtFilter !== 'all' && topDistrict(file.folder) !== districtFilter) {
          return false;
        }

        if (branchFilter !== 'all' && !fileMatchesBranch(file, branchFilter)) {
          return false;
        }

        if (riskFilter !== 'all') {
          const profile = compareRiskProfiles.get(file.path);
          if (!profile || riskBand(profile.risk) !== riskFilter) {
            return false;
          }
        }

        if (normalizedPathFilter && !file.path.toLowerCase().includes(normalizedPathFilter)) {
          return false;
        }

        return true;
      });

    const visiblePaths = new Set(files.map((file) => file.path));
    const imports = (compareData.imports ?? []).filter(
      (road) => visiblePaths.has(road.from) && visiblePaths.has(road.to),
    );

    return {
      ...compareData,
      files,
      imports,
      branches:
        branchFilter === 'all'
          ? compareData.branches
          : (compareData.branches ?? []).filter(
              (branch) => branch.name.toLowerCase() === branchFilter.toLowerCase(),
            ),
    };
  }, [
    authorFilter,
    branchFilter,
    branchOnlyMode,
    compareData,
    compareRiskProfiles,
    districtFilter,
    languageFilter,
    pathFilter,
    riskFilter,
  ]);

  const selectedFile = useMemo(() => {
    if (!filteredData || !selectedPath) {
      return null;
    }

    return filteredData.files.find((file) => file.path === selectedPath) ?? null;
  }, [filteredData, selectedPath]);

  const selectedRiskProfile = useMemo(() => {
    if (!selectedFile) {
      return null;
    }

    return riskProfiles.get(selectedFile.path) ?? null;
  }, [riskProfiles, selectedFile]);

  const insights = useMemo(() => analyzeRepositoryInsights(filteredData), [filteredData]);
  const compareInsights = useMemo(() => {
    if (!compareEnabled) {
      return null;
    }

    return analyzeRepositoryInsights(compareFilteredData);
  }, [compareEnabled, compareFilteredData]);

  const compareSummary = useMemo(() => {
    if (!compareEnabled || !compareFilteredData || !filteredData) {
      return null;
    }

    const beforeRiskMap = buildFileRiskMap(
      compareFilteredData.files,
      compareTs ?? timelineTs ?? undefined,
    );
    const afterRiskMap = buildFileRiskMap(
      filteredData.files,
      timelineTs ?? undefined,
    );
    const beforeAvgRisk =
      compareFilteredData.files.length === 0
        ? 0
        : Array.from(beforeRiskMap.values()).reduce((sum, item) => sum + item.risk, 0) /
          compareFilteredData.files.length;
    const afterAvgRisk =
      filteredData.files.length === 0
        ? 0
        : Array.from(afterRiskMap.values()).reduce((sum, item) => sum + item.risk, 0) /
          filteredData.files.length;

    const beforeHubs = compareInsights?.graph.hubs.length ?? 0;
    const afterHubs = insights?.graph.hubs.length ?? 0;

    return {
      filesDelta: filteredData.files.length - compareFilteredData.files.length,
      roadsDelta: filteredData.imports.length - compareFilteredData.imports.length,
      riskDelta: afterAvgRisk - beforeAvgRisk,
      hubsDelta: afterHubs - beforeHubs,
    };
  }, [
    compareEnabled,
    compareFilteredData,
    compareInsights?.graph.hubs.length,
    compareTs,
    filteredData,
    insights?.graph.hubs.length,
    timelineTs,
  ]);

  const totalCommitsByPath = useMemo(() => {
    const map = new Map<string, number>();
    (data?.files ?? []).forEach((file) => {
      map.set(file.path, Math.max(1, file.commits.length));
    });
    return map;
  }, [data]);

  const hasSceneData = Boolean(filteredData && filteredData.files.length > 0);

  return {
    timelineData,
    compareData,
    riskProfiles,
    compareRiskProfiles,
    languageOptions,
    authorOptions,
    districtOptions,
    branchOptions,
    jumpOptions,
    filteredData,
    compareFilteredData,
    selectedFile,
    selectedRiskProfile,
    insights,
    compareInsights,
    compareSummary,
    totalCommitsByPath,
    hasSceneData,
  };
}
