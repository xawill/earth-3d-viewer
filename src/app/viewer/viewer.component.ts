import { Component, ElementRef, ViewChild } from '@angular/core';
import { GlobeControls, Tile, TilesRenderer, WGS84_RADIUS } from '3d-tiles-renderer';
import {
	GoogleCloudAuthPlugin,
	BatchedTilesPlugin,
	TileCompressionPlugin,
	DebugTilesPlugin,
	QuantizedMeshPlugin,
	LoadRegionPlugin,
	ImageOverlayPlugin,
	WMTSTilesOverlay,
	UnloadTilesPlugin,
	TilesFadePlugin,
	GLTFExtensionsPlugin,
	GoogleMapsOverlay,
	WMTSCapabilitiesLoader,
} from '3d-tiles-renderer/plugins';
import {
	Group,
	Intersection,
	MathUtils,
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
	DataArrayTexture,
	LinearFilter,
	LinearMipmapLinearFilter,
	RGBAFormat,
	UnsignedByteType,
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
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
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
import { GOOGLE_MAPS_2D_TILES_NAMES_STYLES } from '../config/tiles.config';

const ENABLE_DEBUG_PLUGIN = false;

const GIGABYTE_BYTES = 2 ** 30;
const LARGE_PRIME_1 = 7381;
const LARGE_PRIME_2 = 1931;
const LARGE_PRIME_3 = 8349;

const SWISSTOPO_BUILDINGS_3D_TILES_TILESET_URL =
	'https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json';
const SWISSTOPO_TLM_3D_TILES_TILESET_URL = 'https://3d.geo.admin.ch/ch.swisstopo.swisstlm3d.3d/v1/tileset.json';
const SWISSTOPO_VEGETATION_3D_TILES_TILESET_URL = 'https://3d.geo.admin.ch/ch.swisstopo.vegetation.3d/v1/tileset.json';
const SWISSTOPO_NAMES_3D_TILES_TILESET_URL =
	'https://3d.geo.admin.ch/3d-tiles/ch.swisstopo.swissnames3d.3d/20180716/tileset.json';
const SWISSTOPO_TERRAIN_3D_TILES_TILESET_URL = 'https://3d.geo.admin.ch/ch.swisstopo.terrain.3d/v1/layer.json';
const SWISSTOPO_SWISSIMAGE_GET_CAPABILITIES_URL = 'https://wmts.geo.admin.ch/EPSG/3857/1.0.0/WMTSCapabilities.xml';

// TODO: Au clic, date d'image: https://api3.geo.admin.ch/rest/services/all/MapServer/identify?geometry=678250,213000&geometryFormat=geojson&geometryType=esriGeometryPoint&imageDisplay=1391,1070,96&lang=fr&layers=all:ch.swisstopo.images-swissimage-dop10.metadata&mapExtent=100,100,100,100&returnGeometry=true&tolerance=5

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
const REUSABLE_MATRIX4 = new Matrix4();

const BUILDING_FACADE_TEXTURE_URLS = [
	'sketchuptextureclub/7_wall cladding stone texture-seamless.jpg',
	'sketchuptextureclub/11_wall cladding stone texture-seamless.jpg',
	'sketchuptextureclub/25_wall cladding stone texture-seamless.jpg',
	'sketchuptextureclub/36_wall cladding stone granite texture-seamless.jpg',
	'sketchuptextureclub/80_wall cladding stone texture-seamless.jpg',
	'sketchuptextureclub/112_wall cladding stone modern architecture texture-seamless.jpg',
	'sketchuptextureclub/116_wall cladding stone modern architecture texture-seamless.jpg',
	'sketchuptextureclub/142_wall cladding stone porfido texture-seamless.jpg',
	'sketchuptextureclub/161_wall cladding stone porfido texture-seamless.jpg',
	'sketchuptextureclub/214_wall cladding flagstone porfido texture-seamless.jpg',
	'sketchuptextureclub/217_wall cladding flagstone porfido texture-seamless.jpg',
	'sketchuptextureclub/237_wall cladding stone mixed size-seamless.jpg',
	'sketchuptextureclub/265_wall cladding stone mixed size-seamless.jpg',
	'sketchuptextureclub/314_silver travertine wall cladding texture-seamless.jpg',
	'sketchuptextureclub/340_stones wall cladding texture-seamless.jpg',
];
const BUILDING_FACADE_TEXTURE_SIZE = 1024; // [px]

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
	styleUrl: './viewer.component.css',
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

	private referenceDate = new Date().setHours(12, 0, 0, 0); // Today at noon // TODO: Add UI to set date/time.

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

	private googleTiles = new TilesRenderer();
	private swisstopoBuildingsTiles = new TilesRenderer(SWISSTOPO_BUILDINGS_3D_TILES_TILESET_URL);
	private swisstopoTlmTiles = new TilesRenderer(SWISSTOPO_TLM_3D_TILES_TILESET_URL);
	private swisstopoVegetationTiles = new TilesRenderer(SWISSTOPO_VEGETATION_3D_TILES_TILESET_URL);
	private swisstopoNamesTiles = new TilesRenderer(SWISSTOPO_NAMES_3D_TILES_TILESET_URL);
	private swisstopoTerrainTiles = new TilesRenderer(SWISSTOPO_TERRAIN_3D_TILES_TILESET_URL);

	private namesOverlay!: GoogleMapsOverlay;
	private swissimageOverlay!: WMTSTilesOverlay;

	private buildingFacadeTexturesArray!: DataArrayTexture;
	private buildingFacadeTexturesMaterial = new MeshBasicMaterial({
		// Use unlit material (MeshBasicMaterial) for proper albedo; required for atmosphere.
		color: 0xffffff,
	});

	private googleDebugTilesPlugin!: DebugTilesPlugin;
	private googleTilesOverlayPlugin!: ImageOverlayPlugin;
	private swisstopoTerrainOverlayPlugin!: ImageOverlayPlugin;
	private swisstopo3DObjectOverlayPlugin!: ImageOverlayPlugin;

	private googleTilesOpacity = 1;

	@ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;

	currentPosition: LatLon & { height: number } = { lon: 0, lat: 0, height: 0 }; // [rad, rad, m]

	constructor() {
		this.dracoLoader = new DRACOLoader();
		this.dracoLoader.setDecoderPath('libs/draco/gltf/');
		this.dracoLoader.preload();

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

	async ngAfterViewInit() {
		this.scene = new Scene();

		this.renderer = new WebGLRenderer({
			powerPreference: 'high-performance',
			antialias: true,
			stencil: false,
			depth: false,
			logarithmicDepthBuffer: true,
			canvas: this.canvas.nativeElement,
		});
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		//this.renderer.localClippingEnabled = true;
		this.renderer.toneMapping = NoToneMapping;
		this.renderer.toneMappingExposure = 6;
		// TODO: Properly handle shadows with atmosphere (cast/receive shadows don't seem to work anymore).

		this.camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, WGS84_RADIUS * 2);
		//this.scene.add(this.camera);

		this.composer = new EffectComposer(this.renderer, {
			frameBufferType: HalfFloatType, // Use floating-point render buffer, as radiance/luminance is stored here.
			multisampling: 0,
		});
		this.composer.addPass(new RenderPass(this.scene, this.camera));

		this.initBuildingFacadeTextures();

		this.controls = new GlobeControls(this.scene, this.camera, this.renderer.domElement);
		this.controls.enableDamping = false;
		this.controls.adjustHeight = false;
		this.controls.maxAltitude = MathUtils.degToRad(90);
		this.controls.minDistance = 0;

		// TODO: Filter raycasting so that if tiles are hidden they are not hit. See https://github.com/NASA-AMMOS/3DTilesRendererJS/pull/1261#discussion_r2274897359
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

		this.namesOverlay = new GoogleMapsOverlay({
			apiToken: environment.GOOGLE_MAPS_3D_TILES_API_KEY,
			autoRefreshToken: true,
			sessionOptions: {
				mapType: 'roadmap',
				language: 'fr-CH',
				region: 'CH',
				scale: 'scaleFactor4x',
				highDpi: true,
				styles: GOOGLE_MAPS_2D_TILES_NAMES_STYLES,
			},
			color: 0xffffff,
			opacity: 1,
		});

		this.swissimageOverlay = new WMTSTilesOverlay({
			// Max zoom level is 20. To test/debug tiles indexing: https://codepen.io/xawill/pen/Wbrveqb
			// url: "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/{Time}/3857/{TileMatrix}/{TileCol}/{TileRow}.jpeg",
			capabilities: await new WMTSCapabilitiesLoader().loadAsync(SWISSTOPO_SWISSIMAGE_GET_CAPABILITIES_URL),
			layer: 'ch.swisstopo.swissimage', // 			layer: 'ch.swisstopo.pixelkarte-farbe',
			style: 'default',
			dimensions: { Time: 'current' },
			color: 0xffffff,
			opacity: 1,
		});
		this.swisstopoTerrainOverlayPlugin = new ImageOverlayPlugin({
			renderer: this.renderer,
			enableTileSplitting: true,
			overlays: [this.swissimageOverlay], // Texture with SWISSIMAGE
		});
		this.swisstopo3DObjectOverlayPlugin = new ImageOverlayPlugin({
			renderer: this.renderer,
			enableTileSplitting: false,
			overlays: [this.swissimageOverlay], // Texture with SWISSIMAGE
		});

		this.initGoogleTileset(this.googleTiles);
		this.initSwisstopo3DTileset(
			this.swisstopoBuildingsTiles,
			40,
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
					const batchIds = mesh.geometry.getAttribute('_batchid') as BufferAttribute;

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

						// Offset batchId per tile, to further randomize facade textures accross tiles.
						batchIds.setX(vertexIdx, batchIds.getX(vertexIdx) + mesh.geometry.userData['tileOffset']);
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

					mesh.material = this.buildingFacadeTexturesMaterial;
				} else {
					// We need to use unlit material (e.g. MeshBasicMaterial) for proper albedo; required for atmosphere. However, ImageOverlayPlugin uses a StandardMeshMaterial with onBeforeCompile we cannot really migrate to a MeshBasicMaterial. So we keep the original material and just make it not affected by light.
					removeLightingFromMaterial(mesh.material as MeshStandardMaterial, this.renderer);
				}
			},
			true
		);
		this.initSwisstopo3DTileset(this.swisstopoTlmTiles, 100, async (mesh: Mesh) => {
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

		this.controls.setEllipsoid(this.googleTiles.ellipsoid, this.googleTiles.group);

		// Set init camera position
		this.currentPosition.lon = DEFAULT_START_COORDS.lng * MathUtils.DEG2RAD;
		this.currentPosition.lat = DEFAULT_START_COORDS.lat * MathUtils.DEG2RAD;
		this.currentPosition.height = HEIGHT_FULL_GLOBE_VISIBLE;
		this.moveCameraTo(this.currentPosition);

		this.onWindowResize();
		window.addEventListener('resize', () => this.onWindowResize(), false);

		this.earth.updateWorldMatrix(true, true);

		this.initAtmosphere().then(() => this.render(true));
		/*.then(() => {
				new DebugGui(
					this.renderer,
					this.camera,
					this.googleTiles,
					this.swisstopoTerrainTiles,
					this.swisstopoBuildingsTiles,
					this.swisstopoTlmTiles,
					this.swisstopoVegetationTiles,
					this.aerialPerspective,
					this.referenceDate,
					() => (this.renderingNeedsUpdate = true)
				);
			})*/
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
		if ($event.googleTiles?.enabled === true) {
			this.googleTiles.group.visible = true;
		} else if ($event.googleTiles?.enabled === false) {
			this.googleTiles.group.visible = false;
			// TODO: Dispose tiles?
		}
		if ($event.googleTiles?.opacity !== undefined) {
			this.googleTilesOpacity = $event.googleTiles!.opacity!;
			updateObjectAndChildrenOpacity(this.googleTiles.group, this.googleTilesOpacity);
		}

		if ($event.swisstopoBuildingsTiles?.enabled === true) {
			this.swisstopoBuildingsTiles.group.visible = true;
		} else if ($event.swisstopoBuildingsTiles?.enabled === false) {
			this.swisstopoBuildingsTiles.group.visible = false;
			// TODO: Dispose tiles
		}

		if ($event.swisstopoVegetationTiles?.enabled === true) {
			this.swisstopoVegetationTiles.group.visible = true;
		} else if ($event.swisstopoVegetationTiles?.enabled === false) {
			this.swisstopoVegetationTiles.group.visible = false;
			// TODO: Dispose tiles
		}

		if ($event.adminOverlay?.enabled === true) {
			this.swisstopoNamesTiles.group.visible = true;
			this.googleTilesOverlayPlugin?.addOverlay(this.namesOverlay);
			this.swisstopoTerrainOverlayPlugin?.addOverlay(this.namesOverlay);
		} else if ($event.adminOverlay?.enabled === false) {
			this.swisstopoNamesTiles.group.visible = false;
			this.googleTilesOverlayPlugin?.deleteOverlay(this.namesOverlay);
			this.swisstopoTerrainOverlayPlugin?.deleteOverlay(this.namesOverlay);
			// TODO: Dispose tiles
		}

		this.renderingNeedsUpdate = true;
	}

	currentPositionLatLng(): LatLng {
		return { lat: this.currentPosition.lat * MathUtils.RAD2DEG, lng: this.currentPosition.lon * MathUtils.RAD2DEG };
	}

	private initGoogleTileset(target: TilesRenderer): void {
		target.errorTarget = 20;

		target.optimizedLoadStrategy = true;
		target.loadSiblings = false; // Seems to perform better (higher fps)

		target.lruCache.maxSize = Infinity;
		target.lruCache.minSize = 0;
		target.lruCache.maxBytesSize = 0.8 * GIGABYTE_BYTES;
		target.lruCache.minBytesSize = target.lruCache.maxBytesSize * (2 / 3);
		target.lruCache.unloadPercent = 0.1;
		target.downloadQueue.maxJobs *= 10;
		target.parseQueue.maxJobs *= 10;
		target.processNodeQueue.maxJobs *= 10;

		this.googleDebugTilesPlugin = new DebugTilesPlugin({
			maxDebugError: 100,
			maxDebugDistance: 100,
			displayBoxBounds: true,
		});

		target.registerPlugin(
			new GoogleCloudAuthPlugin({
				apiToken: environment.GOOGLE_MAPS_3D_TILES_API_KEY,
				useRecommendedSettings: false,
			})
		);
		target.registerPlugin(new TileCompressionPlugin()); // TODO: Needed?
		target.registerPlugin(new UnloadTilesPlugin());
		target.registerPlugin(new TilesFadePlugin());
		target.registerPlugin(
			new GLTFExtensionsPlugin({
				dracoLoader: this.dracoLoader,
			})
		);
		target.registerPlugin(
			new BatchedTilesPlugin({
				renderer: this.renderer,
				instanceCount: 250,
				vertexCount: 750,
				indexCount: 2000,
				expandPercent: 0.25,
				maxInstanceCount: Infinity,
				discardOriginalContent: false, // Set this to false if using UnloadTilesPlugin
				material: null,
				textureSize: null,
			})
		);
		target.registerPlugin(new TileCreasedNormalsPlugin());
		if (ENABLE_DEBUG_PLUGIN) {
			target.registerPlugin(this.googleDebugTilesPlugin);
		}

		this.googleTilesOverlayPlugin = new ImageOverlayPlugin({
			renderer: this.renderer,
			enableTileSplitting: true,
			overlays: [], // Overlay is added dynamically based on user settings
		});
		target.registerPlugin(this.googleTilesOverlayPlugin);

		// Remove Google tiles in Switzerland to use swisstopo's better dataset there.
		const regionsPlugin = new LoadRegionPlugin();
		target.registerPlugin(regionsPlugin);
		regionsPlugin.addRegion(new OutsideSwitzerlandRegion(SWITZERLAND_REGION_CAMERA_ELEVATION_THRESHOLD));

		target.setCamera(this.camera);
		target.setResolutionFromRenderer(this.camera, this.renderer);

		this.earth.add(target.group);

		target.addEventListener('load-model', (o: { scene: Object3D; tile: Tile }) => {
			updateObjectAndChildrenOpacity(o.scene, this.googleTilesOpacity);
		});
		target.addEventListener('tile-visibility-change', (o: { scene: Object3D; tile: Tile; visible: boolean }) => {
			if (o.scene) {
				// NB: Apparently the update of 3d-tiles-renderer after 0.3.41 changed behavior in BatchedTilesPlugin so that the scene object might be null...
				updateObjectAndChildrenOpacity(o.scene, this.googleTilesOpacity);
			}
		});
		target.addEventListener('needs-render', () => {
			this.renderingNeedsUpdate = true;
		});
		target.addEventListener('needs-update', () => {
			this.renderingNeedsUpdate = true;
		});
		target.addEventListener('fade-change', () => {
			this.renderingNeedsUpdate = true;
		});
	}

	private async initBuildingFacadeTextures() {
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

			shader.vertexShader = shader.vertexShader
				.replace(
					'#include <common>',
					`
					#include <common>
					attribute float _batchid;

					varying float batchid;
					varying vec2 vUvCustom;
					`
				)
				.replace(
					'#include <uv_vertex>',
					`
					#include <uv_vertex>
					batchid = _batchid;
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

					varying float batchid;
					varying vec2 vUvCustom;
					`
				)
				.replace(
					'#include <map_fragment>',
					`
					int texIndex = int(mod(float(batchid), float(textureCount)));

					vec4 texColor = texture(
						buildingTextures,
						vec3(vUvCustom, float(texIndex))
					);

					diffuseColor *= texColor;
					`
				);
		};
	}

	private initSwisstopo3DTileset(
		target: TilesRenderer,
		errorTarget: number,
		meshCustomizationCallback?: (mesh: Mesh) => void,
		overlaySwissimage = false
	): void {
		target.errorTarget = errorTarget;

		target.optimizedLoadStrategy = true;
		target.loadSiblings = true; // Seems to perform better (higher fps)

		// Share caches and queues between swisstopo tiles renderers
		target.lruCache = this.swisstopoBuildingsTiles.lruCache;
		target.downloadQueue = this.swisstopoBuildingsTiles.downloadQueue;
		target.parseQueue = this.swisstopoBuildingsTiles.parseQueue;
		target.processNodeQueue = this.swisstopoBuildingsTiles.processNodeQueue;

		target.lruCache.maxSize = Infinity;
		//target.lruCache.minSize = 0;
		target.lruCache.maxBytesSize = 1.5 * GIGABYTE_BYTES;
		target.lruCache.minBytesSize = target.lruCache.maxBytesSize * (2 / 3);
		target.lruCache.unloadPercent = 0.1;
		target.downloadQueue.maxJobs *= 10;
		target.parseQueue.maxJobs *= 10;
		target.processNodeQueue.maxJobs *= 10;

		target.registerPlugin(
			new GLTFExtensionsPlugin({
				dracoLoader: this.dracoLoader,
			})
		);
		target.registerPlugin(new UnloadTilesPlugin());
		target.registerPlugin(new TilesFadePlugin()); // TODO: Doesn't seem to have any noticeable impact
		if (overlaySwissimage) {
			// TODO: Check how to reuse plugins between tiles sets; currently unsupported (see https://github.com/NASA-AMMOS/3DTilesRendererJS/issues/1264).
			target.registerPlugin(this.swisstopo3DObjectOverlayPlugin);
		}

		target.setCamera(this.camera);
		target.setResolutionFromRenderer(this.camera, this.renderer);

		this.earth.add(target.group);

		target.addEventListener('load-tileset', (_o: { tileSet?: Object }) => {
			target.group.position.copy(SWISS_GEOID_ELLIPSOID_OFFSET);
		});
		target.addEventListener('load-model', (o: { scene: Object3D; tile: Tile }) => {
			const [, tileZoomLevel, tileIndexX, tileIndexY] = o.tile.content!.uri.match(/(\d+)\/(\d+)\/(\d+)\./)!;
			const tileOffset = // Produce pseudo-random but deterministic integer per tile from its coordinates
				(parseInt(tileIndexX) * LARGE_PRIME_1) ^
				(parseInt(tileIndexY) * LARGE_PRIME_2) ^
				(parseInt(tileZoomLevel) * LARGE_PRIME_3);

			o.scene.traverse(child => {
				if (isMesh(child)) {
					// Compute missing normals for proper lighting.
					child.geometry.computeVertexNormals();
					child.geometry.userData['tileOffset'] = tileOffset;

					// Give a chance to caller to run customizations on the mesh.
					if (meshCustomizationCallback) {
						meshCustomizationCallback(child);
					}
				}
			});
		});
		target.addEventListener('needs-render', () => {
			this.renderingNeedsUpdate = true;
		});
		target.addEventListener('needs-update', () => {
			this.renderingNeedsUpdate = true;
		});
		target.addEventListener('fade-change', () => {
			this.renderingNeedsUpdate = true;
		});
		target.addEventListener('dispose-model', (o: { scene: Object3D }) => disposeManuallyCreatedMaterials(o.scene));
	}

	private initSwisstopoQuantizedTileset(target: TilesRenderer): void {
		target.errorTarget = 2;

		target.optimizedLoadStrategy = true;
		target.loadSiblings = true; // Seems to perform better (higher fps)

		target.lruCache.maxSize = Infinity;
		//target.lruCache.minSize = 0; // FIX: Bug in the library when minSize is too low. Terrain not loading.
		target.lruCache.maxBytesSize = 1.5 * GIGABYTE_BYTES;
		target.lruCache.minBytesSize = target.lruCache.maxBytesSize * (2 / 3);
		target.lruCache.unloadPercent = 0.2;
		target.downloadQueue.maxJobs = 30;
		target.parseQueue.maxJobs = 10;
		target.processNodeQueue.maxJobs = 10;

		target.registerPlugin(new QuantizedMeshPlugin({ useRecommendedSettings: false }));
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
		if (ENABLE_DEBUG_PLUGIN) {
			target.registerPlugin(debugPlugin);
		}

		// Keep tiles only inside Switzerland.
		const regionsPlugin = new LoadRegionPlugin();
		target.registerPlugin(regionsPlugin);
		regionsPlugin.addRegion(new SwitzerlandRegion(SWITZERLAND_REGION_CAMERA_ELEVATION_THRESHOLD));

		// TODO: This ImageOverlayPlugin new approach seams to be less performant than with TextureOverlayPlugin. Considering reverting...
		target.registerPlugin(this.swisstopoTerrainOverlayPlugin);

		target.setCamera(this.camera);
		target.setResolutionFromRenderer(this.camera, this.renderer);

		this.earth.add(target.group);

		target.addEventListener('load-tileset', () => {
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
		target.addEventListener('needs-render', () => {
			this.renderingNeedsUpdate = true;
		});
		target.addEventListener('needs-update', () => {
			this.renderingNeedsUpdate = true;
		});
		target.addEventListener('fade-change', () => {
			this.renderingNeedsUpdate = true;
		});
	}

	private async initAtmosphere(): Promise<void> {
		// Generate precomputed textures.
		const texturesGenerator = new PrecomputedTexturesGenerator(this.renderer);
		await texturesGenerator.update().catch(error => {
			console.error(error);
		});

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
				lunarRadianceScale: 10, // TODO: Possible to have the moon bring light to scene at night? See https://github.com/takram-design-engineering/three-geospatial/issues/80
			},
			atmosphereParameters
		);

		// TODO: Fix stars which are not visible in the atmosphere effect. Must use StarsMaterial? Or is it related to https://github.com/takram-design-engineering/three-geospatial/issues/28?

		Object.assign(this.aerialPerspective, texturesGenerator.textures);

		const normalPass = new NormalPass(this.scene, this.camera);
		this.aerialPerspective.normalBuffer = normalPass.texture;
		this.composer.addPass(normalPass);
		this.composer.addPass(new EffectPass(this.camera, this.aerialPerspective));
		this.composer.addPass(new EffectPass(this.camera, new LensFlareEffect()));
		this.composer.addPass(new EffectPass(this.camera, new ToneMappingEffect({ mode: ToneMappingMode.AGX })));
		this.composer.addPass(new EffectPass(this.camera, new SMAAEffect()));
		this.composer.addPass(new EffectPass(this.camera, new DitheringEffect()));
	}

	private render(force = false): void {
		requestAnimationFrame((_timestamp: DOMHighResTimeStamp) => {
			this.render();
		});

		this.stats.update();

		if (this.renderingNeedsUpdate || force) {
			// TODO: Have a way to prevent updating tilesets during big position changes like after entering a new location in the search bar (at least at the beginning of the animation). This probably triggers a lot of useless tiles loading.
			//console.log('RENDERING');
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

			getSunDirectionECEF(this.referenceDate, this.sunDirection);
			getMoonDirectionECEF(this.referenceDate, this.moonDirection);

			this.composer.passes.forEach(pass => {
				// Update effect materials with current camera settings
				if (pass.fullscreenMaterial instanceof EffectMaterial) {
					pass.fullscreenMaterial.adoptCameraSettings(this.camera);
				}
			});

			if (this.aerialPerspective) {
				this.aerialPerspective.sunDirection.copy(this.sunDirection);
				this.aerialPerspective.moonDirection.copy(this.moonDirection);

				this.aerialPerspective.ellipsoidMatrix.copy(this.earth.matrixWorld).setPosition(0, 0, 0);
				const inverseEllipsoidMatrix = REUSABLE_MATRIX4.copy(this.aerialPerspective.ellipsoidMatrix).invert();
				this.aerialPerspective.ellipsoidCenter
					.setFromMatrixPosition(this.earth.matrixWorld)
					.applyMatrix4(inverseEllipsoidMatrix);
			}

			this.composer.render();
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
