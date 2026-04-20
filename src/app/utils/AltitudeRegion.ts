import { TileBoundingVolume, Tile, TilesRenderer } from '3d-tiles-renderer';
import { BaseRegion } from '3d-tiles-renderer/plugins';

export class AltitudeRegion extends BaseRegion {
	constructor(private readonly altitudeThreshold: number) {
		super({
			errorTarget: Infinity,
			mask: true,
		});
	}

	override intersectsTile(_boundingVolume: TileBoundingVolume, _tile: Tile, tilesRenderer: TilesRenderer): boolean {
		const cameraElevation = tilesRenderer.ellipsoid.getPositionElevation(tilesRenderer.cameras[0].position);
		return cameraElevation > this.altitudeThreshold;
	}

	override calculateDistance(
		_boundingVolume: TileBoundingVolume,
		_tile: Tile,
		_tilesRenderer: TilesRenderer
	): number {
		// TODO: Implement?
		return Infinity;
	}
}
