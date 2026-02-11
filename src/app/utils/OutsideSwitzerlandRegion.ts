import { TileBoundingVolume, Tile, TilesRenderer, OBB } from '3d-tiles-renderer';
import { BaseRegion } from '3d-tiles-renderer/plugins';
import { Box3, Matrix4, Vector3 } from 'three';

const REUSABLE_VECTOR3 = new Vector3();
const SWITZERLAND_OBB_INTERSECTION_EPSILON = 10000; // [m]

export class OutsideSwitzerlandRegion extends BaseRegion {
	private obb = new OBB(
		new Box3( // Coordinates are taken from Swisstopo Quantized Mesh terrain tiles at zoom level 6 ([66, 48] and [67, 48]). A constant is added because a tile was not properly contained in north east corner.
			new Vector3(4207680.518821144, 415002.0934445335, 4486612.479957226).subScalar(
				SWITZERLAND_OBB_INTERSECTION_EPSILON
			),
			new Vector3(4501877.725829209, 882355.7481015441, 4708491.574130174).addScalar(
				SWITZERLAND_OBB_INTERSECTION_EPSILON
			)
		),
		new Matrix4(
			-0.08440712365849969,
			0.6843548789275851,
			0,
			0,
			0.4956420247669079,
			0.061131613089992154,
			-0.4754661628362909,
			0,
			0.6843548789275851,
			0.08440712365849969,
			0.724247082951467,
			0,
			0,
			0,
			0,
			1
		)
	);

	constructor(private cameraElevationThreshold: number) {
		super({
			errorTarget: Infinity,
			mask: true,
		});
		this.obb.update();
	}

	override intersectsTile(boundingVolume: TileBoundingVolume, tile: Tile, tilesRenderer: TilesRenderer): boolean {
		const cameraElevation = tilesRenderer.ellipsoid.getPositionElevation(tilesRenderer.cameras[0].position);
		if (cameraElevation > this.cameraElevationThreshold) {
			return true;
		} else {
			let tileInsideSwitzerland = true;
			for (const p of boundingVolume.obb!.points) {
				if (!this.obb.containsPoint(REUSABLE_VECTOR3.copy(p).applyMatrix4(this.obb.transform))) {
					tileInsideSwitzerland = false;
					break;
				}
			}

			return !tileInsideSwitzerland;
		}
	}

	override calculateDistance(boundingVolume: TileBoundingVolume, tile: Tile, tilesRenderer: TilesRenderer): number {
		// TODO: Implement?
		return Infinity;
	}
}
