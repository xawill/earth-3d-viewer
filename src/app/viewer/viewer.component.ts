import { Component, ElementRef, ViewChild } from '@angular/core';
import { GlobeControls, Tile, TilesRenderer, WGS84_RADIUS } from '3d-tiles-renderer';
import {
	GoogleCloudAuthPlugin,
	BatchedTilesPlugin,
	TileCompressionPlugin,
	DebugTilesPlugin,
	UpdateOnChangePlugin,
	QuantizedMeshPlugin,
	LoadRegionPlugin,
	ImageOverlayPlugin,
	XYZTilesOverlay,
	UnloadTilesPlugin,
	TilesFadePlugin,
} from '3d-tiles-renderer/plugins';
import {
	Group,
	Intersection,
	MathUtils,
	PCFSoftShadowMap,
	PerspectiveCamera,
	Raycaster,
	Scene,
	Vector2,
	Vector3,
	WebGLRenderer,
	Object3D,
	MeshBasicMaterial,
	MeshStandardMaterial,
	HalfFloatType,
	NoToneMapping,
	Matrix4,
	Mesh,
	RepeatWrapping,
	BufferAttribute,
	Material,
	Color,
	SRGBColorSpace,
} from 'three';
import {
	EffectComposer,
	EffectMaterial,
	EffectPass,
	NormalPass,
	RenderPass,
	SMAAEffect,
	ToneMappingEffect,
	ToneMappingMode,
} from 'postprocessing';
import {
	AerialPerspectiveEffect,
	AtmosphereParameters,
	getMoonDirectionECEF,
	getSunDirectionECEF,
	PrecomputedTexturesGenerator,
} from '@takram/three-atmosphere';
import { DitheringEffect, LensFlareEffect } from '@takram/three-geospatial-effects';
import { disposeManuallyCreatedMaterials, TileCreasedNormalsPlugin } from '../utils/tiles-utils';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AddressSearchComponent } from '../address-search/address-search.component';
import { environment } from '../../environments/environment';
import gsap from 'gsap';
import { LayersSettingsComponent, LayersSettings } from '../layers-toggle/layers-toggle.component';
import {
	colorsAreAlmostEqual,
	disposeMaterial,
	pow2Animation,
	removeLightingFromMaterial,
	TEXTURE_LOADER,
	updateObjectAndChildrenOpacity,
} from '../utils/graphics-utils';
import { EPS_DECIMALS, round } from '../utils/math-utils';
import {
	getUpDirection,
	haversineDistance,
	LatLng,
	LatLon,
	threejsPositionToTiles,
	tilesPositionToThreejs,
} from '../utils/map-utils';
import { SwitzerlandRegion } from '../utils/SwitzerlandRegion';
import { OutsideSwitzerlandRegion } from '../utils/OutsideSwitzerlandRegion';
import { hasMaterialColorOrMap, isMesh } from '../utils/three-type-guards';
import { DebugGui } from '../utils/debug-gui';

const GOOGLE_3D_TILES_TILESET_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json';
const SWISSTOPO_BUILDINGS_3D_TILES_TILESET_URL =
	'https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json';
const SWISSTOPO_TLM_3D_TILES_TILESET_URL = 'https://3d.geo.admin.ch/ch.swisstopo.swisstlm3d.3d/v1/tileset.json';
const SWISSTOPO_VEGETATION_3D_TILES_TILESET_URL = 'https://3d.geo.admin.ch/ch.swisstopo.vegetation.3d/v1/tileset.json';
const SWISSTOPO_NAMES_3D_TILES_TILESET_URL =
	'https://3d.geo.admin.ch/3d-tiles/ch.swisstopo.swissnames3d.3d/20180716/tileset.json';
const SWISSTOPO_TERRAIN_3D_TILES_TILESET_URL = 'https://3d.geo.admin.ch/ch.swisstopo.terrain.3d/v1/layer.json';
const SWISSTOPO_SWISSIMAGE_XYZ_URL =
	'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg'; // Max zoom level is 20. To test/debug tiles indexing: https://codepen.io/procrastinatio/pen/BgaGWZ

const DEFAULT_START_COORDS: LatLng = { lat: 46.516591, lng: 6.629047 };
const HEIGHT_FULL_GLOBE_VISIBLE = 7000000;
const HEIGHT_ABOVE_TARGET_COORDS_ELEVATION = 1000; // [m]
const TOLERANCE_DISTANCE_COORDS_NO_WAIT_TO_DESCENT = 500000; // [m]
const SWITZERLAND_REGION_CAMERA_ELEVATION_THRESHOLD = 350000; // [m]
const SWISS_GEOID_ELLIPSOID_OFFSET = new Vector3(34, 5, 36); // We empirically find the approximate offset with Google Photorealistic 3D Tiles at Gare de Vevey to have them more or less aligned. Read more here https://www.swisstopo.admin.ch/fr/geoid-fr and https://bertt.wordpress.com/2023/07/11/adding-objects-to-google-photorealistic-3d-tiles/

const ZOOM_LEVEL_COLORS_DEBUG = [
	0x888888, // Gray
	0xffffff, // White
	0x000000, // Black
	0xff0000, // Red
	0x00ff00, // Green
	0x0000ff, // Blue
	0xffff00, // Yellow
	0xff00ff, // Magenta
	0x00ffff, // Cyan
	0x880000, // Dark Red
	0x008800, // Dark Green
	0x000088, // Dark Blue
	0x888800, // Olive
	0x880088, // Purple
	0x008888, // Teal
	0x444444, // Dark Gray
	0xff8800, // Orange
	0x88ff00, // Lime
	0x0088ff, // Sky Blue
	0xff0088, // Pink
];

// NB: Put reference to REUSABLE object to null after done using to minimize risk of reusing a REUSABLE object before it was done being used by the previous user.
const REUSABLE_VECTOR2 = new Vector2();
const REUSABLE_VECTOR3_1 = new Vector3();
const REUSABLE_VECTOR3_2 = new Vector3();
const REUSABLE_VECTOR3_3 = new Vector3();

const BUILDING_MATERIALS = [
	'architextures/aluminium-stack-1219-mm-architextures.jpg',
	'architextures/basalt-stack-2835-mm-architextures.jpg',
	'architextures/bembridge-antique-staggered-675-mm-architextures.jpg',
	'architextures/blue-majolica-tile-stack-268-mm-architextures.jpg',
	'architextures/blundell-staggered-1320-mm-architextures.jpg',
	'architextures/boardmarked-concrete-staggered-2002-mm-architextures.jpg',
	'architextures/buff-flemish-675-mm-architextures.jpg',
	'architextures/calacatta-vena-hexagonal-1617-mm-architextures.jpg',
	'architextures/concrete-european-fan-5955-mm-architextures.jpg',
	'architextures/corrugated-aluminium-3000-mm-architextures.jpg',
	'architextures/crazing-tile-hexagonal-1536-mm-architextures.jpg',
	'architextures/crazing-tile-stack-612-mm-architextures-2.jpg',
	'architextures/crazing-tile-stack-612-mm-architextures.jpg',
	'architextures/crazing-tile-triangle-610-mm-architextures.jpg',
	'architextures/dragfaced-brick-common-2700-mm-architextures.jpg',
	'architextures/dragfaced-brick-stretcher-2250-mm-architextures.jpg',
	'architextures/drill-marked-granite-drystone-1118-mm-architextures.jpg',
	'architextures/embossed-plaster-1500-mm-architextures.jpg',
	'architextures/even-drag-brick-basketweave-1320-mm-architextures.jpg',
	'architextures/even-drag-brick-stretcher-1435-mm-architextures.jpg',
	'architextures/even-drag-brick-stretcher-4100-mm-architextures.jpg',
	'architextures/exposed-aggregate-2996-mm-architextures.jpg',
	'architextures/fine-bush-hammered-concrete-2500-mm-architextures.jpg',
	'architextures/flagstone-rubble-1948-mm-architextures.jpg',
	'architextures/flamed-royal-white-granite-300-mm-architextures.jpg',
	'architextures/granite-crazy-paving-1045-mm-architextures.jpg',
	'architextures/granite-herringbone-1145-mm-architextures.jpg',
	'architextures/granite-rounded-rubble-749-mm-architextures.jpg',
	'architextures/granite-stack-2730-mm-architextures.jpg',
	'architextures/granite-stack-3630-mm-architextures.jpg',
	'architextures/granite-stretcher-2420-mm-architextures.jpg',
	'architextures/green-crazing-tile-leaf-pattern-1920-mm-architextures.jpg',
	'architextures/grey-victorian-tile-stack-912-mm-architextures.jpg',
	'architextures/in-situ-concrete-3996-mm-architextures.jpg',
	'architextures/industrial-brick-common-940-mm-architextures.jpg',
	'architextures/inkstone-seashell-mosaic-stack-309-mm-architextures.jpg',
	'architextures/ivory-cedar--walnut-2400-mm-architextures.jpg',
	'architextures/limestone-crazy-paving-1049-mm-architextures.jpg',
	'architextures/marble-800-mm-architextures.jpg',
	'architextures/marmoreal-3000-mm-architextures.jpg',
	'architextures/marmoreal-stretcher-1204-mm-architextures.jpg',
	'architextures/matte-stack-2100-mm-architextures.jpg',
	'architextures/metro-tile-stretcher-1230-mm-architextures.jpg',
	'architextures/mono-terrazzo-stack-1220-mm-architextures.jpg',
	'architextures/moss-300-mm-architextures.jpg',
	'architextures/orange-marble-2500-mm-architextures.jpg',
	'architextures/oscuro-terrazzo-1750-mm-architextures.jpg',
	'architextures/pilotage-stack-1819-mm-architextures.jpg',
	'architextures/pinstripe-glazed-tile-intersecting-circle-1211-mm-architextures.jpg',
	'architextures/rough-limestone-ashlar-1508-mm-architextures.jpg',
	'architextures/slate-ashlar-1796-mm-architextures.jpg',
	'architextures/slate-staggered-2010-mm-architextures.jpg',
	'architextures/stones-1248-mm-architextures.jpg',
	'architextures/suyaki-ebony-stretcher-2910-mm-architextures.jpg',
	'architextures/textured-plaster-1248-mm-architextures.jpg',
	'architextures/verde-alpi-marble-varied-terrazzo-903-mm-architextures.jpg',
	'architextures/victorian-glazed-fishscale-1020-mm-architextures.jpg',
	'architextures/victorian-glazed-stack-1020-mm-architextures.jpg',
	'architextures/victorian-glazed-stack-804-mm-architextures.jpg',
	'architextures/weathered-timber-3935-mm-architextures.jpg',
	'architextures/weathered-timber-staggered-2700-mm-architextures.jpg',
].map(url =>
	TEXTURE_LOADER.loadAsync(url).then(texture => {
		texture.colorSpace = SRGBColorSpace;
		texture.wrapS = texture.wrapT = RepeatWrapping;

		// Use unlit material (MeshBasicMaterial) for proper albedo; required for atmosphere.
		return new MeshBasicMaterial({
			map: texture,
		});
	})
);
const FACADE_UP = new Vector3(0, 0, 1);
const SWISSBUILDINGS3D_FACADE_COLOR = new Color(0.886, 0.851, 0.565); // Found empirically.

const TREE_FOLIAGE_MATERIAL = TEXTURE_LOADER.loadAsync('tree-foliage.jpg').then(texture => {
	texture.colorSpace = SRGBColorSpace;
	texture.wrapS = texture.wrapT = RepeatWrapping;

	// Use unlit material (MeshBasicMaterial) for proper albedo; required for atmosphere.
	return new MeshBasicMaterial({
		map: texture,
	});
});
const TREE_TRUNK_MATERIAL = TEXTURE_LOADER.loadAsync('tree-trunk.jpg').then(texture => {
	texture.colorSpace = SRGBColorSpace;
	texture.wrapS = texture.wrapT = RepeatWrapping;

	// Use unlit material (MeshBasicMaterial) for proper albedo; required for atmosphere.
	return new MeshBasicMaterial({
		map: texture,
	});
});

const SWISSTOPO_TLM_MATERIAL = new MeshBasicMaterial({
	color: 0xb9b0aa,
});

@Component({
	selector: 'app-viewer',
	imports: [AddressSearchComponent, LayersSettingsComponent],
	templateUrl: './viewer.component.html',
	styleUrl: './viewer.component.scss',
})
export class ViewerComponent {
	private scene!: Scene;
	private renderer!: WebGLRenderer;
	private composer!: EffectComposer;
	private camera!: PerspectiveCamera;
	private controls!: GlobeControls;
	private raycaster = new Raycaster();
	private stats = new Stats();

	private earth = new Group();
	private aerialPerspective!: AerialPerspectiveEffect;

	private sunDirection = new Vector3();
	private moonDirection = new Vector3();

	private referenceDate = new Date(Date.now()); // TODO: Add UI to set date/time.

	private dracoLoader!: DRACOLoader;

	private renderingNeedsUpdate = true;
	private isMouseDragging = false; // Meaning that mouse is being dragged with either left or right button.
	private areControlsDragging = false; // Meaning that user is moving globe with normal left mouse button.
	private isControlsRotationReset = true; // Meaning that north is up and lookAt Earth center.

	private zoomToCoordsAnimationTl = gsap.timeline();
	private destinationPosition = new Vector3();
	private resetOrbitCameraPosition = new Vector3();
	private pivotPoint = new Vector3();
	private targetCameraUp = new Vector3();

	private googleTiles = new TilesRenderer(GOOGLE_3D_TILES_TILESET_URL);
	private swisstopoBuildingsTiles = new TilesRenderer(SWISSTOPO_BUILDINGS_3D_TILES_TILESET_URL);
	private swisstopoTlmTiles = new TilesRenderer(SWISSTOPO_TLM_3D_TILES_TILESET_URL);
	private swisstopoVegetationTiles = new TilesRenderer(SWISSTOPO_VEGETATION_3D_TILES_TILESET_URL);
	private swisstopoNamesTiles = new TilesRenderer(SWISSTOPO_NAMES_3D_TILES_TILESET_URL);
	private swisstopoTerrainTiles = new TilesRenderer(SWISSTOPO_TERRAIN_3D_TILES_TILESET_URL);

	private googleDebugTilesPlugin = new DebugTilesPlugin({
		maxDebugError: 100,
		maxDebugDistance: 100,
		displayBoxBounds: true,
	});

	private googleTilesOpacity = 1;

	@ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;

	currentPosition: LatLon & { height: number } = { lon: 0, lat: 0, height: 0 }; // [rad, rad, m]

	constructor() {
		this.dracoLoader = new DRACOLoader();
		this.dracoLoader.setDecoderPath('libs/draco/gltf/');

		gsap.registerPlugin({
			// From https://gsap.com/community/forums/topic/25830-tweening-value-with-large-number-of-decimals/#comment-125391
			name: 'precise',
			init(target: any, vars: any, tween: any, index: any, targets: any) {
				let data: any = this,
					p,
					value;
				data.t = target;
				for (p in vars) {
					value = vars[p];
					typeof value === 'function' && (value = value.call(tween, index, target, targets));
					data.pt = { n: data.pt, p: p, s: target[p], c: value - target[p] };
					data._props.push(p);
				}
			},
			render(ratio: any, data: any) {
				let pt = data.pt;
				while (pt) {
					data.t[pt.p] = pt.s + pt.c * ratio;
					pt = pt.n;
				}
			},
		});
	}

	ngAfterViewInit() {
		this.scene = new Scene();

		this.renderer = new WebGLRenderer({
			powerPreference: 'high-performance',
			antialias: true,
			stencil: false,
			depth: true,
			logarithmicDepthBuffer: false,
			canvas: this.canvas.nativeElement,
		});
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setClearColor(0x151c1f);
		//this.renderer.localClippingEnabled = true;
		this.renderer.toneMapping = NoToneMapping;
		this.renderer.toneMappingExposure = 6;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = PCFSoftShadowMap;
		// TODO: Properly handle shadows with atmosphere (cast/receive shadows don't seem to work anymore).

		this.camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, WGS84_RADIUS * 2);
		//this.scene.add(this.camera);

		this.controls = new GlobeControls(this.scene, this.camera, this.renderer.domElement);
		this.controls.enableDamping = false;
		this.controls.adjustHeight = false;
		this.controls.maxAltitude = MathUtils.degToRad(90);
		this.controls.minDistance = 0;

		this.controls.addEventListener('start', () => {
			if (this.zoomToCoordsAnimationTl.isActive()) {
				this.zoomToCoordsAnimationTl.kill();
			}
			this.renderingNeedsUpdate = true;
		});
		this.controls.addEventListener('change', () => {
			if (this.areControlsDragging && this.isControlsRotationReset) {
				// Ensure north stays up during dragging when north is already up, otherwise we have an annoying rotation drift. This is not applied when user rotated the globe.
				this.camera.lookAt(0, 0, 0);
			}
			this.renderingNeedsUpdate = true;
		});
		this.controls.addEventListener('end', () => {
			this.renderingNeedsUpdate = true;
		});

		this.renderer.domElement.addEventListener('pointerdown', event => {
			this.isMouseDragging = true;
			this.areControlsDragging = event.button === 0; // Left mouse button
			if (event.button === 2) {
				// Right mouse button
				this.isControlsRotationReset = false;
			}
		});
		this.renderer.domElement.addEventListener('pointermove', () => {
			if (this.isMouseDragging) {
				// Fixes a probable bug that often happens during a drag event: the rendering is not updated and the controls therefore block.
				this.renderingNeedsUpdate = true;
			}
		});
		this.renderer.domElement.addEventListener('pointerup', () => {
			this.isMouseDragging = false;
			this.areControlsDragging = false;
		});

		this.earth.rotateOnWorldAxis(REUSABLE_VECTOR3_1.set(1, 0, 0), -Math.PI / 2);
		this.earth.rotateOnWorldAxis(REUSABLE_VECTOR3_1.set(0, 1, 0), -Math.PI / 2);
		this.scene.add(this.earth);

		this.stats.showPanel(0);
		document.body.appendChild(this.stats.dom);

		// Since we share the cache between swisstopo tiles renderers, we need to increase its size.
		const cacheSizeMultiplier = 6;
		this.swisstopoBuildingsTiles.lruCache.maxSize =
			Number(this.swisstopoBuildingsTiles.lruCache.maxSize) * cacheSizeMultiplier;
		this.swisstopoBuildingsTiles.lruCache.minSize =
			Number(this.swisstopoBuildingsTiles.lruCache.minSize) * cacheSizeMultiplier;
		this.swisstopoBuildingsTiles.lruCache.maxBytesSize =
			Number(this.swisstopoBuildingsTiles.lruCache.maxBytesSize) * cacheSizeMultiplier;
		this.swisstopoBuildingsTiles.lruCache.minBytesSize =
			Number(this.swisstopoBuildingsTiles.lruCache.minBytesSize) * cacheSizeMultiplier;
		this.swisstopoBuildingsTiles.lruCache.unloadPercent =
			Number(this.swisstopoBuildingsTiles.lruCache.unloadPercent) * cacheSizeMultiplier;

		this.initGoogleTileset(this.googleTiles);
		this.initSwisstopo3DTileset(
			this.swisstopoBuildingsTiles,
			30,
			async (mesh: Mesh) => {
				// Texture the facades with a random texture and the roofs with swissimage (already applied by ImageOverlayPlugin).

				const originalMaterial = mesh.material as Material;

				const isFacade =
					hasMaterialColorOrMap(originalMaterial) &&
					colorsAreAlmostEqual(originalMaterial.color!, SWISSBUILDINGS3D_FACADE_COLOR);
				if (isFacade) {
					// Ensure UVs are set.
					const positions = mesh.geometry.getAttribute('position') as BufferAttribute;
					const normals = mesh.geometry.getAttribute('normal') as BufferAttribute;

					let uvs = mesh.geometry.getAttribute('uv') as BufferAttribute;
					if (!uvs) {
						uvs = new BufferAttribute(new Float32Array(positions.count * 2), 2);
						mesh.geometry.setAttribute('uv', uvs);
					}
					for (let vertexIdx = 0; vertexIdx < positions.count; vertexIdx++) {
						const position = REUSABLE_VECTOR3_1.fromBufferAttribute(positions, vertexIdx);
						const normal = REUSABLE_VECTOR3_2.fromBufferAttribute(normals, vertexIdx);
						const facadeDirection = REUSABLE_VECTOR3_3.crossVectors(FACADE_UP, normal).normalize();
						uvs.setXY(vertexIdx, position.dot(facadeDirection), position.z); // NB: z is up, since this is a facade.
					}

					// Properly dispose of original material.
					const originalMaterial = mesh.material as Material;
					if (originalMaterial) {
						if (Array.isArray(originalMaterial)) {
							originalMaterial.forEach(mat => disposeMaterial(mat));
						} else {
							disposeMaterial(originalMaterial);
						}
					}

					const randomMaterial =
						await BUILDING_MATERIALS[Math.floor(Math.random() * BUILDING_MATERIALS.length)];
					mesh.material = randomMaterial;
				} else {
					// We need to use unlit material (e.g. MeshBasicMaterial) for proper albedo; required for atmosphere. However, ImageOverlayPlugin uses a StandardMeshMaterial with onBeforeCompile we cannot really migrate to a MeshBasicMaterial. So we keep the original material and just make it not affected by light.
					removeLightingFromMaterial(mesh.material as MeshStandardMaterial, this.renderer);
				}
			},
			true
		);
		this.initSwisstopo3DTileset(this.swisstopoTlmTiles, 1, async (mesh: Mesh) => {
			// Having all objects share the same material. Also making sure that the material is unlit for proper rendering with atmosphere support.
			// TODO: In the original dataset, different colors are applied to different structures. Let's try to find a way to recover them while still reusing the different materials.
			// TODO: Even better: texture with SWISSIMAGE (once performance issues are solved).
			const originalMaterial = mesh.material as MeshStandardMaterial;

			// Properly dispose of original material.
			if (originalMaterial) {
				if (Array.isArray(originalMaterial)) {
					originalMaterial.forEach(mat => disposeMaterial(mat));
				} else {
					disposeMaterial(originalMaterial);
				}
			}

			mesh.material = SWISSTOPO_TLM_MATERIAL;
		});
		this.initSwisstopo3DTileset(this.swisstopoVegetationTiles, 8, async (mesh: Mesh) => {
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
		});
		//this.initSwisstopo3DTileset(this.swisstopoNamesTiles); // TODO: .vctr format not supported (yet). // TODO: Find most recent tileset (if it even exists?)
		this.initSwisstopoQuantizedTileset(this.swisstopoTerrainTiles);

		// Set init camera position
		this.currentPosition.lon = DEFAULT_START_COORDS.lng * MathUtils.DEG2RAD;
		this.currentPosition.lat = DEFAULT_START_COORDS.lat * MathUtils.DEG2RAD;
		this.currentPosition.height = HEIGHT_FULL_GLOBE_VISIBLE;
		this.moveCameraTo(this.currentPosition);

		this.onWindowResize();
		window.addEventListener('resize', () => this.onWindowResize(), false);

		this.render();

		this.initAtmosphere(); // TODO: There is probably a race condition, because sometimes at app loading the globe atmosphere is very dark like at sunset. Probably not loading properly.
	}

	async zoomTo(destination: { coords: google.maps.LatLng; elevation: number }) {
		// Update currentPosition in case some user controls interaction moved the position since last address selection
		this.googleTiles.ellipsoid.getPositionToCartographic(
			threejsPositionToTiles(REUSABLE_VECTOR3_1.copy(this.camera.position)),
			this.currentPosition
		);

		const height = destination.elevation + HEIGHT_ABOVE_TARGET_COORDS_ELEVATION;

		tilesPositionToThreejs(
			this.googleTiles.ellipsoid.getCartographicToPosition(
				destination.coords.lat() * MathUtils.DEG2RAD,
				destination.coords.lng() * MathUtils.DEG2RAD,
				height,
				this.destinationPosition
			)
		);
		const originDestAngularDistance = round(this.camera.position.angleTo(this.destinationPosition), EPS_DECIMALS);
		const distancePercentage = pow2Animation(Math.abs(originDestAngularDistance) / Math.PI);

		const maxClimbAltitude = HEIGHT_FULL_GLOBE_VISIBLE;
		const climbHeight = Math.max(
			Math.max(distancePercentage * maxClimbAltitude, height) - this.currentPosition.height,
			0
		); // NB: This is climb height and not climb target altitude!
		const descentHeight = round(this.currentPosition.height + climbHeight - height, EPS_DECIMALS);

		// Don't move if we are already almost at destination
		const originDestToleranceRadius = 250; // [m]
		const originDestLinearDistance =
			2 *
			this.googleTiles.ellipsoid.calculateEffectiveRadius(destination.coords.lat()) *
			Math.tan(originDestAngularDistance / 2); // [m]
		const heightDiffTolerance = 2000; // [m]
		if (originDestLinearDistance < originDestToleranceRadius && descentHeight < heightDiffTolerance) {
			return;
		}

		const maxTotalAnimationDuration = 5; // [sec]
		const minClimbDescentAnimationDuration = 1.5;
		const maxClimbDescentAnimationDuration = maxTotalAnimationDuration / 2;
		const climbAnimationDuration =
			climbHeight === 0
				? 0
				: Math.min(
						pow2Animation(climbHeight / maxClimbAltitude) * maxClimbDescentAnimationDuration +
							minClimbDescentAnimationDuration,
						maxClimbDescentAnimationDuration
					);
		const descentAnimationDuration =
			descentHeight === 0
				? 0
				: Math.min(
						pow2Animation(descentHeight / maxClimbAltitude) * maxClimbDescentAnimationDuration +
							minClimbDescentAnimationDuration,
						maxClimbDescentAnimationDuration
					);
		const totalAnimationDuration = Math.min(
			Math.max(distancePercentage * maxTotalAnimationDuration, climbAnimationDuration + descentAnimationDuration),
			maxTotalAnimationDuration
		);
		const rotationDistance = haversineDistance(this.currentPosition, {
			lat: destination.coords.lat() * MathUtils.DEG2RAD,
			lon: destination.coords.lng() * MathUtils.DEG2RAD,
		});
		const descentAnimationDelayTime =
			rotationDistance < TOLERANCE_DISTANCE_COORDS_NO_WAIT_TO_DESCENT ? 0 : totalAnimationDuration / 2;

		this.raycaster.setFromCamera(REUSABLE_VECTOR2.set(0, 0), this.camera);
		const cameraGlobeIntersections: Intersection[] = [];
		this.googleTiles.group.raycast(this.raycaster, cameraGlobeIntersections);
		if (cameraGlobeIntersections.length > 0) {
			// TODO: What if multiple intersections?
			const globePointCenterScreen = cameraGlobeIntersections[0].point;
			this.pivotPoint.copy(globePointCenterScreen);
		} else {
			this.controls.getPivotPoint(this.pivotPoint);
		}
		const pivotRadius = REUSABLE_VECTOR3_1.subVectors(this.camera.position, this.pivotPoint).length();
		this.resetOrbitCameraPosition
			.copy(this.pivotPoint)
			.addScaledVector(REUSABLE_VECTOR3_2.copy(this.pivotPoint).normalize(), pivotRadius);

		getUpDirection(this.googleTiles.ellipsoid, this.pivotPoint, this.targetCameraUp);

		const pivotResetTl = () => {
			return gsap
				.timeline({ defaults: { duration: 1, ease: 'none' } })
				.eventCallback('onStart', () => {
					// Update camera up vector to reflect current rotation around pivot point
					this.controls.getCameraUpDirection(this.camera.up);
				})
				.to(
					this.camera.position,
					{
						x: this.resetOrbitCameraPosition.x,
						y: this.resetOrbitCameraPosition.y,
						z: this.resetOrbitCameraPosition.z,
					},
					0
				)
				.to(this.camera.up, { x: this.targetCameraUp.x, y: this.targetCameraUp.y, z: this.targetCameraUp.z }, 0)
				.eventCallback('onUpdate', () => {
					this.camera.lookAt(this.pivotPoint);
					this.renderingNeedsUpdate = true;
				})
				.eventCallback('onComplete', () => {
					// Reset camera up vector since it shall stay Object3D.DEFAULT_UP for GlobeControls
					this.camera.up.copy(Object3D.DEFAULT_UP);
					// Update currentPosition
					this.googleTiles.ellipsoid.getPositionToCartographic(
						threejsPositionToTiles(REUSABLE_VECTOR3_1.copy(this.camera.position)),
						this.currentPosition
					);
				});
		};
		const cameraTravelTl = () => {
			return gsap
				.timeline()
				.to(
					this.currentPosition,
					{
						precise: {
							lon: destination.coords.lng() * MathUtils.DEG2RAD,
							lat: destination.coords.lat() * MathUtils.DEG2RAD,
						},
						duration: totalAnimationDuration,
						ease:
							climbAnimationDuration === 0 &&
							rotationDistance < TOLERANCE_DISTANCE_COORDS_NO_WAIT_TO_DESCENT
								? 'power4.out'
								: 'power4.inOut',
					},
					0
				)
				.to(
					this.currentPosition,
					{
						height: this.currentPosition.height + climbHeight,
						duration: climbAnimationDuration,
						ease: 'power3.in',
					},
					'<'
				)
				.to(
					this.currentPosition,
					{ height: height, duration: descentAnimationDuration, ease: 'power3.out' },
					climbAnimationDuration === 0 ? descentAnimationDelayTime : '>' // Don't go down too quickly and give time to the user to see the globe rotating in case we are already super zoomed out.
				)
				.eventCallback('onUpdate', () => {
					this.moveCameraTo(this.currentPosition);
				})
				.eventCallback('onComplete', () => {
					this.googleDebugTilesPlugin.colorMode = 1;
					this.isControlsRotationReset = true;
				});
		};
		this.zoomToCoordsAnimationTl = gsap.timeline();
		if (!this.isControlsRotationReset) {
			this.zoomToCoordsAnimationTl.add(pivotResetTl());
		}
		this.zoomToCoordsAnimationTl.add(cameraTravelTl());
	}

	moveCameraTo(coords: { lon: number; lat: number; height: number }): void {
		tilesPositionToThreejs(
			this.googleTiles.ellipsoid.getCartographicToPosition(
				coords.lat,
				coords.lon,
				coords.height,
				this.camera.position
			)
		);
		this.camera.lookAt(0, 0, 0);
		this.renderingNeedsUpdate = true;
	}

	updateLayers($event: LayersSettings) {
		if ($event.googleTiles !== undefined) {
			if ($event.googleTiles.enabled !== undefined) {
				this.googleTiles.group.visible = $event.googleTiles.enabled;
			}
			if ($event.googleTiles.opacity !== undefined) {
				this.googleTilesOpacity = $event.googleTiles!.opacity!;
				updateObjectAndChildrenOpacity(this.googleTiles.group, this.googleTilesOpacity);
			}
		}
		if ($event.swisstopoBuildingsTiles !== undefined && $event.swisstopoBuildingsTiles.enabled !== undefined) {
			this.swisstopoBuildingsTiles.group.visible = $event.swisstopoBuildingsTiles.enabled;
		}
		if ($event.swisstopoVegetationTiles !== undefined && $event.swisstopoVegetationTiles.enabled !== undefined) {
			this.swisstopoVegetationTiles.group.visible = $event.swisstopoVegetationTiles.enabled;
		}
		if ($event.swisstopoNamesTiles !== undefined && $event.swisstopoNamesTiles.enabled !== undefined) {
			this.swisstopoNamesTiles.group.visible = $event.swisstopoNamesTiles.enabled;
		}

		this.renderingNeedsUpdate = true;
	}

	currentPositionLatLng(): LatLng {
		return { lat: this.currentPosition.lat * MathUtils.RAD2DEG, lng: this.currentPosition.lon * MathUtils.RAD2DEG };
	}

	private initGoogleTileset(target: TilesRenderer): void {
		target.errorTarget = 1;

		target.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: environment.GOOGLE_MAPS_3D_TILES_API_KEY }));
		target.registerPlugin(
			new BatchedTilesPlugin({
				renderer: this.renderer,
				instanceCount: 500,
				vertexCount: 750,
				indexCount: 2000,
				expandPercent: 0.25,
				maxInstanceCount: Infinity,
				discardOriginalContent: true,
				material: null,
				textureSize: null,
			})
		);
		target.registerPlugin(this.googleDebugTilesPlugin);
		this.googleDebugTilesPlugin.enabled = false;
		target.registerPlugin(new TileCompressionPlugin()); // TODO: Needed?
		target.registerPlugin(new UpdateOnChangePlugin());
		target.registerPlugin(new UnloadTilesPlugin());
		target.registerPlugin(new TilesFadePlugin());
		target.registerPlugin(new TileCreasedNormalsPlugin());

		const gltfLoader = new GLTFLoader(target.manager);
		gltfLoader.setDRACOLoader(this.dracoLoader);
		target.manager.addHandler(/\.gltf$/, gltfLoader);

		// Remove Google tiles in Switzerland to use swisstopo's better dataset there.
		const regionsPlugin = new LoadRegionPlugin();
		target.registerPlugin(regionsPlugin);
		regionsPlugin.addRegion(new OutsideSwitzerlandRegion(SWITZERLAND_REGION_CAMERA_ELEVATION_THRESHOLD));

		target.setCamera(this.camera);
		target.setResolutionFromRenderer(this.camera, this.renderer);

		this.earth.add(target.group);

		this.controls.setEllipsoid(target.ellipsoid, target.group);

		target.addEventListener('load-model', (o: { scene: Object3D; tile: Tile }) => {
			updateObjectAndChildrenOpacity(o.scene, this.googleTilesOpacity);
		});
		target.addEventListener('tile-visibility-change', (o: { scene: Object3D; tile: Tile; visible: boolean }) => {
			if (o.scene) {
				// NB: Apparently the update of 3d-tiles-renderer after 0.3.41 changed behavior in BatchedTilesPlugin so that the scene object might be null...
				updateObjectAndChildrenOpacity(o.scene, this.googleTilesOpacity);
			}
		});
		target.addEventListener('needs-update', () => {
			this.renderingNeedsUpdate = true;
		});
	}

	private initSwisstopo3DTileset(
		target: TilesRenderer,
		errorTarget: number,
		meshCustomizationCallback?: (mesh: Mesh) => void,
		overlaySwissimage = false
	): void {
		target.errorTarget = errorTarget;

		target.registerPlugin(new UpdateOnChangePlugin());
		target.registerPlugin(new UnloadTilesPlugin());
		target.registerPlugin(new TilesFadePlugin()); // TODO: Doesn't seem to have any noticeable impact
		if (overlaySwissimage) {
			target.registerPlugin(
				new ImageOverlayPlugin({
					renderer: this.renderer,
					enableTileSplitting: true,
					overlays: [
						new XYZTilesOverlay({
							url: SWISSTOPO_SWISSIMAGE_XYZ_URL,
							levels: 20,
							dimension: 256,
							color: 0xffffff,
							opacity: 1,
						}),
					],
				})
			);
		}

		const gltfLoader = new GLTFLoader(target.manager);
		gltfLoader.setDRACOLoader(this.dracoLoader);
		target.manager.addHandler(/\.gltf$/, gltfLoader);

		target.setCamera(this.camera);
		target.setResolutionFromRenderer(this.camera, this.renderer);

		// Share caches and queues between swisstopo tiles renderers
		target.lruCache = this.swisstopoBuildingsTiles.lruCache;
		target.downloadQueue = this.swisstopoBuildingsTiles.downloadQueue;
		target.parseQueue = this.swisstopoBuildingsTiles.parseQueue;
		target.processNodeQueue = this.swisstopoBuildingsTiles.processNodeQueue;

		this.earth.add(target.group);

		target.addEventListener('load-tile-set', (_o: { tileSet?: Object }) => {
			target.group.position.copy(SWISS_GEOID_ELLIPSOID_OFFSET);
		});
		target.addEventListener('load-model', (o: { scene: Object3D; tile: Tile }) => {
			o.scene.traverse(child => {
				if (isMesh(child)) {
					// Compute missing normals for proper lighting.
					child.geometry.computeVertexNormals();

					// Give a chance to caller to run customizations on the mesh.
					if (meshCustomizationCallback) {
						meshCustomizationCallback(child);
					}
				}
			});
		});
		target.addEventListener('needs-update', () => {
			this.renderingNeedsUpdate = true;
		});
		target.addEventListener('dispose-model', (o: { scene: Object3D }) => disposeManuallyCreatedMaterials(o.scene));
	}

	private initSwisstopoQuantizedTileset(target: TilesRenderer): void {
		target.errorTarget = 1;

		target.registerPlugin(new QuantizedMeshPlugin({}));
		target.registerPlugin(new UpdateOnChangePlugin());
		target.registerPlugin(new UnloadTilesPlugin());
		target.registerPlugin(new TilesFadePlugin());

		const debugPlugin = new DebugTilesPlugin({
			displayRegionBounds: true,
			colorMode: 9,
			customColorCallback: (tile, object) => {
				const [, zoomLevel] = tile.content!.uri.match(/\d{8}\/(\d+)\/\d+\/\d+\.terrain/)!;
				object.traverse(child => {
					if (isMesh(child)) {
						(child.material as MeshStandardMaterial).color.set(
							ZOOM_LEVEL_COLORS_DEBUG[parseInt(zoomLevel)]
						);
					}
				});
			},
		});
		target.registerPlugin(debugPlugin);
		debugPlugin.enabled = false;

		// Keep tiles only inside Switzerland.
		const regionsPlugin = new LoadRegionPlugin();
		target.registerPlugin(regionsPlugin);
		regionsPlugin.addRegion(new SwitzerlandRegion(SWITZERLAND_REGION_CAMERA_ELEVATION_THRESHOLD));

		// Texture with SWISSIMAGE // TODO: This ImageOverlayPlugin new approach seams to be less performant than with TextureOverlayPlugin. Considering reverting...
		target.registerPlugin(
			new ImageOverlayPlugin({
				renderer: this.renderer,
				enableTileSplitting: true,
				overlays: [
					new XYZTilesOverlay({
						url: SWISSTOPO_SWISSIMAGE_XYZ_URL,
						levels: 20,
						dimension: 256,
						color: 0xffffff,
						opacity: 1,
					}),
				],
			})
		);

		target.setCamera(this.camera);
		target.setResolutionFromRenderer(this.camera, this.renderer);

		this.earth.add(target.group);

		target.addEventListener('load-tile-set', () => {
			target.group.position.copy(SWISS_GEOID_ELLIPSOID_OFFSET);
		});
		target.addEventListener('load-model', (o: { scene: Object3D; tile: Tile }) => {
			o.scene.traverse(child => {
				if (isMesh(child)) {
					// We need to Use unlit material (e.g. MeshBasicMaterial) for proper albedo; required for atmosphere. However, ImageOverlayPlugin uses a StandardMeshMaterial with onBeforeCompile we cannot really migrate to a MeshBasicMaterial. So we keep the original material and just make it not affected by light.
					removeLightingFromMaterial(child.material as MeshStandardMaterial, this.renderer);
				}
			});
		});
		target.addEventListener('needs-update', () => {
			this.renderingNeedsUpdate = true;
		});
	}

	private initAtmosphere(): void {
		const atmosphereParameters = AtmosphereParameters.DEFAULT;
		atmosphereParameters.sunAngularRadius = 0.01;
		this.aerialPerspective = new AerialPerspectiveEffect(
			this.camera,
			{
				correctAltitude: true,
				correctGeometricError: true,
				albedoScale: 2 / Math.PI,
				transmittance: true,
				inscatter: true,
				sunLight: true,
				skyLight: true,
				sky: true,
				sun: true,
				moon: true,
				moonAngularRadius: 0.01,
				lunarRadianceScale: 10, // TODO: Possible to have the moon bring light to scene at night?
			},
			atmosphereParameters
		);

		// TODO: Fix stars which are not visible in the atmosphere effect. Must use StarsMaterial? Or is it related to https://github.com/takram-design-engineering/three-geospatial/issues/28?

		this.aerialPerspective.ellipsoidMatrix.copy(this.earth.matrixWorld).setPosition(0, 0, 0);
		const inverseEllipsoidMatrix = new Matrix4().copy(this.aerialPerspective.ellipsoidMatrix).invert();
		this.aerialPerspective.ellipsoidCenter
			.setFromMatrixPosition(this.earth.matrixWorld)
			.applyMatrix4(inverseEllipsoidMatrix);

		// Generate precomputed textures.
		const texturesGenerator = new PrecomputedTexturesGenerator(this.renderer);
		texturesGenerator.update().catch(error => {
			console.error(error);
		});
		Object.assign(this.aerialPerspective, texturesGenerator.textures);

		this.composer = new EffectComposer(this.renderer, {
			frameBufferType: HalfFloatType, // Use floating-point render buffer, as radiance/luminance is stored here.
			multisampling: 0,
		});
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		const normalPass = new NormalPass(this.scene, this.camera);
		this.aerialPerspective.normalBuffer = normalPass.texture;
		this.composer.addPass(normalPass);
		this.composer.addPass(new EffectPass(this.camera, this.aerialPerspective));
		this.composer.addPass(new EffectPass(this.camera, new LensFlareEffect())); // TODO: Looks like it doens't work.
		this.composer.addPass(new EffectPass(this.camera, new ToneMappingEffect({ mode: ToneMappingMode.AGX })));
		this.composer.addPass(new EffectPass(this.camera, new SMAAEffect()));
		this.composer.addPass(new EffectPass(this.camera, new DitheringEffect()));

		new DebugGui(
			this.renderer,
			this.swisstopoTerrainTiles,
			this.aerialPerspective,
			this.referenceDate,
			() => (this.renderingNeedsUpdate = true)
		);
	}

	private render(): void {
		requestAnimationFrame((_timestamp: DOMHighResTimeStamp) => {
			this.render();
		});

		this.stats.update();

		if (this.renderingNeedsUpdate) {
			console.log('RENDERING');
			this.renderingNeedsUpdate = false;

			this.controls.update();
			this.camera.updateMatrixWorld();

			if (this.googleTiles.hasCamera(this.camera) && this.googleTiles.group.visible) {
				this.googleTiles.update();
			}
			if (this.swisstopoBuildingsTiles.hasCamera(this.camera) && this.swisstopoBuildingsTiles.group.visible) {
				this.swisstopoBuildingsTiles.update();
			}
			if (this.swisstopoTlmTiles.hasCamera(this.camera) && this.swisstopoTlmTiles.group.visible) {
				this.swisstopoTlmTiles.update();
			}
			if (this.swisstopoVegetationTiles.hasCamera(this.camera) && this.swisstopoVegetationTiles.group.visible) {
				this.swisstopoVegetationTiles.update();
			}
			if (this.swisstopoNamesTiles.hasCamera(this.camera) && this.swisstopoNamesTiles.group.visible) {
				this.swisstopoNamesTiles.update();
			}
			if (this.swisstopoTerrainTiles.hasCamera(this.camera) && this.swisstopoTerrainTiles.group.visible) {
				this.swisstopoTerrainTiles.update();
			}

			if (this.aerialPerspective) {
				this.composer.passes.forEach(pass => {
					// Update effect materials with current camera settings
					if (pass.fullscreenMaterial instanceof EffectMaterial) {
						pass.fullscreenMaterial.adoptCameraSettings(this.camera);
					}
				});

				getSunDirectionECEF(this.referenceDate, this.sunDirection);
				getMoonDirectionECEF(this.referenceDate, this.moonDirection);

				this.aerialPerspective.sunDirection.copy(this.sunDirection);
				this.aerialPerspective.moonDirection.copy(this.moonDirection);

				this.composer.render();
			} else {
				this.renderer.render(this.scene, this.camera);
			}
		}
	}

	private onWindowResize(): void {
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		this.renderingNeedsUpdate = true;
	}
}
