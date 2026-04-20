import { Injectable } from '@angular/core';
import {
	BufferAttribute,
	DataArrayTexture,
	LinearFilter,
	LinearMipmapLinearFilter,
	Material,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	RepeatWrapping,
	RGBAFormat,
	SRGBColorSpace,
	UnsignedByteType,
	Vector3,
	WebGLRenderer,
} from 'three';
import {
	BUILDING_FACADE_TEXTURE_SIZE,
	BUILDING_FACADE_TEXTURE_URLS,
	FACADE_UP,
	SWISSBUILDINGS3D_FACADE_COLOR,
} from '../config/tiles.config';
import {
	colorsAreAlmostEqual,
	disposeMaterial,
	removeLightingFromMaterial,
	TEXTURE_LOADER,
} from '../utils/graphics-utils';
import { hasMaterialColorOrMap } from '../utils/three-type-guards';

const TREE_FOLIAGE_MATERIAL = TEXTURE_LOADER.loadAsync('assets/tree-foliage.jpg').then(texture => {
	texture.colorSpace = SRGBColorSpace;
	texture.wrapS = texture.wrapT = RepeatWrapping;

	// Use unlit material (MeshBasicMaterial) for proper albedo; required for atmosphere.
	return new MeshBasicMaterial({
		map: texture,
	});
});
const TREE_TRUNK_MATERIAL = TEXTURE_LOADER.loadAsync('assets/tree-trunk.jpg').then(texture => {
	texture.colorSpace = SRGBColorSpace;
	texture.wrapS = texture.wrapT = RepeatWrapping;

	// Use unlit material (MeshBasicMaterial) for proper albedo; required for atmosphere.
	return new MeshBasicMaterial({
		map: texture,
	});
});

@Injectable({ providedIn: 'root' })
export class ModelTextureService {
	private readonly REUSABLE_VECTOR3_1 = new Vector3();
	private readonly REUSABLE_VECTOR3_2 = new Vector3();
	private readonly REUSABLE_VECTOR3_3 = new Vector3();

	private buildingFacadeTexturesMaterial = new MeshBasicMaterial({
		// Use unlit material (MeshBasicMaterial) for proper albedo; required for atmosphere.
		color: 0xffffff,
	});
	private buildingFacadeTexturesArray!: DataArrayTexture;
	private highlightedBuildingBatchIdUniform = { value: -1 }; // -1 indicates unselected
	private highlightedTileOffsetUniform = { value: -1 }; // -1 indicates unselected

	async init(): Promise<void> {
		const textureSize = BUILDING_FACADE_TEXTURE_SIZE;
		const layerSize = textureSize * textureSize * 4;
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = textureSize;
		const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
		const texturesData = new Uint8Array(layerSize * BUILDING_FACADE_TEXTURE_URLS.length);

		const textures = await Promise.all(BUILDING_FACADE_TEXTURE_URLS.map(url => TEXTURE_LOADER.loadAsync(url)));
		textures.forEach((texture, i) => {
			ctx.clearRect(0, 0, textureSize, textureSize);
			ctx.drawImage(texture.image, 0, 0, textureSize, textureSize);
			const imageData = ctx.getImageData(0, 0, textureSize, textureSize);
			texturesData.set(imageData.data, i * layerSize);
		});
		this.buildingFacadeTexturesArray = new DataArrayTexture(
			texturesData,
			textureSize,
			textureSize,
			BUILDING_FACADE_TEXTURE_URLS.length
		);
		this.buildingFacadeTexturesArray.colorSpace = SRGBColorSpace;
		this.buildingFacadeTexturesArray.format = RGBAFormat;
		this.buildingFacadeTexturesArray.type = UnsignedByteType;
		this.buildingFacadeTexturesArray.minFilter = LinearMipmapLinearFilter;
		this.buildingFacadeTexturesArray.magFilter = LinearFilter;
		this.buildingFacadeTexturesArray.wrapS = this.buildingFacadeTexturesArray.wrapT = RepeatWrapping;
		this.buildingFacadeTexturesArray.generateMipmaps = true;
		this.buildingFacadeTexturesArray.needsUpdate = true;

		this.buildingFacadeTexturesMaterial.onBeforeCompile = shader => {
			shader.uniforms['buildingTextures'] = { value: this.buildingFacadeTexturesArray };
			shader.uniforms['textureCount'] = { value: BUILDING_FACADE_TEXTURE_URLS.length };
			shader.uniforms['highlightedBuildingBatchId'] = this.highlightedBuildingBatchIdUniform;
			shader.uniforms['highlightedTileOffset'] = this.highlightedTileOffsetUniform;

			shader.vertexShader = shader.vertexShader
				.replace(
					'#include <common>',
					`
					#include <common>
					attribute float _batchid;
					attribute float _tileoffset;

					varying float batchid;
					varying float tileoffset;
					varying float randomizedBatchid;
					varying vec2 vUvCustom;
					`
				)
				.replace(
					'#include <uv_vertex>',
					`
					#include <uv_vertex>
					batchid = _batchid;
					tileoffset = _tileoffset;
					randomizedBatchid = _batchid + _tileoffset;
					vUvCustom = uv;
					`
				);

			shader.fragmentShader = shader.fragmentShader
				.replace(
					'#include <common>',
					`
					#include <common>

					uniform sampler2DArray buildingTextures;
					uniform float textureCount;
					uniform float highlightedBuildingBatchId;
					uniform float highlightedTileOffset;

					varying float batchid;
					varying float tileoffset;
					varying float randomizedBatchid;
					varying vec2 vUvCustom;
					`
				)
				.replace(
					'#include <map_fragment>',
					`
					int texIndex = int(mod(float(randomizedBatchid), float(textureCount)));

					vec4 texColor = texture(
						buildingTextures,
						vec3(vUvCustom, float(texIndex))
					);

					diffuseColor *= texColor;

					if (highlightedBuildingBatchId > -0.5 && abs(batchid - highlightedBuildingBatchId) < 0.5 && abs(tileoffset - highlightedTileOffset) < 0.5) {
						// Highlight building
						diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.0, 0.0), 1.0); // Highlight: facade is red
					}
					`
				);
		};
	}

	createBuildingMeshCustomizationCallback(renderer: WebGLRenderer): (mesh: Mesh) => void {
		return (mesh: Mesh) => {
			// Texture the facades with a random texture and the roofs with swissimage (already applied by ImageOverlayPlugin).

			const originalMaterial = mesh.material as Material;

			const isFacade =
				hasMaterialColorOrMap(originalMaterial) &&
				colorsAreAlmostEqual(originalMaterial.color!, SWISSBUILDINGS3D_FACADE_COLOR);
			if (isFacade) {
				const positions = mesh.geometry.getAttribute('position') as BufferAttribute;
				const normals = mesh.geometry.getAttribute('normal') as BufferAttribute;

				// Ensure UVs are set.
				let uvs = mesh.geometry.getAttribute('uv') as BufferAttribute;
				if (!uvs) {
					uvs = new BufferAttribute(new Float32Array(positions.count * 2), 2);
					mesh.geometry.setAttribute('uv', uvs);
				}

				// Give access to tileOffset in the shader for proper building batchId discrimination between tiles.
				const tileOffset = mesh.geometry.userData['tileOffset'] ?? 0;
				let tileOffsets = mesh.geometry.getAttribute('_tileoffset') as BufferAttribute;
				if (!tileOffsets) {
					tileOffsets = new BufferAttribute(new Float32Array(positions.count).fill(tileOffset), 1);
					mesh.geometry.setAttribute('_tileoffset', tileOffsets);
				}

				for (let vertexIdx = 0; vertexIdx < positions.count; vertexIdx++) {
					const position = this.REUSABLE_VECTOR3_1.fromBufferAttribute(positions, vertexIdx);
					const normal = this.REUSABLE_VECTOR3_2.fromBufferAttribute(normals, vertexIdx);
					const facadeDirection = this.REUSABLE_VECTOR3_3.crossVectors(FACADE_UP, normal).normalize();
					uvs.setXY(vertexIdx, position.dot(facadeDirection), position.z); // NB: z is up, since this is a facade.
				}

				// Properly dispose of original material.
				const matToDispose = mesh.material as Material;
				if (matToDispose) {
					if (Array.isArray(matToDispose)) {
						matToDispose.forEach(mat => disposeMaterial(mat));
					} else {
						disposeMaterial(matToDispose);
					}
				}

				mesh.material = this.buildingFacadeTexturesMaterial;
			} else {
				// We need to use unlit material (e.g. MeshBasicMaterial) for proper albedo; required for atmosphere. However, ImageOverlayPlugin uses a StandardMeshMaterial with onBeforeCompile we cannot really migrate to a MeshBasicMaterial. So we keep the original material and just make it not affected by light.
				removeLightingFromMaterial(mesh.material as MeshStandardMaterial, renderer);
			}
		};
	}

	createTlmMeshCustomizationCallback(renderer: WebGLRenderer): (mesh: Mesh) => void {
		return (mesh: Mesh) => {
			removeLightingFromMaterial(mesh.material as MeshStandardMaterial, renderer);
		};
	}

	createVegetationMeshCustomizationCallback(): (mesh: Mesh) => Promise<void> {
		return async (mesh: Mesh) => {
			// Texture the trees with the same shared material.
			// TODO: Properly implement InstancedMesh, as there are clearly too many trees objects in the scene (is InstancedMesh really used!?). o.scene has two children (foliage + trunk).

			const originalMaterial = mesh.material as MeshStandardMaterial;
			const textureWidth = originalMaterial.map?.source.data.width;

			// Properly dispose of original material.
			if (originalMaterial) {
				if (Array.isArray(originalMaterial)) {
					originalMaterial.forEach(mat => disposeMaterial(mat));
				} else {
					disposeMaterial(originalMaterial);
				}
			}

			if (textureWidth === 81) {
				mesh.material = await TREE_FOLIAGE_MATERIAL;
			} else {
				mesh.material = await TREE_TRUNK_MATERIAL;
			}
		};
	}

	setHighlightedBuilding(batchId: number, tileOffset: number): void {
		this.highlightedBuildingBatchIdUniform.value = batchId;
		this.highlightedTileOffsetUniform.value = tileOffset;
	}
}
