import { Injectable, inject, signal } from '@angular/core';
import { BatchTable, Ellipsoid, Tile, TilesRenderer } from '3d-tiles-renderer';
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
	XYZTilesPlugin,
	UpdateOnChangePlugin,
} from '3d-tiles-renderer/plugins';
import { Mesh, MeshStandardMaterial, Object3D, Raycaster } from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { environment } from '../../environments/environment';
import { SceneManagerService } from './scene-manager.service';
import { AtmosphereService } from './atmosphere.service';
import { ModelTextureService } from './model-texture.service';
import { LayersSettings } from '../layers-toggle/layers-toggle.component';
import { removeLightingFromMaterial, updateObjectAndChildrenOpacity } from '../utils/graphics-utils';
import { disposeManuallyCreatedMaterials, TileCreasedNormalsPlugin } from '../utils/tiles-utils';
import { isMesh } from '../utils/three-type-guards';
import { SwitzerlandRegion } from '../utils/SwitzerlandRegion';
import { OutsideSwitzerlandRegion } from '../utils/OutsideSwitzerlandRegion';
import { SnowImageOverlay } from '../utils/snow-image-overlay';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import {
	DEFAULT_ADDITIONAL_LAYER_OPACITY,
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
	VIIRS_BLACK_MARBLE_TILES_URL,
	ZOOM_LEVEL_COLORS_DEBUG,
} from '../config/tiles.config';
import { RbdService } from './rbd.service';
import { buildBuildingName, HighlightedBuildingInfo } from '../viewer/building-info.presenter';

@Injectable({ providedIn: 'root' })
export class TilesManagerService {
	swisstopoWMTSCapabilities = signal<WMTSCapabilitiesResult | null>(null);

	private googleTiles = new TilesRenderer();
	private swisstopoBuildingsTiles = new TilesRenderer(SWISSTOPO_BUILDINGS_3D_TILES_TILESET_URL);
	private swisstopoTlmTiles = new TilesRenderer(SWISSTOPO_TLM_3D_TILES_TILESET_URL);
	private swisstopoVegetationTiles = new TilesRenderer(SWISSTOPO_VEGETATION_3D_TILES_TILESET_URL);
	private swisstopoNamesTiles = new TilesRenderer(SWISSTOPO_NAMES_3D_TILES_TILESET_URL);
	private swisstopoTerrainTiles = new TilesRenderer(SWISSTOPO_TERRAIN_3D_TILES_TILESET_URL);
	private blackMarbleTiles = new TilesRenderer();

	private googleDebugTilesPlugin!: DebugTilesPlugin;

	private dracoLoader: DRACOLoader;
	private sceneManager!: SceneManagerService;

	private googleTilesOpacity = 1;
	private tilesRenderersInitialized = false;
	private pendingLayersSettingsUpdate: LayersSettings | null = null;

	private namesOverlay!: GoogleMapsOverlay;
	private swisstopoBaseOverlay: { overlay: WMTSTilesOverlay; key: string } | null = null;
	private additionalOverlay: { overlay: WMTSTilesOverlay | SnowImageOverlay; key: string } | null = null;
	private snowOverlay = new SnowImageOverlay({ opacity: DEFAULT_ADDITIONAL_LAYER_OPACITY });
	private googleTilesOverlayPlugin!: ImageOverlayPlugin;
	private swisstopoTerrainOverlayPlugin!: ImageOverlayPlugin;
	private swisstopo3DObjectOverlayPlugin!: ImageOverlayPlugin;

	private atmosphereService = inject(AtmosphereService);
	private rbdService = inject(RbdService);

	constructor() {
		this.dracoLoader = new DRACOLoader();
		this.dracoLoader.setDecoderPath('libs/draco/gltf/');
		this.dracoLoader.preload();
	}

	async init(sceneManager: SceneManagerService, buildingTexture: ModelTextureService): Promise<void> {
		this.sceneManager = sceneManager;

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
			renderer: this.sceneManager.renderer,
			enableTileSplitting: true,
			overlays: [], // NB: swisstopoOverlay is added when selected layers init
		});
		this.swisstopo3DObjectOverlayPlugin = new ImageOverlayPlugin({
			renderer: this.sceneManager.renderer,
			enableTileSplitting: false,
			overlays: [], // NB: swisstopoOverlay is added when selected layers init
		});

		this.initSwisstopo3DTileset(
			this.swisstopoBuildingsTiles,
			40,
			buildingTexture.createBuildingMeshCustomizationCallback(this.sceneManager.renderer),
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
		this.initBlackMarbleTileset(this.blackMarbleTiles);

		sceneManager.controls.setEllipsoid(this.googleTiles.ellipsoid, this.googleTiles.group);

		this.tilesRenderersInitialized = true;
		// Process delayed layers settings update.
		if (this.pendingLayersSettingsUpdate) {
			this.updateLayers(this.pendingLayersSettingsUpdate, new Date());
			this.pendingLayersSettingsUpdate = null;
		}
	}

	updateAllTiles(): void {
		if (this.googleTiles.hasCamera(this.sceneManager.camera) && this.googleTiles.group.visible) {
			this.googleTiles.update();
		}
		if (
			this.swisstopoBuildingsTiles.hasCamera(this.sceneManager.camera) &&
			this.swisstopoBuildingsTiles.group.visible
		) {
			this.swisstopoBuildingsTiles.update();
		}
		if (this.swisstopoTlmTiles.hasCamera(this.sceneManager.camera) && this.swisstopoTlmTiles.group.visible) {
			this.swisstopoTlmTiles.update();
		}
		if (
			this.swisstopoVegetationTiles.hasCamera(this.sceneManager.camera) &&
			this.swisstopoVegetationTiles.group.visible
		) {
			this.swisstopoVegetationTiles.update();
		}
		if (this.swisstopoNamesTiles.hasCamera(this.sceneManager.camera) && this.swisstopoNamesTiles.group.visible) {
			this.swisstopoNamesTiles.update();
		}
		if (
			this.swisstopoTerrainTiles.hasCamera(this.sceneManager.camera) &&
			this.swisstopoTerrainTiles.group.visible
		) {
			this.swisstopoTerrainTiles.update();
		}
		if (this.blackMarbleTiles.hasCamera(this.sceneManager.camera)) {
			// NB: Don't check group visibility as it's always invisible (rendered off-screen).
			this.blackMarbleTiles.update();
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

		if ($event.swisstopoBaseOverlay?.layer && $event.swisstopoBaseOverlay?.timeDimension) {
			const timeDimension =
				$event.swisstopoBaseOverlay.timeDimension === referenceDate.getFullYear().toString()
					? 'current'
					: $event.swisstopoBaseOverlay.timeDimension; // Use "current" overlay if current year is selected. // TODO: Check if year dimension indeed exists in capabilities and if not, default to "current".
			const layer =
				timeDimension === 'current' && $event.swisstopoBaseOverlay.layer === 'ch.swisstopo.swissimage-product'
					? 'ch.swisstopo.swissimage'
					: $event.swisstopoBaseOverlay.layer;
			const newBaseOverlayKey = `${layer}:${timeDimension}`;

			if (!this.swisstopoBaseOverlay || this.swisstopoBaseOverlay.key !== newBaseOverlayKey) {
				const newBaseOverlay = new WMTSTilesOverlay({
					capabilities: this.swisstopoWMTSCapabilities(),
					layer,
					style: 'default',
					dimensions: { Time: timeDimension },
					color: 0xffffff,
					opacity: 1,
				});

				this.swisstopoBaseOverlay = this.swapOverlay(
					this.swisstopoBaseOverlay,
					newBaseOverlay,
					newBaseOverlayKey,
					0,
					true
				) as never; // TODO: Remove all these "never" casts once SnowImageOverlay properly extends from ImageOverlay.
			}
		}

		const isSnow = $event.snowDepthOverlay?.enabled === true;
		const isWmts = !!$event.swisstopoAdditionalOverlay?.layer;
		if (isSnow) {
			const newKey = '__snow-depth__';
			this.snowOverlay.opacity = $event.snowDepthOverlay!.opacity ?? DEFAULT_ADDITIONAL_LAYER_OPACITY;

			if (this.additionalOverlay?.key !== newKey) {
				// Avoid deleting/recreating overlay when only opacity changes.
				this.additionalOverlay = this.swapOverlay(this.additionalOverlay, this.snowOverlay, newKey, 10);
			}
		} else if (isWmts) {
			const timeDimension =
				$event.swisstopoAdditionalOverlay!.timeDimension === referenceDate.getFullYear().toString()
					? 'current'
					: $event.swisstopoAdditionalOverlay!.timeDimension;
			const additionalOverlayOpacity =
				$event.swisstopoAdditionalOverlay!.opacity ?? DEFAULT_ADDITIONAL_LAYER_OPACITY;
			const newKey = `${$event.swisstopoAdditionalOverlay!.layer}:${timeDimension}`;

			if (this.additionalOverlay?.key === newKey) {
				// Avoid deleting/recreating overlay when only opacity changes.
				this.additionalOverlay.overlay.opacity = additionalOverlayOpacity;
			} else {
				const newAdditionalOverlay = new WMTSTilesOverlay({
					capabilities: this.swisstopoWMTSCapabilities(),
					layer: $event.swisstopoAdditionalOverlay!.layer,
					style: 'default',
					dimensions: { Time: timeDimension },
					color: 0xffffff,
					opacity: additionalOverlayOpacity,
				});

				this.additionalOverlay = this.swapOverlay(this.additionalOverlay, newAdditionalOverlay, newKey, 10);
			}
		} else if (this.additionalOverlay) {
			this.swisstopoTerrainOverlayPlugin?.deleteOverlay(this.additionalOverlay.overlay as never);
			this.additionalOverlay = null;
		}

		this.sceneManager.renderingNeedsUpdate = true;
	}

	getEllipsoid(): Ellipsoid {
		return this.googleTiles.ellipsoid;
	}

	registerDebugControls(debugGui: GUI, onValueChange: () => void): void {
		debugGui
			.add(this.googleTiles, 'errorTarget', 1, 100)
			.name('google 3d tiles error target')
			.onChange(value => {
				(this.googleTiles.getPluginByName('UPDATE_ON_CHANGE_PLUGIN') as any).needsUpdate = true;
				onValueChange();
			});
		debugGui
			.add(this.swisstopoTerrainTiles, 'errorTarget', 1, 50)
			.name('swisstopo terrain error target')
			.onChange(value => {
				(this.swisstopoTerrainTiles.getPluginByName('UPDATE_ON_CHANGE_PLUGIN') as any).needsUpdate = true;
				onValueChange();
			});
		debugGui
			.add(this.swisstopoBuildingsTiles, 'errorTarget', 1, 100)
			.name('swisstopo buildings error target')
			.onChange(value => {
				(this.swisstopoBuildingsTiles.getPluginByName('UPDATE_ON_CHANGE_PLUGIN') as any).needsUpdate = true;
				onValueChange();
			});
		debugGui
			.add(this.swisstopoTlmTiles, 'errorTarget', 1, 10000)
			.name('swisstopo tlm error target')
			.onChange(value => {
				(this.swisstopoTlmTiles.getPluginByName('UPDATE_ON_CHANGE_PLUGIN') as any).needsUpdate = true;
				onValueChange();
			});
		debugGui
			.add(this.swisstopoVegetationTiles, 'errorTarget', 1, 50)
			.name('swisstopo vegetation error target')
			.onChange(value => {
				(this.swisstopoVegetationTiles.getPluginByName('UPDATE_ON_CHANGE_PLUGIN') as any).needsUpdate = true;
				onValueChange();
			});

		const self = this;
		const stats = {
			get googleTilesCachedMB() {
				return ((self.googleTiles.lruCache as any).cachedBytes / 1000000).toFixed(3); // display in MB
			},
			get swisstopoTerrainTilesCachedMB() {
				return ((self.swisstopoTerrainTiles.lruCache as any).cachedBytes / 1000000).toFixed(3); // display in MB
			},
			get swisstopoBuildingsTilesCachedMB() {
				return ((self.swisstopoBuildingsTiles.lruCache as any).cachedBytes / 1000000).toFixed(3); // display in MB
			},
		};
		debugGui.add(stats, 'googleTilesCachedMB').listen().disable();
		debugGui.add(stats, 'swisstopoTerrainTilesCachedMB').listen().disable();
		debugGui.add(stats, 'swisstopoBuildingsTilesCachedMB').listen().disable();

		const swisstopoTerrainTilesPositioningDebugFolder = debugGui.addFolder('Swisstopo Terrain Tiles Positioning');
		swisstopoTerrainTilesPositioningDebugFolder
			.add(this.swisstopoTerrainTiles.group.position, 'x', 0, 50)
			.onChange(onValueChange);
		swisstopoTerrainTilesPositioningDebugFolder
			.add(this.swisstopoTerrainTiles.group.position, 'y', 0, 20)
			.onChange(onValueChange);
		swisstopoTerrainTilesPositioningDebugFolder
			.add(this.swisstopoTerrainTiles.group.position, 'z', 0, 50)
			.onChange(onValueChange);
		swisstopoTerrainTilesPositioningDebugFolder.close();

		const snowOverlayDebugFolder = debugGui.addFolder('Snow Overlay Alignment');
		const onSnowOverlayUpdated = () => {
			this.snowOverlay.clearTextureCache();

			// Force the ImageOverlayPlugin to re-render the snow overlay (e.g. after bounds change).
			this.swisstopoTerrainOverlayPlugin?.deleteOverlay(this.snowOverlay as never);
			this.swisstopoTerrainOverlayPlugin?.addOverlay(this.snowOverlay as never, 10);

			onValueChange();
		};
		snowOverlayDebugFolder
			.add(this.snowOverlay, 'boundsOffsetX', -50000, 50000, 100)
			.name('Offset X (easting) [m]')
			.onChange(onSnowOverlayUpdated);
		snowOverlayDebugFolder
			.add(this.snowOverlay, 'boundsOffsetY', -50000, 50000, 100)
			.name('Offset Y (northing) [m]')
			.onChange(onSnowOverlayUpdated);
		snowOverlayDebugFolder
			.add(this.snowOverlay, 'roundingPasses', 0, 4, 1)
			.name('Corner rounding passes')
			.onChange(onSnowOverlayUpdated);
		snowOverlayDebugFolder.close();
	}

	resetGoogleDebugColorMode(): void {
		if (this.googleDebugTilesPlugin) {
			this.googleDebugTilesPlugin.colorMode = 1;
		}
	}

	async getHighlightedBuildingInfo(raycaster: Raycaster): Promise<HighlightedBuildingInfo | null> {
		const intersect = raycaster.intersectObject(this.swisstopoBuildingsTiles.group, true)[0];
		if (!intersect) {
			return null;
		}

		const { face, object } = intersect;
		if (!face) {
			return null;
		}
		const mesh = object as Mesh;

		const batchidAttr = mesh.geometry.getAttribute('_batchid');
		if (!batchidAttr) {
			return null;
		}

		// Traverse parents to find the batch table.
		let batchTableObject: Object3D | null = object;
		while (batchTableObject && !(batchTableObject as any).batchTable) {
			batchTableObject = batchTableObject.parent;
		}

		const batchTable = (batchTableObject as any).batchTable as BatchTable;
		if (!batchTable) {
			return null;
		}

		const batchId = Math.round(batchidAttr.getX(face.a)); // NB: batchid is a float attribute, but should be an integer. Round to avoid precision issues preventing proper matching.
		const batchData = batchTable.getDataFromId(batchId) as Record<string, unknown>;
		const buildingInfo: HighlightedBuildingInfo = {
			batchId,
			tileOffset: mesh.geometry.userData['tileOffset'] ?? 0,
			buildingName: null,
			batchData,
			rbdData: null,
		};

		const egid = batchData['EGID'] as number | null;
		if (egid) {
			buildingInfo.rbdData = await this.rbdService.fetchByEgid(egid);
		}
		buildingInfo.buildingName = buildBuildingName(batchData, buildingInfo.rbdData);

		return buildingInfo;
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
		target.registerPlugin(new UpdateOnChangePlugin());
		target.registerPlugin(new TilesFadePlugin());
		target.registerPlugin(
			new GLTFExtensionsPlugin({
				dracoLoader: this.dracoLoader,
			})
		);
		target.registerPlugin(
			new BatchedTilesPlugin({
				renderer: this.sceneManager.renderer,
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
			renderer: this.sceneManager.renderer,
			enableTileSplitting: true,
			overlays: [], // Overlay is added dynamically based on user settings
		});
		target.registerPlugin(this.googleTilesOverlayPlugin);

		// Remove Google tiles in Switzerland to use swisstopo's better dataset there.
		const regionsPlugin = new LoadRegionPlugin();
		target.registerPlugin(regionsPlugin);
		regionsPlugin.addRegion(new OutsideSwitzerlandRegion(SWITZERLAND_REGION_CAMERA_ELEVATION_THRESHOLD));

		target.setCamera(this.sceneManager.camera);
		target.setResolutionFromRenderer(this.sceneManager.camera, this.sceneManager.renderer);

		this.sceneManager.earth.add(target.group);

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
		target.registerPlugin(new UpdateOnChangePlugin());
		target.registerPlugin(new TilesFadePlugin()); // TODO: Doesn't seem to have any noticeable impact
		if (overlaySwissimage) {
			// TODO: Check how to reuse plugins between tiles sets; currently unsupported (see https://github.com/NASA-AMMOS/3DTilesRendererJS/issues/1264).
			target.registerPlugin(this.swisstopo3DObjectOverlayPlugin);
		}

		target.setCamera(this.sceneManager.camera);
		target.setResolutionFromRenderer(this.sceneManager.camera, this.sceneManager.renderer);

		this.sceneManager.earth.add(target.group);

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
		target.registerPlugin(new UpdateOnChangePlugin());
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

		target.setCamera(this.sceneManager.camera);
		target.setResolutionFromRenderer(this.sceneManager.camera, this.sceneManager.renderer);

		this.sceneManager.earth.add(target.group);

		target.addEventListener('load-tileset', () => {
			target.group.position.copy(SWISS_GEOID_ELLIPSOID_OFFSET);
		});
		target.addEventListener('load-model', (o: { scene: Object3D; tile: Tile }) => {
			o.scene.traverse(child => {
				if (isMesh(child)) {
					// We need to Use unlit material (e.g. MeshBasicMaterial) for proper albedo; required for atmosphere. However, ImageOverlayPlugin uses a StandardMeshMaterial with onBeforeCompile we cannot really migrate to a MeshBasicMaterial. So we keep the original material and just make it not affected by light.
					removeLightingFromMaterial(child.material as MeshStandardMaterial, this.sceneManager.renderer);
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

	private initBlackMarbleTileset(target: TilesRenderer): void {
		target.errorTarget = 1;

		target.registerPlugin(
			new XYZTilesPlugin({
				url: VIIRS_BLACK_MARBLE_TILES_URL,
				shape: 'ellipsoid',
				levels: 8,
			})
		);
		target.registerPlugin(new UnloadTilesPlugin());
		target.registerPlugin(new UpdateOnChangePlugin());
		target.registerPlugin(new TilesFadePlugin());

		target.setCamera(this.sceneManager.camera);
		target.setResolutionFromRenderer(this.sceneManager.camera, this.sceneManager.renderer);

		this.sceneManager.earth.add(target.group);
		target.group.visible = false; // Main render skips it; the effect renders off-screen.

		this.atmosphereService.blackMarbleEffect.blackMarbleTiles = target.group;

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

	private swapOverlay(
		currentOverlay: { overlay: WMTSTilesOverlay | SnowImageOverlay; key: string } | null,
		newOverlay: WMTSTilesOverlay | SnowImageOverlay,
		newOverlayKey: string,
		overlayOrder = 0,
		addTo3DObjectPlugin = false
	): { overlay: WMTSTilesOverlay | SnowImageOverlay; key: string } {
		this.swisstopoTerrainOverlayPlugin?.addOverlay(newOverlay as never, overlayOrder);

		// If existing overlay, wait for new overlay to be loaded before deleting the old one.
		if (currentOverlay) {
			const oldOverlay = currentOverlay.overlay;
			const cleanupOldOverlay = () => {
				this.swisstopoTerrainTiles.removeEventListener('needs-update', cleanupOldOverlay);
				this.swisstopoTerrainOverlayPlugin?.deleteOverlay(oldOverlay as any);
				// TODO: Dispose?
			};
			this.swisstopoTerrainTiles.addEventListener('needs-update', cleanupOldOverlay);
		}

		if (addTo3DObjectPlugin && !currentOverlay) {
			this.swisstopo3DObjectOverlayPlugin?.addOverlay(newOverlay as never);
		}

		return { overlay: newOverlay as never, key: newOverlayKey };
	}
}
