import { Ellipsoid } from '3d-tiles-renderer';

import * as NasaTilesRenderer from '3d-tiles-renderer';
declare module '3d-tiles-renderer' {
	export interface Ellipsoid {
		calculateEffectiveRadius(latitude: number): number;
	}
}
