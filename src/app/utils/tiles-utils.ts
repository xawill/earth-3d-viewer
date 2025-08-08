import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MathUtils, Object3D } from 'three';
import { disposeMaterial } from './graphics-utils';
import { isMesh } from './three-type-guards';

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

export function disposeManuallyCreatedMaterials(scene: Object3D): void {
	scene.traverse(child => {
		if (isMesh(child) && child.material) {
			if (Array.isArray(child.material)) {
				child.material.forEach(mat => disposeMaterial(mat));
			} else {
				disposeMaterial(child.material);
			}
		}
	});
}
