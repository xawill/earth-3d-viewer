import { Component, ElementRef, ViewChild } from '@angular/core';
import { GlobeControls, GoogleCloudAuthPlugin, Tile, TilesRenderer, WGS84_RADIUS } from '3d-tiles-renderer';
import { AmbientLight, DirectionalLight, Group, MathUtils, Mesh, PCFSoftShadowMap, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import Stats from 'stats.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TileCompressionPlugin } from '../../plugins/TileCompressionPlugin';
import { AddressSearchComponent } from "../address-search/address-search.component";
import { environment } from '../../environments/environment';
import gsap from 'gsap';
import { LayersToggleComponent, SelectedLayers } from '../layers-toggle/layers-toggle.component';

const GOOGLE_3D_TILES_TILESET_URL = "https://tile.googleapis.com/v1/3dtiles/root.json";
const SWISSTOPO_BUILDINGS_3D_TILES_TILESET_URL = "https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json";
const SWISSTOPO_TLM_3D_TILES_TILESET_URL = "https://3d.geo.admin.ch/ch.swisstopo.swisstlm3d.3d/v1/tileset.json";
const SWISSTOPO_VEGETATION_3D_TILES_TILESET_URL = "https://3d.geo.admin.ch/ch.swisstopo.vegetation.3d/v1/tileset.json";
const SWISSTOPO_NAMES_3D_TILES_TILESET_URL = "https://3d.geo.admin.ch/3d-tiles/ch.swisstopo.swissnames3d.3d/20180716/tileset.json";

const DEFAULT_START_COORDS = [6.629047, 46.516591]; // [lon, lat]
const HEIGHT_FULL_GLOBE_VISIBLE = 7000000;

const SWIZERLAND_BOUNDS: Number[] = [0.10401182679403116, 0.7996693586576467, 0.18312399144408265, 0.8343189318329005]; // [west, south, east, north] in EPSG:4979 (rad)

const REUSABLE_VECTOR3 = new Vector3();

@Component({
  selector: 'app-viewer',
  standalone: true,
  imports: [AddressSearchComponent, LayersToggleComponent],
  templateUrl: './viewer.component.html',
  styleUrl: './viewer.component.scss'
})
export class ViewerComponent {
	private scene!: Scene;
	private renderer!: WebGLRenderer;
	private camera!: PerspectiveCamera;
	private controls!: GlobeControls;
	private dirLight!: DirectionalLight;
	private earth = new Group();
	private stats!: Stats;

	private dracoLoader!: DRACOLoader;

	private renderingNeedsUpdate = true;
	private isMouseDragging = false;

	private zoomToCoordsAnimationTl!: gsap.core.Timeline;

	private googleTiles = new TilesRenderer(GOOGLE_3D_TILES_TILESET_URL);
	private swisstopoBuildingsTiles = new TilesRenderer(SWISSTOPO_BUILDINGS_3D_TILES_TILESET_URL);
	private swisstopoTlmTiles = new TilesRenderer(SWISSTOPO_TLM_3D_TILES_TILESET_URL);
	private swisstopoVegetationTiles = new TilesRenderer(SWISSTOPO_VEGETATION_3D_TILES_TILESET_URL);
	private swisstopoNamesTiles = new TilesRenderer(SWISSTOPO_NAMES_3D_TILES_TILESET_URL);

	@ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
		
	constructor() {
		this.dracoLoader = new DRACOLoader();
		this.dracoLoader.setDecoderPath('libs/draco/gltf/');

		gsap.registerPlugin({ // From https://gsap.com/community/forums/topic/25830-tweening-value-with-large-number-of-decimals/#comment-125391
			name: "precise",
			init(target: any, vars: any, tween: any, index: any, targets: any) {
				let data: any = this,
					p, value;
				data.t = target;
				for (p in vars) {
					value = vars[p];
					typeof(value) === "function" && (value = value.call(tween, index, target, targets));
					data.pt = {n: data.pt, p: p, s: target[p], c: value - target[p]};
					data._props.push(p);
				}
			},
			render(ratio: any, data: any) {
				let pt = data.pt;
				while (pt) {
					data.t[pt.p] = pt.s + pt.c * ratio;
					pt = pt.n;
				}
			}
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
		this.camera.position.set(1, 0, 0); // NB: Arbitrary init position that is not the 0 vector.

		this.controls = new GlobeControls(this.scene, this.camera, this.renderer.domElement);
		this.controls.enableDamping = false;
		this.controls.adjustHeight = false;
		this.controls.maxAltitude = MathUtils.degToRad(75);
		this.controls.minDistance = 40;

		this.controls.addEventListener('start', () => {
			this.zoomToCoordsAnimationTl.kill();
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
		this.scene.add( ambLight );

		this.dirLight = new DirectionalLight(0xffffff, 1.25);
		this.dirLight.position.set(1, 2, 3).multiplyScalar(40);
		this.dirLight.castShadow = true;
		this.dirLight.shadow.bias = - 0.01;
		this.dirLight.shadow.mapSize.setScalar( 2048 );
	
		// TODO: Implement shadow cam
		/*const shadowCam = this.dirLight.shadow.camera;
		shadowCam.left = - 200;
		shadowCam.bottom = - 200;
		shadowCam.right = 200;
		shadowCam.top = 200;
		shadowCam.updateProjectionMatrix();*/
	
		this.scene.add(this.dirLight);

		this.earth.rotateOnWorldAxis(REUSABLE_VECTOR3.set(1, 0, 0), -Math.PI/2);
		this.earth.rotateOnWorldAxis(REUSABLE_VECTOR3.set(0, 1, 0), -Math.PI/2);
		this.scene.add(this.earth);
	
		this.initGoogleTileset(this.googleTiles);
		this.initSwisstopoTileset(this.swisstopoBuildingsTiles);
		this.initSwisstopoTileset(this.swisstopoTlmTiles);
		this.initSwisstopoTileset(this.swisstopoVegetationTiles);
		//this.initSwisstopoTileset(this.swisstopoNamesTiles); // TODO: .vctr format not supported (yet). // TODO: Find most recent tileset (if it even exists?)

		this.zoomToCoords({lon: DEFAULT_START_COORDS[0], lat: DEFAULT_START_COORDS[1]}, HEIGHT_FULL_GLOBE_VISIBLE);
	
		this.stats = new Stats();
		this.stats.showPanel(0);
		document.body.appendChild(this.stats.dom);
	
		this.onWindowResize();
		window.addEventListener('resize', () => this.onWindowResize(), false);

		this.render();
	}

	zoomToCoords(coords: { lon: number; lat: number; }, height?: number) {
		// Set init state of `tlCoords` to current position
		const tlCoords = {lon: undefined, lat: undefined, height: undefined};
		const originCameraGlobePosition = REUSABLE_VECTOR3.set(this.camera.position.z, this.camera.position.x, this.camera.position.y);
		this.googleTiles.ellipsoid.getPositionToCartographic(originCameraGlobePosition, tlCoords);

		if (!height) {
			height = 750; // TODO: Find actual destination surface height.
		}

		const pow2Animation = (x: number) => -(x**2)+2*x; // See how function looks like: https://www.wolframalpha.com/input?i=-x%5E2%2B2x

		const destinationPosition = this.googleTiles.ellipsoid.getCartographicToPosition(coords.lat * MathUtils.DEG2RAD, coords.lon * MathUtils.DEG2RAD, height, new Vector3());
		const originDestAngularDistance = originCameraGlobePosition.normalize().angleTo(destinationPosition.normalize());
		const distancePercentage = pow2Animation(Math.abs(originDestAngularDistance) / Math.PI);

		const maxClimbAltitude = HEIGHT_FULL_GLOBE_VISIBLE;
		const climbHeight = Math.max(Math.max(distancePercentage * maxClimbAltitude, height) - tlCoords.height!, 0); // NB: This is climb height and not climb target altitude!
		const descentHeight = tlCoords.height! + climbHeight - height;

		const maxTotalAnimationDuration = 5; // [sec]
		const minClimbDescentAnimationDuration = 1.5;
		const maxClimbDescentAnimationDuration = maxTotalAnimationDuration / 2;
		const climbAnimationDuration = climbHeight === 0 ? 0 : Math.min(pow2Animation(climbHeight / maxClimbAltitude) * maxClimbDescentAnimationDuration + minClimbDescentAnimationDuration, maxClimbDescentAnimationDuration);
		const descentAnimationDuration = descentHeight === 0 ? 0 : Math.min(pow2Animation(descentHeight / maxClimbAltitude) * maxClimbDescentAnimationDuration + minClimbDescentAnimationDuration, maxClimbDescentAnimationDuration);
		const totalAnimationDuration = Math.min(Math.max(distancePercentage * maxTotalAnimationDuration, climbAnimationDuration+descentAnimationDuration), maxTotalAnimationDuration);

		this.zoomToCoordsAnimationTl = gsap.timeline();
		this.zoomToCoordsAnimationTl.to(tlCoords, {
			precise: { // Use custom plugin above to avoid floating point errors with small numbers with lots of decimals
				lon: coords.lon * MathUtils.DEG2RAD,
				lat: coords.lat * MathUtils.DEG2RAD
			}, duration: totalAnimationDuration, ease: "power4.inOut"}, 0);
		this.zoomToCoordsAnimationTl.to(tlCoords, {height: tlCoords.height! + climbHeight, duration: climbAnimationDuration, ease: "power3.in"}, 0);
		this.zoomToCoordsAnimationTl.to(tlCoords, {height: height, duration: descentAnimationDuration, ease: "power3.out"}, ">");
		this.zoomToCoordsAnimationTl.eventCallback("onUpdate", (tlCoords) => {
			this.googleTiles.ellipsoid.getCartographicToPosition(tlCoords.lat, tlCoords.lon, tlCoords.height, REUSABLE_VECTOR3);
			this.camera.position.set(REUSABLE_VECTOR3.y, REUSABLE_VECTOR3.z, REUSABLE_VECTOR3.x);
			this.camera.lookAt(0, 0, 0);
			this.renderingNeedsUpdate = true;
		}, [tlCoords]);
	}

	updateLayers($event: SelectedLayers) {
		if ($event.googleTiles !== undefined) {
			this.googleTiles.group.visible = $event.googleTiles;
		}
		if ($event.swisstopoBuildingsTiles !== undefined) {
			this.swisstopoBuildingsTiles.group.visible = $event.swisstopoBuildingsTiles;
		}
		if ($event.swisstopoTlmTiles !== undefined) {
			this.swisstopoTlmTiles.group.visible = $event.swisstopoTlmTiles;
		}
		if ($event.swisstopoVegetationTiles !== undefined) {
			this.swisstopoVegetationTiles.group.visible = $event.swisstopoVegetationTiles;
		}
		if ($event.swisstopoNamesTiles !== undefined) {
			this.swisstopoNamesTiles.group.visible = $event.swisstopoNamesTiles;
		}
		this.renderingNeedsUpdate = true;
	}

	private initGoogleTileset(target: TilesRenderer): void {
		target.displayActiveTiles = true;
		target.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: environment.GOOGLE_MAPS_API_KEY }));
		//target.registerPlugin(new TileCompressionPlugin()); // TODO: Needed?

		const gltfLoader = new GLTFLoader(target.manager);
		gltfLoader.setDRACOLoader(this.dracoLoader);
		target.manager.addHandler( /\.gltf$/, gltfLoader);

		target.setCamera(this.camera);
		target.setResolutionFromRenderer(this.camera, this.renderer);

		this.earth.add(target.group);

		this.controls.setTilesRenderer(target);

		target.addEventListener('load-tile-set', () => {
			this.renderingNeedsUpdate = true;
		});
		target.addEventListener('load-model', (o: {scene?: Group, tile?: Tile}) => {
			if (this.isTileInsideSwitzerland(o.tile!.boundingVolume.box!)) {
				// Make Google Tiles much transparent to allow seeing swisstopo tiles instead.
				o.scene!.traverse((child) => {
					const mesh = child as Mesh;
					if (mesh && mesh.material) {
						if (Array.isArray(mesh.material)) {
							for (const m of mesh.material) {
								m.transparent = true;
								//m.opacity = 0.2;
							}
						} else {
							mesh.material.transparent = true;
							//mesh.material.opacity = 0.2;
						}
					}
				});
			}
			this.renderingNeedsUpdate = true; // TODO: Debounce
		});
	}

	private initSwisstopoTileset(target: TilesRenderer): void {
		target.displayActiveTiles = true;

		const gltfLoader = new GLTFLoader(target.manager);
		gltfLoader.setDRACOLoader(this.dracoLoader);
		target.manager.addHandler( /\.gltf$/, gltfLoader);

		target.setCamera(this.camera);
		target.setResolutionFromRenderer(this.camera, this.renderer);

		this.earth.add(target.group);
		
		target.addEventListener('load-tile-set', (_o: {tileSet?: Object}) => {
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
		const obbCenter = {x: tileBoundingVolume[0], y: tileBoundingVolume[1], z: tileBoundingVolume[2]};
		const obbX = {x: tileBoundingVolume[3], y: tileBoundingVolume[4], z: tileBoundingVolume[5]};
		const obbY = {x: tileBoundingVolume[6], y: tileBoundingVolume[7], z: tileBoundingVolume[8]};
		const obbZ = {x: tileBoundingVolume[9], y: tileBoundingVolume[10], z: tileBoundingVolume[11]};
		const obbMinCornerCoords = this.googleTiles.ellipsoid.getPositionToCartographic(REUSABLE_VECTOR3.set(obbCenter.x, obbCenter.y, obbCenter.z).sub(obbX).sub(obbY).sub(obbZ), {});
		const obbMaxCornerCoords = this.googleTiles.ellipsoid.getPositionToCartographic(REUSABLE_VECTOR3.set(obbCenter.x, obbCenter.y, obbCenter.z).add(obbX).add(obbY).add(obbZ), {});
		return 	obbMinCornerCoords.lon >= SWIZERLAND_BOUNDS[0] && obbMinCornerCoords.lon <= SWIZERLAND_BOUNDS[2] &&
				obbMaxCornerCoords.lon >= SWIZERLAND_BOUNDS[0] && obbMaxCornerCoords.lon <= SWIZERLAND_BOUNDS[2] &&
				obbMinCornerCoords.lat >= SWIZERLAND_BOUNDS[1] && obbMinCornerCoords.lat <= SWIZERLAND_BOUNDS[3] &&
				obbMaxCornerCoords.lat >= SWIZERLAND_BOUNDS[1] && obbMaxCornerCoords.lat <= SWIZERLAND_BOUNDS[3];
	}

	private onWindowResize(): void {
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		this.renderingNeedsUpdate = true;
	}
}
