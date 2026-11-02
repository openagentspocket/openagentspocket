import type { ProgramBrand } from '@openagentspocket/core';
import { useId } from 'react';
import Svg, { Circle, Defs, G, Mask, Path, Rect } from 'react-native-svg';
import { programLogos } from '../theme/brands.generated';

/** The status dot's share of the mark, and the gap cut around it. */
export const PROGRAM_MARK_BADGE_RATIO = 0.5;
export const PROGRAM_MARK_BADGE_GAP = 1.5;

const VIEW_BOX = 24;

/** Where the status dot sits on a mark of `size`: it pokes a quarter of itself past the corner. */
export function badgeGeometry(size: number) {
  const diameter = Math.round(size * PROGRAM_MARK_BADGE_RATIO);
  const center = size - diameter / 4;
  return { diameter, center, cutRadius: diameter / 2 + PROGRAM_MARK_BADGE_GAP };
}

interface ProgramLogoProps {
  brand: ProgramBrand;
  size: number;
  color: string;
  /** Cuts a circle for a status dot of this mark size out of the lower trailing corner. */
  cutout?: boolean;
}

/** A brand's logo (Lobe Icons, MIT) in one color, optionally with the status dot's cut-out. */
export function ProgramLogo({ brand, size, color, cutout }: ProgramLogoProps) {
  const maskId = `program-logo-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { center, cutRadius } = badgeGeometry(size);
  const unit = VIEW_BOX / size;
  const paths = programLogos[brand] as readonly {
    d: string;
    opacity?: number;
    clipRule?: boolean;
  }[];
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
      testID={`logo-${brand}`}
    >
      {cutout ? (
        <Defs>
          <Mask id={maskId} x="-50%" y="-50%" width="200%" height="200%">
            <Rect x="-12" y="-12" width="48" height="48" fill="white" />
            <Circle cx={center * unit} cy={center * unit} r={cutRadius * unit} fill="black" />
          </Mask>
        </Defs>
      ) : null}
      <G fill={color} fillRule="evenodd" mask={cutout ? `url(#${maskId})` : undefined}>
        {paths.map((path) => (
          <Path
            key={path.d}
            d={path.d}
            opacity={path.opacity}
            clipRule={path.clipRule ? 'evenodd' : undefined}
          />
        ))}
      </G>
    </Svg>
  );
}
