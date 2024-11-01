import { Mesh, Object3D, Vector3 } from 'three';

// See how the function looks like: https://www.wolframalpha.com/input?i=-x%5E2%2B2x
export function pow2Animation(x: number): number {
	return -(x ** 2) + 2 * x;
}

export function tilesPositionToThreejs(position: Vector3): Vector3 {
	const positionX = position.x;
	const positionY = position.y;
	const positionZ = position.z;
	return position.set(positionY, positionZ, positionX);
}

export function threejsPositionToTiles(position: Vector3): Vector3 {
	const positionX = position.x;
	const positionY = position.y;
	const positionZ = position.z;
	return position.set(positionZ, positionX, positionY);
}

export function updateObjectAndChildrenOpacity(object: Object3D, opacity: number): void {
	object.traverse(child => {
		const mesh = child as Mesh;
		if (mesh && mesh.material) {
			if (Array.isArray(mesh.material)) {
				for (const m of mesh.material) {
					m.transparent = true;
					m.opacity = opacity;
					m.needsUpdate = true;
				}
			} else {
				mesh.material.transparent = true;
				mesh.material.opacity = opacity;
				mesh.material.needsUpdate = true;
			}
		}
	});
}
