import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MathUtils } from 'three';

// Plugin to generate creased normals for the tiles
export class TileCreasedNormalsPlugin {
	processTileModel(scene: any) {
		scene.traverse((c: any) => {
			if (c.geometry) {
				c.geometry = toCreasedNormals(c.geometry, MathUtils.degToRad(45));
			}
		});
	}
}
