import { memo, useMemo } from 'react';
import { Text } from '@react-three/drei';
import { CityBounds } from './types';
import { RepositoryInsights } from '../../utils/insights';
import { stringToColor } from '../../utils/color';

interface InsightSignalsProps {
  cityBounds: CityBounds;
  insights: RepositoryInsights | null;
  accentColor: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function shortName(name: string): string {
  if (name.length <= 12) {
    return name;
  }

  return `${name.slice(0, 11)}…`;
}

export const InsightSignals = memo(function InsightSignals({
  cityBounds,
  insights,
  accentColor,
}: InsightSignalsProps) {
  const languageSignals = useMemo(() => {
    if (!insights) {
      return [] as Array<{
        id: string;
        x: number;
        z: number;
        height: number;
        color: string;
        label: string;
      }>;
    }

    const radius = cityBounds.size * 0.57;
    const list = insights.languages.slice(0, 6);

    return list.map((language, index) => {
      const angle = (index / Math.max(1, list.length)) * Math.PI * 2 - Math.PI / 2;
      return {
        id: `lang-${language.name}`,
        x: cityBounds.centerX + Math.cos(angle) * radius,
        z: cityBounds.centerZ + Math.sin(angle) * radius,
        height: 1.2 + language.share * 8.4,
        color: stringToColor(language.name),
        label: `${language.name} ${Math.round(language.share * 100)}%`,
      };
    });
  }, [cityBounds.centerX, cityBounds.centerZ, cityBounds.size, insights]);

  const frameworkSignals = useMemo(() => {
    if (!insights || insights.frameworks.length === 0) {
      return [] as Array<{ id: string; x: number; z: number; angle: number; label: string }>;
    }

    const radius = cityBounds.size * 0.73;
    const list = insights.frameworks.slice(0, 6);

    return list.map((framework, index) => {
      const angle = (index / Math.max(1, list.length)) * Math.PI * 2 + Math.PI / 6;
      return {
        id: `fw-${framework}`,
        x: cityBounds.centerX + Math.cos(angle) * radius,
        z: cityBounds.centerZ + Math.sin(angle) * radius,
        angle,
        label: shortName(framework),
      };
    });
  }, [cityBounds.centerX, cityBounds.centerZ, cityBounds.size, insights]);

  const authorSignals = useMemo(() => {
    if (!insights) {
      return [] as Array<{ id: string; x: number; z: number; color: string; label: string }>;
    }

    const radius = cityBounds.size * 0.21;
    const list = insights.authors.slice(0, 5);

    return list.map((author, index) => {
      const angle = (index / Math.max(1, list.length)) * Math.PI * 2 + Math.PI / 4;
      const color = stringToColor(author.name);
      const initials = author.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((chunk) => chunk[0]?.toUpperCase() ?? '')
        .join('');

      return {
        id: `author-${author.name}`,
        x: cityBounds.centerX + Math.cos(angle) * radius,
        z: cityBounds.centerZ + Math.sin(angle) * radius,
        color,
        label: initials || author.name.slice(0, 2).toUpperCase(),
      };
    });
  }, [cityBounds.centerX, cityBounds.centerZ, cityBounds.size, insights]);

  const historyMarkers = useMemo(() => {
    if (!insights) {
      return [] as Array<{ id: string; x: number; z: number; angle: number }>;
    }

    const markerCount = clamp(Math.round(Math.log1p(insights.ageDays) * 2.5), 4, 18);
    const radius = cityBounds.size * 0.42;

    return Array.from({ length: markerCount }, (_, index) => {
      const angle = (index / markerCount) * Math.PI * 2;
      return {
        id: `age-${index}`,
        x: cityBounds.centerX + Math.cos(angle) * radius,
        z: cityBounds.centerZ + Math.sin(angle) * radius,
        angle,
      };
    });
  }, [cityBounds.centerX, cityBounds.centerZ, cityBounds.size, insights]);

  const statSignals = useMemo(() => {
    if (!insights) {
      return null;
    }

    const filesHeight = clamp(Math.log10(insights.totalFiles + 1) * 1.6, 1, 6);
    const commitsHeight = clamp(Math.log10(insights.totalCommits + 1) * 1.8, 1, 6.5);
    const baseX = cityBounds.centerX - cityBounds.size * 0.46;
    const baseZ = cityBounds.centerZ + cityBounds.size * 0.42;

    return {
      baseX,
      baseZ,
      filesHeight,
      commitsHeight,
    };
  }, [cityBounds.centerX, cityBounds.centerZ, cityBounds.size, insights]);

  const historyLabels = useMemo(() => {
    if (!insights) {
      return null;
    }

    const radius = cityBounds.size * 0.45;
    const fromDate = new Date(insights.fromDate).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const toDate = new Date(insights.toDate).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    return {
      fromX: cityBounds.centerX - radius,
      toX: cityBounds.centerX + radius,
      z: cityBounds.centerZ,
      fromDate,
      toDate,
    };
  }, [cityBounds.centerX, cityBounds.centerZ, cityBounds.size, insights]);

  if (!insights) {
    return null;
  }

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cityBounds.centerX, 0.06, cityBounds.centerZ]}>
        <ringGeometry args={[cityBounds.size * 0.4, cityBounds.size * 0.43, 190]} />
        <meshStandardMaterial
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={0.3}
          transparent
          opacity={0.14}
        />
      </mesh>

      {historyMarkers.map((marker, index) => (
        <mesh
          key={marker.id}
          position={[marker.x, 0.11, marker.z]}
          rotation={[0, marker.angle, 0]}
        >
          <boxGeometry args={[0.22, 0.16 + (index % 3) * 0.03, 0.07]} />
          <meshStandardMaterial color="#9ab5d8" emissive={accentColor} emissiveIntensity={0.24} />
        </mesh>
      ))}

      {historyLabels && (
        <>
          <Text
            position={[historyLabels.fromX, 0.34, historyLabels.z]}
            fontSize={0.11}
            color="#375675"
            anchorX="right"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#ffffff"
          >
            {historyLabels.fromDate}
          </Text>
          <Text
            position={[historyLabels.toX, 0.34, historyLabels.z]}
            fontSize={0.11}
            color="#375675"
            anchorX="left"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#ffffff"
          >
            {historyLabels.toDate}
          </Text>
        </>
      )}

      {languageSignals.map((signal) => (
        <group key={signal.id} position={[signal.x, 0, signal.z]}>
          <mesh position={[0, signal.height / 2, 0]}>
            <boxGeometry args={[0.48, signal.height, 0.48]} />
            <meshStandardMaterial
              color={signal.color}
              emissive={signal.color}
              emissiveIntensity={0.42}
              roughness={0.46}
              metalness={0.28}
              transparent
              opacity={0.86}
            />
          </mesh>
          <mesh position={[0, signal.height + 0.18, 0]}>
            <sphereGeometry args={[0.14, 12, 12]} />
            <meshStandardMaterial color={signal.color} emissive={signal.color} emissiveIntensity={1.1} />
          </mesh>
          <Text
            position={[0, signal.height + 0.44, 0]}
            fontSize={0.17}
            color="#294868"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.015}
            outlineColor="#ffffff"
            maxWidth={4.5}
          >
            {signal.label}
          </Text>
        </group>
      ))}

      {frameworkSignals.map((framework) => (
        <group
          key={framework.id}
          position={[framework.x, 0, framework.z]}
          rotation={[0, framework.angle + Math.PI / 2, 0]}
        >
          <mesh position={[0, 0.66, 0]}>
            <boxGeometry args={[0.2, 1.32, 0.2]} />
            <meshStandardMaterial color="#e2edf9" emissive={accentColor} emissiveIntensity={0.16} />
          </mesh>
          <mesh position={[0, 1.36, 0]}>
            <boxGeometry args={[1.18, 0.22, 0.08]} />
            <meshStandardMaterial
              color="#f3f9ff"
              emissive={accentColor}
              emissiveIntensity={0.1}
              transparent
              opacity={0.94}
            />
          </mesh>
          <Text
            position={[0, 1.37, 0.05]}
            fontSize={0.12}
            color="#355575"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#ffffff"
            maxWidth={1.05}
          >
            {framework.label}
          </Text>
        </group>
      ))}

      {authorSignals.map((author) => (
        <group key={author.id} position={[author.x, 0.75, author.z]}>
          <mesh>
            <sphereGeometry args={[0.13, 12, 12]} />
            <meshStandardMaterial color={author.color} emissive={author.color} emissiveIntensity={0.9} />
          </mesh>
          <Text
            position={[0, 0, 0.11]}
            fontSize={0.08}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.01}
            outlineColor="#1f334c"
          >
            {author.label}
          </Text>
        </group>
      ))}

      {statSignals && (
        <group position={[statSignals.baseX, 0, statSignals.baseZ]}>
          <mesh position={[0, statSignals.filesHeight / 2, 0]}>
            <boxGeometry args={[0.36, statSignals.filesHeight, 0.36]} />
            <meshStandardMaterial color="#b8d0ef" emissive={accentColor} emissiveIntensity={0.18} />
          </mesh>
          <mesh position={[0.54, statSignals.commitsHeight / 2, 0]}>
            <boxGeometry args={[0.36, statSignals.commitsHeight, 0.36]} />
            <meshStandardMaterial color="#9fc3ef" emissive={accentColor} emissiveIntensity={0.25} />
          </mesh>
          <Text
            position={[0, statSignals.filesHeight + 0.2, 0]}
            fontSize={0.11}
            color="#2f4f70"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#ffffff"
          >
            {`F ${insights.totalFiles}`}
          </Text>
          <Text
            position={[0.54, statSignals.commitsHeight + 0.2, 0]}
            fontSize={0.11}
            color="#2f4f70"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#ffffff"
          >
            {`C ${insights.totalCommits}`}
          </Text>
        </group>
      )}
    </group>
  );
});
