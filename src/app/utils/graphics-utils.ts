import {
	Color,
	Material,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	RepeatWrapping,
	SRGBColorSpace,
	TextureLoader,
	WebGLRenderer,
} from 'three';
import { hasMaterialColorOrMap } from './three-type-guards';

export const NULL_COMPARISON_TOLERANCE = 1e-3;

export const TEXTURE_LOADER = new TextureLoader();

export const UV_DEBUG_TEXTURE = TEXTURE_LOADER.loadAsync('debug_uv_grid_opengl.jpg').then(texture => {
	texture.colorSpace = SRGBColorSpace;
	texture.repeat.setScalar(1 / 4);
	texture.wrapS = texture.wrapT = RepeatWrapping;
	return texture;
});

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

export function copyMaterialSharedProperties(source: Material, target: Material): void {
	const sourceKeys = Reflect.ownKeys(source) as (string | symbol)[];
	const excludedKeys = new Set(['id', 'type', 'uuid']);

	for (const key of sourceKeys) {
		if (typeof key === 'string' && excludedKeys.has(key)) continue;

		if (key in target) {
			try {
				(target as any)[key] = (source as any)[key];
			} catch (e: any) {
				console.warn(`Could not assign property ${String(key)}:`, e.message);
			}
		}
	}

	target.needsUpdate = true;
}

export function colorsAreAlmostEqual(color1: Color, color2: Color, epsilon = NULL_COMPARISON_TOLERANCE): boolean {
	return (
		Math.abs(color1.r - color2.r) < epsilon &&
		Math.abs(color1.g - color2.g) < epsilon &&
		Math.abs(color1.b - color2.b) < epsilon
	);
}

export function removeLightingFromMaterial(material: MeshStandardMaterial, renderer: WebGLRenderer): void {
	const originalOnBeforeCompile = material.onBeforeCompile;
	material.onBeforeCompile = shader => {
		originalOnBeforeCompile(shader, renderer);

		// Override final outgoing light with albedo color only (no lighting)
		shader.fragmentShader = shader.fragmentShader.replace(
			/vec3 outgoingLight = totalDiffuse \+ totalSpecular \+ totalEmissiveRadiance;/,
			'vec3 outgoingLight = diffuseColor.rgb;'
		);
	};

	material.needsUpdate = true;
}
