import { TileBoundingVolume, Tile, TilesRenderer, OBB } from '3d-tiles-renderer';
import { BaseRegion } from '3d-tiles-renderer/plugins';
import { Box3, Matrix4, Vector3 } from 'three';

export class SwitzerlandRegion extends BaseRegion {
	private obb = new OBB(
		new Box3(new Vector3(4223271, 462331, 4551286), new Vector3(4428944, 782145, 4705621)), // in ECEF (EPSG:4978). Conversion: https://www.oc.nps.edu/oc2902w/coord/llhxyz.htm
		new Matrix4()
	);

	constructor(private cameraElevationThreshold: number) {
		super(Infinity, true);
		this.obb.update();
	}

	override intersectsTile(boundingVolume: TileBoundingVolume, tile: Tile, tilesRenderer: TilesRenderer): boolean {
		const cameraElevation = tilesRenderer.ellipsoid.getPositionElevation(tilesRenderer.cameras[0].position);
		if (cameraElevation < this.cameraElevationThreshold) {
			/*if ((tile as any).content?.uri === '20201203/6/66/48.terrain?v=1') {
				console.log((boundingVolume as any).regionObb);
			}*/
			return boundingVolume.intersectsOBB(this.obb);
		} else {
			return false;
		}
	}

	/*override calculateError(tile: Tile, tilesRenderer: TilesRenderer): number {
		const cameraElevation = WGS84_ELLIPSOID.getPositionElevation(tilesRenderer.cameras[0].position);
		if (cameraElevation < 350000) {
			return tile.geometricError - this.errorTarget + tilesRenderer.errorTarget;
		} else {
			return -Infinity;
		}
	}*/
}
