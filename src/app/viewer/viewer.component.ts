import { Component, ElementRef, ViewChild } from '@angular/core';
import { GlobeControls, GoogleCloudAuthPlugin, Tile, TilesRenderer, WGS84_RADIUS } from '3d-tiles-renderer';
import {
	AmbientLight,
	DirectionalLight,
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
} from 'three';
import Stats from 'stats.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TileCompressionPlugin } from '../../plugins/TileCompressionPlugin';
import { AddressSearchComponent } from '../address-search/address-search.component';
import { environment } from '../../environments/environment';
import gsap from 'gsap';
import { LayersSettingsComponent, LayersSettings } from '../layers-toggle/layers-toggle.component';
import {
	threejsPositionToTiles,
	tilesPositionToThreejs,
	pow2Animation,
	updateObjectAndChildrenOpacity,
} from '../utils/graphics-utils';
import { BatchedTilesPlugin } from '../../plugins/batched/BatchedTilesPlugin';

const GOOGLE_3D_TILES_TILESET_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json';
const SWISSTOPO_BUILDINGS_3D_TILES_TILESET_URL =
	'https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json';
const SWISSTOPO_TLM_3D_TILES_TILESET_URL = 'https://3d.geo.admin.ch/ch.swisstopo.swisstlm3d.3d/v1/tileset.json';
const SWISSTOPO_VEGETATION_3D_TILES_TILESET_URL = 'https://3d.geo.admin.ch/ch.swisstopo.vegetation.3d/v1/tileset.json';
const SWISSTOPO_NAMES_3D_TILES_TILESET_URL =
	'https://3d.geo.admin.ch/3d-tiles/ch.swisstopo.swissnames3d.3d/20180716/tileset.json';

const DEFAULT_START_COORDS = [6.629047, 46.516591]; // [lon, lat]
const HEIGHT_FULL_GLOBE_VISIBLE = 7000000;

const SWIZERLAND_BOUNDS: Number[] = [0.10401182679403116, 0.7996693586576467, 0.18312399144408265, 0.8343189318329005]; // [west, south, east, north] in EPSG:4979 (rad)

// NB: Put reference to REUSABLE object to null after done using to minimize risk of reusing a REUSABLE object before it was done being used by the previous user.
const REUSABLE_VECTOR2 = new Vector2();
const REUSABLE_VECTOR3_1 = new Vector3();
const REUSABLE_VECTOR3_2 = new Vector3();

@Component({
	selector: 'app-viewer',
	standalone: true,
	imports: [AddressSearchComponent, LayersSettingsComponent],
	templateUrl: './viewer.component.html',
	styleUrl: './viewer.component.scss',
})
export class ViewerComponent {
	private scene!: Scene;
	private renderer!: WebGLRenderer;
	private camera!: PerspectiveCamera;
	private controls!: GlobeControls;
	private raycaster = new Raycaster();
	private dirLight!: DirectionalLight;
	private earth = new Group();
	private stats!: Stats;

	private dracoLoader!: DRACOLoader;

	private renderingNeedsUpdate = true;
	private isMouseDragging = false;

	private zoomToCoordsAnimationTl = gsap.timeline();
	private destinationPosition = new Vector3();
	private resetOrbitCameraPosition = new Vector3();
	private pivotPoint = new Vector3();
	private cameraUp = new Vector3();
	private localUp = new Vector3();
	private localEast = new Vector3();

	private googleTiles = new TilesRenderer(GOOGLE_3D_TILES_TILESET_URL);
	private swisstopoBuildingsTiles = new TilesRenderer(SWISSTOPO_BUILDINGS_3D_TILES_TILESET_URL);
	private swisstopoTlmTiles = new TilesRenderer(SWISSTOPO_TLM_3D_TILES_TILESET_URL);
	private swisstopoVegetationTiles = new TilesRenderer(SWISSTOPO_VEGETATION_3D_TILES_TILESET_URL);
	private swisstopoNamesTiles = new TilesRenderer(SWISSTOPO_NAMES_3D_TILES_TILESET_URL);

	private googleTilesOpacity = 1;

	@ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;

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

		this.renderer = new WebGLRenderer({ antialias: true, canvas: this.canvas.nativeElement });
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setClearColor(0x151c1f);
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = PCFSoftShadowMap;

		this.camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, WGS84_RADIUS * 2);

		this.controls = new GlobeControls(this.scene, this.camera, this.renderer.domElement);
		this.controls.enableDamping = false;
		this.controls.adjustHeight = false;
		this.controls.maxAltitude = MathUtils.degToRad(75);
		this.controls.minDistance = 40;

		this.controls.addEventListener('start', () => {
			if (this.zoomToCoordsAnimationTl.isActive()) {
				this.zoomToCoordsAnimationTl.kill();
			}
			this.renderingNeedsUpdate = true;
		});
		this.controls.addEventListener('change', () => {
			this.renderingNeedsUpdate = true;
		});
		this.controls.addEventListener('end', () => {
			this.renderingNeedsUpdate = true;
		});

		this.renderer.domElement.addEventListener('pointerdown', () => {
			this.isMouseDragging = true;
		});
		this.renderer.domElement.addEventListener('pointermove', () => {
			if (this.isMouseDragging) {
				// Fixes a probable bug that often during a drag event the rendering is not updated and the controls therefore block.
				this.renderingNeedsUpdate = true;
			}
		});
		this.renderer.domElement.addEventListener('pointerup', () => {
			this.isMouseDragging = false;
		});

		// TODO: Implement proper lighting
		const ambLight = new AmbientLight(0xffffff, 1);
		this.scene.add(ambLight);

		this.dirLight = new DirectionalLight(0xffffff, 1.25);
		this.dirLight.position.set(1, 2, 3).multiplyScalar(40);
		this.dirLight.castShadow = true;
		this.dirLight.shadow.bias = -0.01;
		this.dirLight.shadow.mapSize.setScalar(2048);

		// TODO: Implement shadow cam
		/*const shadowCam = this.dirLight.shadow.camera;
		shadowCam.left = - 200;
		shadowCam.bottom = - 200;
		shadowCam.right = 200;
		shadowCam.top = 200;
		shadowCam.updateProjectionMatrix();*/

		this.scene.add(this.dirLight);

		this.earth.rotateOnWorldAxis(REUSABLE_VECTOR3_1.set(1, 0, 0), -Math.PI / 2);
		this.earth.rotateOnWorldAxis(REUSABLE_VECTOR3_1.set(0, 1, 0), -Math.PI / 2);
		this.scene.add(this.earth);

		this.initGoogleTileset(this.googleTiles);
		this.initSwisstopoTileset(this.swisstopoBuildingsTiles);
		this.initSwisstopoTileset(this.swisstopoTlmTiles);
		this.initSwisstopoTileset(this.swisstopoVegetationTiles);
		//this.initSwisstopoTileset(this.swisstopoNamesTiles); // TODO: .vctr format not supported (yet). // TODO: Find most recent tileset (if it even exists?)

		// Set init camera position
		this.moveCameraTo({
			lon: DEFAULT_START_COORDS[0] * MathUtils.DEG2RAD,
			lat: DEFAULT_START_COORDS[1] * MathUtils.DEG2RAD,
			height: HEIGHT_FULL_GLOBE_VISIBLE,
		});

		this.stats = new Stats();
		this.stats.showPanel(0);
		document.body.appendChild(this.stats.dom);

		this.onWindowResize();
		window.addEventListener('resize', () => this.onWindowResize(), false);

		this.render();
	}

	zoomToCoords(coords: { lon: number; lat: number }, height?: number) {
		// Set init state of `tlCoords` to current position
		const tlCoords = { lon: 0, lat: 0, height: 0 };
		this.googleTiles.ellipsoid.getPositionToCartographic(
			threejsPositionToTiles(REUSABLE_VECTOR3_1.copy(this.camera.position)),
			tlCoords
		);

		if (!height) {
			height = 750; // TODO: Find actual destination surface height.
		}

		tilesPositionToThreejs(
			this.googleTiles.ellipsoid.getCartographicToPosition(
				coords.lat * MathUtils.DEG2RAD,
				coords.lon * MathUtils.DEG2RAD,
				height,
				this.destinationPosition
			)
		);
		const originDestAngularDistance = this.camera.position.angleTo(this.destinationPosition);
		const distancePercentage = pow2Animation(Math.abs(originDestAngularDistance) / Math.PI);

		const maxClimbAltitude = HEIGHT_FULL_GLOBE_VISIBLE;
		const climbHeight = Math.max(Math.max(distancePercentage * maxClimbAltitude, height) - tlCoords.height!, 0); // NB: This is climb height and not climb target altitude!
		const descentHeight = tlCoords.height! + climbHeight - height;

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

		// Compute local up, local east and camera up vectors
		this.googleTiles.ellipsoid.getPositionToNormal(this.pivotPoint, this.localUp);
		this.localEast.set(this.pivotPoint.z, 0, -this.pivotPoint.x).normalize();
		this.cameraUp.crossVectors(this.localUp, this.localEast);

		const pivotResetTl = () => {
			const tl = gsap.timeline({ defaults: { duration: 1, ease: 'none' } });
			tl.to(
				this.camera.position,
				{
					x: this.resetOrbitCameraPosition.x,
					y: this.resetOrbitCameraPosition.y,
					z: this.resetOrbitCameraPosition.z,
				},
				0
			);
			tl.to(this.camera.up, { x: this.cameraUp.x, y: this.cameraUp.y, z: this.cameraUp.z }, 0);
			tl.eventCallback('onStart', () => {
				this.controls.getCameraUpDirection(this.camera.up);
			})
				.eventCallback('onUpdate', () => {
					this.camera.lookAt(this.pivotPoint);
					this.renderingNeedsUpdate = true;
				})
				.eventCallback('onComplete', () => {
					// Update tlCoords
					this.googleTiles.ellipsoid.getPositionToCartographic(
						threejsPositionToTiles(REUSABLE_VECTOR3_1.copy(this.camera.position)),
						tlCoords
					);
				});
			return tl;
		};
		const cameraTravelTl = () => {
			const tl = gsap.timeline();
			tl.to(
				tlCoords,
				{
					precise: {
						lon: coords.lon * MathUtils.DEG2RAD,
						lat: coords.lat * MathUtils.DEG2RAD,
					},
					duration: totalAnimationDuration,
					ease: 'power4.inOut',
				},
				0
			);
			tl.to(
				tlCoords,
				{ height: tlCoords.height! + climbHeight, duration: climbAnimationDuration, ease: 'power3.in' },
				'<'
			);
			tl.to(tlCoords, { height: height, duration: descentAnimationDuration, ease: 'power3.out' }, '>');
			tl.eventCallback('onUpdate', () => {
				this.moveCameraTo(tlCoords);
			});
			return tl;
		};
		this.zoomToCoordsAnimationTl = gsap.timeline();
		this.zoomToCoordsAnimationTl.add(pivotResetTl());
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
				this.renderingNeedsUpdate = true;
			}
		}
		if ($event.swisstopoBuildingsTiles !== undefined && $event.swisstopoBuildingsTiles.enabled !== undefined) {
			this.swisstopoBuildingsTiles.group.visible = $event.swisstopoBuildingsTiles.enabled;
		}
		if ($event.swisstopoTlmTiles !== undefined && $event.swisstopoTlmTiles.enabled !== undefined) {
			this.swisstopoTlmTiles.group.visible = $event.swisstopoTlmTiles.enabled;
		}
		if ($event.swisstopoVegetationTiles !== undefined && $event.swisstopoVegetationTiles.enabled !== undefined) {
			this.swisstopoVegetationTiles.group.visible = $event.swisstopoVegetationTiles.enabled;
		}
		if ($event.swisstopoNamesTiles !== undefined && $event.swisstopoNamesTiles.enabled !== undefined) {
			this.swisstopoNamesTiles.group.visible = $event.swisstopoNamesTiles.enabled;
		}
		this.renderingNeedsUpdate = true;
	}

	private initGoogleTileset(target: TilesRenderer): void {
		target.displayActiveTiles = true;
		target.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: environment.GOOGLE_MAPS_API_KEY }));
		target.registerPlugin(new BatchedTilesPlugin({ renderer: this.renderer }));
		//target.registerPlugin(new TileCompressionPlugin()); // TODO: Needed?

		const gltfLoader = new GLTFLoader(target.manager);
		gltfLoader.setDRACOLoader(this.dracoLoader);
		target.manager.addHandler(/\.gltf$/, gltfLoader);

		target.setCamera(this.camera);
		target.setResolutionFromRenderer(this.camera, this.renderer);

		this.earth.add(target.group);

		this.controls.setTilesRenderer(target);

		target.addEventListener('load-tile-set', () => {
			this.renderingNeedsUpdate = true;
		});
		target.addEventListener('load-model', (o: { scene?: Group; tile?: Tile }) => {
			updateObjectAndChildrenOpacity(o.scene!, this.googleTilesOpacity);
			this.renderingNeedsUpdate = true; // TODO: Debounce
		});
		target.addEventListener('tile-visibility-change', (o: { scene?: Group; tile?: Tile }) => {
			updateObjectAndChildrenOpacity(o.scene!, this.googleTilesOpacity);
			this.renderingNeedsUpdate = true;
		});
	}

	private initSwisstopoTileset(target: TilesRenderer): void {
		target.displayActiveTiles = true;

		const gltfLoader = new GLTFLoader(target.manager);
		gltfLoader.setDRACOLoader(this.dracoLoader);
		target.manager.addHandler(/\.gltf$/, gltfLoader);

		target.setCamera(this.camera);
		target.setResolutionFromRenderer(this.camera, this.renderer);

		this.earth.add(target.group);

		target.addEventListener('load-tile-set', (_o: { tileSet?: Object }) => {
			// TODO: Compute proper values to account for slight altitude offset between swisstopo and Google tiles for some reason.
			target.group.position.x = 34;
			target.group.position.y = 5;
			target.group.position.z = 36;

			this.renderingNeedsUpdate = true;
		});
		target.addEventListener('load-model', () => {
			this.renderingNeedsUpdate = true; // TODO: Debounce
		});
	}

	private render(): void {
		requestAnimationFrame((_timestamp: DOMHighResTimeStamp) => {
			this.render();
		});

		this.stats.update();

		if (this.renderingNeedsUpdate) {
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

			this.renderer.render(this.scene, this.camera);
		}
	}

	private isTileInsideSwitzerland(tileBoundingVolume: number[]): boolean {
		const obbCenter = { x: tileBoundingVolume[0], y: tileBoundingVolume[1], z: tileBoundingVolume[2] };
		const obbX = { x: tileBoundingVolume[3], y: tileBoundingVolume[4], z: tileBoundingVolume[5] };
		const obbY = { x: tileBoundingVolume[6], y: tileBoundingVolume[7], z: tileBoundingVolume[8] };
		const obbZ = { x: tileBoundingVolume[9], y: tileBoundingVolume[10], z: tileBoundingVolume[11] };
		const obbMinCornerCoords = this.googleTiles.ellipsoid.getPositionToCartographic(
			REUSABLE_VECTOR3_1.set(obbCenter.x, obbCenter.y, obbCenter.z).sub(obbX).sub(obbY).sub(obbZ),
			{}
		);
		const obbMaxCornerCoords = this.googleTiles.ellipsoid.getPositionToCartographic(
			REUSABLE_VECTOR3_1.set(obbCenter.x, obbCenter.y, obbCenter.z).add(obbX).add(obbY).add(obbZ),
			{}
		);
		return (
			obbMinCornerCoords.lon >= SWIZERLAND_BOUNDS[0] &&
			obbMinCornerCoords.lon <= SWIZERLAND_BOUNDS[2] &&
			obbMaxCornerCoords.lon >= SWIZERLAND_BOUNDS[0] &&
			obbMaxCornerCoords.lon <= SWIZERLAND_BOUNDS[2] &&
			obbMinCornerCoords.lat >= SWIZERLAND_BOUNDS[1] &&
			obbMinCornerCoords.lat <= SWIZERLAND_BOUNDS[3] &&
			obbMaxCornerCoords.lat >= SWIZERLAND_BOUNDS[1] &&
			obbMaxCornerCoords.lat <= SWIZERLAND_BOUNDS[3]
		);
	}

	private onWindowResize(): void {
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		this.renderingNeedsUpdate = true;
	}
}
