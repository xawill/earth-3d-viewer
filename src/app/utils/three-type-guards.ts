import { Color, Material, Mesh, Object3D, Texture } from 'three';

export function isMesh(object: Object3D): object is Mesh {
	return (object as Mesh).isMesh;
}

export function hasMaterialColorOrMap(material: Material): material is Material & { color?: Color; map?: Texture } {
	return 'color' in material || 'map' in material;
}
