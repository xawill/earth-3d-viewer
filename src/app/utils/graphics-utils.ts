import { Material, Mesh, Object3D } from 'three';
import { hasMaterialColorOrMap } from './three-type-guards';

// See how the function looks like: https://www.wolframalpha.com/input?i=-x%5E2%2B2x
export function pow2Animation(x: number): number {
	return -(x ** 2) + 2 * x;
}

export function updateObjectAndChildrenOpacity(object: Object3D, opacity: number): void {
	object.traverse(child => {
		const mesh = child as Mesh;
		if (mesh && mesh.material) {
			if (Array.isArray(mesh.material)) {
				for (const m of mesh.material) {
					m.transparent = opacity === 1 ? false : true;
					m.opacity = opacity;
					m.needsUpdate = true;
				}
			} else {
				mesh.material.transparent = opacity === 1 ? false : true;
				mesh.material.opacity = opacity;
				mesh.material.needsUpdate = true;
			}
		}
	});
}

export function disposeMaterial(material: Material): void {
	if (hasMaterialColorOrMap(material)) {
		if (material.map) {
			material.map.dispose();
		}
	}
	material.dispose();
}
