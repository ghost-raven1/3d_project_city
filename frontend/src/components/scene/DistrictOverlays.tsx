import { memo, useMemo } from 'react';
import { Float, Text } from '@react-three/drei';
import { DistrictInfo } from './types';
import {
  SCENE_HUD_OUTLINE_DARK,
  SCENE_HUD_TEXT_PRIMARY,
} from './scene-hud-colors';

interface DistrictOverlaysProps {
  districts: DistrictInfo[];
  cityCenterX: number;
  cityCenterZ: number;
  riskByFolder: Map<string, number>;
}

export const DistrictOverlays = memo(function DistrictOverlays({
  districts,
  cityCenterX,
  cityCenterZ,
  riskByFolder,
}: DistrictOverlaysProps) {
  const labelDistricts = useMemo(() => {
    return districts
      .filter((district) => district.width > 8 || district.depth > 8)
      .slice(0, 26)
      .map((district, index) => {
        const dx = district.x - cityCenterX;
        const dz = district.z - cityCenterZ;
        const outside = 1.8 + (index % 3) * 0.35;

        let edgeX = district.x;
        let edgeZ = district.z;
        let labelX = district.x;
        let labelZ = district.z;
        let anchorX: 'left' | 'right' | 'center' = 'center';

        if (Math.abs(dx) >= Math.abs(dz)) {
          const direction = dx >= 0 ? 1 : -1;
          edgeX = district.x + direction * district.width * 0.5;
          edgeZ = district.z + Math.max(-district.depth * 0.24, Math.min(dz * 0.22, district.depth * 0.24));
          labelX = edgeX + direction * outside;
          labelZ = edgeZ;
          anchorX = direction > 0 ? 'left' : 'right';
        } else {
          const direction = dz >= 0 ? 1 : -1;
          edgeX = district.x + Math.max(-district.width * 0.24, Math.min(dx * 0.22, district.width * 0.24));
          edgeZ = district.z + direction * district.depth * 0.5;
          labelX = edgeX;
          labelZ = edgeZ + direction * outside;
          anchorX = 'center';
        }

        const lineDx = labelX - edgeX;
        const lineDz = labelZ - edgeZ;
        const lineLength = Math.hypot(lineDx, lineDz);
        const lineAngle = Math.atan2(lineDz, lineDx);

        return {
          district,
          anchorX,
          edgeX,
          edgeZ,
          labelX,
          labelZ,
          lineLength,
          lineAngle,
        };
      });
  }, [cityCenterX, cityCenterZ, districts]);

  return (
    <>
      {districts.map((district) => (
        <group key={district.folder}>
          <group position={[district.x, 0, district.z]}>
            <mesh position={[0, 0.03, 0]} receiveShadow>
              <boxGeometry args={[district.width, 0.06, district.depth]} />
              <meshStandardMaterial
                color={district.color}
                emissive={district.archetypeAccent}
                emissiveIntensity={0.14}
                transparent
                opacity={0.14}
                roughness={0.95}
              />
            </mesh>
            <mesh position={[0, 0.05, 0]}>
              <boxGeometry args={[district.width + 0.3, 0.02, district.depth + 0.3]} />
              <meshStandardMaterial color={district.color} transparent opacity={0.12} />
            </mesh>
            <mesh position={[0, 0.07, 0]} receiveShadow>
              <boxGeometry args={[district.width * 0.96, 0.015, district.depth * 0.96]} />
              <meshStandardMaterial
                color={
                  (riskByFolder.get(district.folder) ?? 0) >= 0.55
                    ? '#ff6c80'
                    : (riskByFolder.get(district.folder) ?? 0) >= 0.3
                      ? '#ffbf6a'
                      : '#8de8a8'
                }
                transparent
                opacity={0.05 + (riskByFolder.get(district.folder) ?? 0) * 0.3}
                emissive={
                  (riskByFolder.get(district.folder) ?? 0) >= 0.55
                    ? '#ff4f68'
                    : (riskByFolder.get(district.folder) ?? 0) >= 0.3
                      ? '#ffb04d'
                      : '#7fdb95'
                }
                emissiveIntensity={0.18 + (riskByFolder.get(district.folder) ?? 0) * 0.52}
              />
            </mesh>
          </group>

          <group position={[district.gateX, 0.2, district.gateZ]} rotation={[0, district.gateAngle, 0]}>
            <mesh position={[-0.35, 0.38, 0]}>
              <boxGeometry args={[0.08, 0.76, 0.08]} />
              <meshStandardMaterial
                color={district.archetypeAccent}
                emissive={district.archetypeAccent}
                emissiveIntensity={0.86}
              />
            </mesh>
            <mesh position={[0.35, 0.38, 0]}>
              <boxGeometry args={[0.08, 0.76, 0.08]} />
              <meshStandardMaterial
                color={district.archetypeAccent}
                emissive={district.archetypeAccent}
                emissiveIntensity={0.86}
              />
            </mesh>
            <mesh position={[0, 0.72, 0]}>
              <boxGeometry args={[0.8, 0.08, 0.08]} />
              <meshStandardMaterial
                color={district.archetypeAccent}
                emissive={district.archetypeAccent}
                emissiveIntensity={0.62}
                transparent
                opacity={0.84}
              />
            </mesh>
          </group>
        </group>
      ))}

      {labelDistricts.map(
        ({
          district,
          anchorX,
          edgeX,
          edgeZ,
          labelX,
          labelZ,
          lineLength,
          lineAngle,
        }) => (
          <group key={`${district.folder}-label`}>
            <mesh
              position={[(edgeX + labelX) / 2, 0.48, (edgeZ + labelZ) / 2]}
              rotation={[0, lineAngle, 0]}
            >
              <boxGeometry args={[lineLength, 0.02, 0.03]} />
              <meshStandardMaterial
                color={district.color}
                emissive={district.color}
                emissiveIntensity={0.7}
                transparent
                opacity={0.72}
              />
            </mesh>

            <Float
              position={[labelX, 0.58, labelZ]}
              speed={0.62}
              rotationIntensity={0.03}
              floatIntensity={0.14}
            >
              <Text
                fontSize={Math.max(0.72, Math.min(1.16, district.width * 0.055))}
                color={SCENE_HUD_TEXT_PRIMARY}
                anchorX={anchorX}
                anchorY="middle"
                outlineWidth={0.035}
                outlineColor={SCENE_HUD_OUTLINE_DARK}
                maxWidth={Math.max(8, district.width)}
              >
                {district.label}
              </Text>
              <Text
                position={[0, -0.28, 0]}
                fontSize={0.12}
                color={district.archetypeAccent}
                anchorX={anchorX}
                anchorY="middle"
                outlineWidth={0.012}
                outlineColor={SCENE_HUD_OUTLINE_DARK}
                maxWidth={Math.max(8, district.width)}
              >
                {district.archetypeLabel}
              </Text>
            </Float>
          </group>
        )
      )}
    </>
  );
});
