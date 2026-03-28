import { Injectable, signal } from '@angular/core';
import { Ellipsoid, Tile, TilesRenderer } from '3d-tiles-renderer';
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
	WMTSCapabilitiesResult,
} from '3d-tiles-renderer/plugins';
import { Mesh, MeshStandardMaterial, Object3D } from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { environment } from '../../environments/environment';
import { SceneManagerService } from './scene-manager.service';
import { ModelTextureService } from './model-texture.service';
import { LayersSettings } from '../layers-toggle/layers-toggle.component';
import { removeLightingFromMaterial, updateObjectAndChildrenOpacity } from '../utils/graphics-utils';
import { disposeManuallyCreatedMaterials, TileCreasedNormalsPlugin } from '../utils/tiles-utils';
import { isMesh } from '../utils/three-type-guards';
import { SwitzerlandRegion } from '../utils/SwitzerlandRegion';
import { OutsideSwitzerlandRegion } from '../utils/OutsideSwitzerlandRegion';
import {
	ENABLE_DEBUG_PLUGIN,
	GIGABYTE_BYTES,
	GOOGLE_MAPS_2D_TILES_NAMES_STYLES,
	LARGE_PRIME_1,
	LARGE_PRIME_2,
	LARGE_PRIME_3,
	SWISSTOPO_BUILDINGS_3D_TILES_TILESET_URL,
	SWISSTOPO_NAMES_3D_TILES_TILESET_URL,
	SWISSTOPO_TERRAIN_3D_TILES_TILESET_URL,
	SWISSTOPO_TLM_3D_TILES_TILESET_URL,
	SWISSTOPO_VEGETATION_3D_TILES_TILESET_URL,
	SWISSTOPO_WMTS_CAPABILITIES_URL,
	SWISS_GEOID_ELLIPSOID_OFFSET,
	SWITZERLAND_REGION_CAMERA_ELEVATION_THRESHOLD,
	ZOOM_LEVEL_COLORS_DEBUG,
} from '../config/tiles.config';

@Injectable({ providedIn: 'root' })
export class TilesManagerService {
	swisstopoWMTSCapabilities = signal<WMTSCapabilitiesResult | null>(null);

	private googleTiles = new TilesRenderer();
	private swisstopoBuildingsTiles = new TilesRenderer(SWISSTOPO_BUILDINGS_3D_TILES_TILESET_URL);
	private swisstopoTlmTiles = new TilesRenderer(SWISSTOPO_TLM_3D_TILES_TILESET_URL);
	private swisstopoVegetationTiles = new TilesRenderer(SWISSTOPO_VEGETATION_3D_TILES_TILESET_URL);
	private swisstopoNamesTiles = new TilesRenderer(SWISSTOPO_NAMES_3D_TILES_TILESET_URL);
	private swisstopoTerrainTiles = new TilesRenderer(SWISSTOPO_TERRAIN_3D_TILES_TILESET_URL);

	private googleDebugTilesPlugin!: DebugTilesPlugin;

	private dracoLoader: DRACOLoader;
	private sceneManager!: SceneManagerService;

	private googleTilesOpacity = 1;
	private tilesRenderersInitialized = false;
	private pendingLayersSettingsUpdate: LayersSettings | null = null;

	private namesOverlay!: GoogleMapsOverlay;
	private swisstopoOverlay!: WMTSTilesOverlay;
	private googleTilesOverlayPlugin!: ImageOverlayPlugin;
	private swisstopoTerrainOverlayPlugin!: ImageOverlayPlugin;
	private swisstopo3DObjectOverlayPlugin!: ImageOverlayPlugin;

	constructor() {
		this.dracoLoader = new DRACOLoader();
		this.dracoLoader.setDecoderPath('libs/draco/gltf/');
		this.dracoLoader.preload();
	}

	async init(sceneManager: SceneManagerService, buildingTexture: ModelTextureService): Promise<void> {
		this.sceneManager = sceneManager;
		const renderer = sceneManager.renderer;

		this.initGoogleTileset(this.googleTiles);

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

		this.swisstopoWMTSCapabilities.set(
			await new WMTSCapabilitiesLoader().loadAsync(SWISSTOPO_WMTS_CAPABILITIES_URL)
		);
		this.swisstopoTerrainOverlayPlugin = new ImageOverlayPlugin({
			renderer,
			enableTileSplitting: true,
			overlays: [], // NB: swisstopoOverlay is added when selected layers init
		});
		this.swisstopo3DObjectOverlayPlugin = new ImageOverlayPlugin({
			renderer,
			enableTileSplitting: false,
			overlays: [], // NB: swisstopoOverlay is added when selected layers init
		});

		this.initSwisstopo3DTileset(
			this.swisstopoBuildingsTiles,
			40,
			buildingTexture.createBuildingMeshCustomizationCallback(renderer),
			true
		);
		this.initSwisstopo3DTileset(this.swisstopoTlmTiles, 100, buildingTexture.createTlmMeshCustomizationCallback());
		this.initSwisstopo3DTileset(
			this.swisstopoVegetationTiles,
			8,
			buildingTexture.createVegetationMeshCustomizationCallback()
		);
		//this.initSwisstopo3DTileset(this.swisstopoNamesTiles); // TODO: .vctr format not supported (yet). // TODO: Find most recent tileset (if it even exists?)
		this.initSwisstopoQuantizedTileset(this.swisstopoTerrainTiles);

		sceneManager.controls.setEllipsoid(this.googleTiles.ellipsoid, this.googleTiles.group);

		this.tilesRenderersInitialized = true;
		// Process delayed layers settings update.
		if (this.pendingLayersSettingsUpdate) {
			this.updateLayers(this.pendingLayersSettingsUpdate, new Date());
			this.pendingLayersSettingsUpdate = null;
		}
	}

	updateAllTiles(): void {
		const camera = this.sceneManager.camera;

		if (this.googleTiles.hasCamera(camera) && this.googleTiles.group.visible) {
			this.googleTiles.update();
		}
		if (this.swisstopoBuildingsTiles.hasCamera(camera) && this.swisstopoBuildingsTiles.group.visible) {
			this.swisstopoBuildingsTiles.update();
		}
		if (this.swisstopoTlmTiles.hasCamera(camera) && this.swisstopoTlmTiles.group.visible) {
			this.swisstopoTlmTiles.update();
		}
		if (this.swisstopoVegetationTiles.hasCamera(camera) && this.swisstopoVegetationTiles.group.visible) {
			this.swisstopoVegetationTiles.update();
		}
		if (this.swisstopoNamesTiles.hasCamera(camera) && this.swisstopoNamesTiles.group.visible) {
			this.swisstopoNamesTiles.update();
		}
		if (this.swisstopoTerrainTiles.hasCamera(camera) && this.swisstopoTerrainTiles.group.visible) {
			this.swisstopoTerrainTiles.update();
		}
	}

	updateLayers($event: LayersSettings, referenceDate: Date): void {
		if (!this.tilesRenderersInitialized) {
			// Wait for tiles renderers to be initialized before applying layers settings.
			this.pendingLayersSettingsUpdate = $event;
			return;
		}

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

		if ($event.swisstopoOverlay?.layer && $event.swisstopoOverlay?.timeDimension) {
			const timeDimension =
				$event.swisstopoOverlay.timeDimension === referenceDate.getFullYear().toString()
					? 'current'
					: $event.swisstopoOverlay.timeDimension; // Use "current" overlay if current year is selected. // TODO: Check if year dimension indeed exists in capabilities and if not, default to "current".
			const layer =
				timeDimension === 'current' && $event.swisstopoOverlay.layer === 'ch.swisstopo.swissimage-product'
					? 'ch.swisstopo.swissimage'
					: $event.swisstopoOverlay.layer;

			const newOverlay = new WMTSTilesOverlay({
				capabilities: this.swisstopoWMTSCapabilities(),
				layer,
				style: 'default',
				dimensions: { Time: timeDimension },
				color: 0xffffff,
				opacity: 1,
			});
			this.swisstopoTerrainOverlayPlugin?.addOverlay(newOverlay);

			// If exisiting overlay, wait for new overlay to be loaded before deleting the old one.
			if (this.swisstopoOverlay) {
				const cleanupOldOverlay = () => {
					this.swisstopoTerrainTiles.removeEventListener('needs-update', cleanupOldOverlay);
					this.swisstopoTerrainOverlayPlugin?.deleteOverlay(this.swisstopoOverlay);
					this.swisstopoOverlay = newOverlay;
				};
				this.swisstopoTerrainTiles.addEventListener('needs-update', cleanupOldOverlay);
			} else {
				this.swisstopoOverlay = newOverlay;
				this.swisstopo3DObjectOverlayPlugin?.addOverlay(newOverlay);
			}
		}

		this.sceneManager.renderingNeedsUpdate = true;
	}

	getEllipsoid(): Ellipsoid {
		return this.googleTiles.ellipsoid;
	}

	resetGoogleDebugColorMode(): void {
		if (this.googleDebugTilesPlugin) {
			this.googleDebugTilesPlugin.colorMode = 1;
		}
	}

	private initGoogleTileset(target: TilesRenderer): void {
		const renderer = this.sceneManager.renderer;
		const camera = this.sceneManager.camera;
		const earth = this.sceneManager.earth;

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
				renderer,
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
			renderer,
			enableTileSplitting: true,
			overlays: [], // Overlay is added dynamically based on user settings
		});
		target.registerPlugin(this.googleTilesOverlayPlugin);

		// Remove Google tiles in Switzerland to use swisstopo's better dataset there.
		const regionsPlugin = new LoadRegionPlugin();
		target.registerPlugin(regionsPlugin);
		regionsPlugin.addRegion(new OutsideSwitzerlandRegion(SWITZERLAND_REGION_CAMERA_ELEVATION_THRESHOLD));

		target.setCamera(camera);
		target.setResolutionFromRenderer(camera, renderer);

		earth.add(target.group);

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
			this.sceneManager.renderingNeedsUpdate = true;
		});
		target.addEventListener('needs-update', () => {
			this.sceneManager.renderingNeedsUpdate = true;
		});
		target.addEventListener('fade-change', () => {
			this.sceneManager.renderingNeedsUpdate = true;
		});
	}

	private initSwisstopo3DTileset(
		target: TilesRenderer,
		errorTarget: number,
		meshCustomizationCallback?: (mesh: Mesh) => void,
		overlaySwissimage = false
	): void {
		const renderer = this.sceneManager.renderer;
		const camera = this.sceneManager.camera;
		const earth = this.sceneManager.earth;

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

		target.setCamera(camera);
		target.setResolutionFromRenderer(camera, renderer);

		earth.add(target.group);

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
			this.sceneManager.renderingNeedsUpdate = true;
		});
		target.addEventListener('needs-update', () => {
			this.sceneManager.renderingNeedsUpdate = true;
		});
		target.addEventListener('fade-change', () => {
			this.sceneManager.renderingNeedsUpdate = true;
		});
		target.addEventListener('dispose-model', (o: { scene: Object3D }) => disposeManuallyCreatedMaterials(o.scene));
	}

	private initSwisstopoQuantizedTileset(target: TilesRenderer): void {
		const renderer = this.sceneManager.renderer;
		const camera = this.sceneManager.camera;
		const earth = this.sceneManager.earth;

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

		target.setCamera(camera);
		target.setResolutionFromRenderer(camera, renderer);

		earth.add(target.group);

		target.addEventListener('load-tileset', () => {
			target.group.position.copy(SWISS_GEOID_ELLIPSOID_OFFSET);
		});
		target.addEventListener('load-model', (o: { scene: Object3D; tile: Tile }) => {
			o.scene.traverse(child => {
				if (isMesh(child)) {
					// We need to Use unlit material (e.g. MeshBasicMaterial) for proper albedo; required for atmosphere. However, ImageOverlayPlugin uses a StandardMeshMaterial with onBeforeCompile we cannot really migrate to a MeshBasicMaterial. So we keep the original material and just make it not affected by light.
					removeLightingFromMaterial(child.material as MeshStandardMaterial, renderer);
				}
			});
		});
		target.addEventListener('needs-render', () => {
			this.sceneManager.renderingNeedsUpdate = true;
		});
		target.addEventListener('needs-update', () => {
			this.sceneManager.renderingNeedsUpdate = true;
		});
		target.addEventListener('fade-change', () => {
			this.sceneManager.renderingNeedsUpdate = true;
		});
	}
}
