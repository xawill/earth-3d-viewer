import { Component, ElementRef, ViewChild } from '@angular/core';
import { GlobeControls, GoogleCloudAuthPlugin, Tile, TilesRenderer, WGS84_ELLIPSOID } from '3d-tiles-renderer';
import { AmbientLight, DirectionalLight, Group, MathUtils, Mesh, PCFSoftShadowMap, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import Stats from 'stats.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TileCompressionPlugin } from '../../plugins/TileCompressionPlugin';

const GOOGLE_MAPS_REALISTIC_3D_TILES_API_KEY = "AIzaSyApSAMZSpLxtGq2eYmxWYabuJ3MfC5wkVA";

const GOOGLE_3D_TILES_TILESET_URL = "https://tile.googleapis.com/v1/3dtiles/root.json";
const SWISSTOPO_BUILDINGS_3D_TILES_TILESET_URL = "https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json";
const SWISSTOPO_TLM_3D_TILES_TILESET_URL = "https://3d.geo.admin.ch/ch.swisstopo.swisstlm3d.3d/v1/tileset.json";
const SWISSTOPO_VEGETATION_3D_TILES_TILESET_URL = "https://3d.geo.admin.ch/ch.swisstopo.vegetation.3d/v1/tileset.json";
const SWISSTOPO_NAMES_3D_TILES_TILESET_URL = "https://3d.geo.admin.ch/3d-tiles/ch.swisstopo.swissnames3d.3d/20180716/tileset.json"; // TODO: .vctr format not supported (yet). // TODO: Find most recent tileset (if it even exists?)

const EARTH_RADIUS_AT_EQUATOR = 6378137; // [m]

const DEFAULT_START_COORDS = [46.516591, 6.629047];

const SWIZERLAND_BOUNDS: Number[] = [0.10401182679403116, 0.7996693586576467, 0.18312399144408265, 0.8343189318329005]; // [west, south, east, north] in EPSG:4979 (rad)

const REUSABLE_VECTOR3 = new Vector3();

@Component({
  selector: 'app-viewer',
  standalone: true,
  imports: [],
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

	private googleTiles = new TilesRenderer(GOOGLE_3D_TILES_TILESET_URL);
	private swisstopoBuildingsTiles = new TilesRenderer(SWISSTOPO_BUILDINGS_3D_TILES_TILESET_URL);
	private swisstopoTlmTiles = new TilesRenderer(SWISSTOPO_TLM_3D_TILES_TILESET_URL);
	private swisstopoVegetationTiles = new TilesRenderer(SWISSTOPO_VEGETATION_3D_TILES_TILESET_URL);
	private swisstopoNamesTiles = new TilesRenderer(SWISSTOPO_NAMES_3D_TILES_TILESET_URL);

	@ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
		
	constructor() {
		this.dracoLoader = new DRACOLoader();
		this.dracoLoader.setDecoderPath('libs/draco/gltf/');
	}

	ngAfterViewInit() {
		this.scene = new Scene();

		this.renderer = new WebGLRenderer({ antialias: true, canvas: this.canvas.nativeElement });
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setClearColor(0x151c1f);
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = PCFSoftShadowMap;

		this.camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, EARTH_RADIUS_AT_EQUATOR * 2);

		this.controls = new GlobeControls(this.scene, this.camera, this.renderer.domElement);
		this.controls.enableDamping = false;
		this.controls.adjustHeight = false;
		this.controls.maxAltitude = MathUtils.degToRad(75);
		this.controls.minDistance = 40;

		this.controls.addEventListener('start', () => {
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
		//this.initSwisstopoTileset(this.swisstopoTlmTiles);
		//this.initSwisstopoTileset(this.swisstopoVegetationTiles);
		//this.initSwisstopoTileset(this.swisstopoNamesTiles);

		WGS84_ELLIPSOID.getCartographicToPosition(DEFAULT_START_COORDS[0] * MathUtils.DEG2RAD, DEFAULT_START_COORDS[1] * MathUtils.DEG2RAD, 10000, REUSABLE_VECTOR3);
		this.camera.position.set(REUSABLE_VECTOR3.y, REUSABLE_VECTOR3.z, REUSABLE_VECTOR3.x);
		this.camera.lookAt(0, 0, 0);
	
		this.stats = new Stats();
		this.stats.showPanel(0);
		document.body.appendChild(this.stats.dom);
	
		this.onWindowResize();
		window.addEventListener('resize', () => this.onWindowResize(), false);

		this.render();
	}

	private initGoogleTileset(target: TilesRenderer): void {
		target.displayActiveTiles = true;
		target.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: GOOGLE_MAPS_REALISTIC_3D_TILES_API_KEY }));
		//target.registerPlugin(new TileCompressionPlugin()); // TODO: Needed?

		const gltfLoader = new GLTFLoader(target.manager);
		gltfLoader.setDRACOLoader(this.dracoLoader);
		target.manager.addHandler( /\.gltf$/, gltfLoader);

		target.setCamera(this.camera);
		target.setResolutionFromRenderer(this.camera, this.renderer);

		this.earth.add(target.group);

		this.controls.setTilesRenderer(target);

		target.addEventListener('load-tile-set', () => this.renderingNeedsUpdate = true);
		target.addEventListener('load-model', (o: {scene?: Group, tile?: Tile}) => {
			console.log(o.tile);
			if (this.isTileInsideSwitzerland(o.tile!.boundingVolume.box!)) {
				// Make Google Tiles much transparent to allow seeing swisstopo tiles instead.
				o.scene!.traverse((child) => {
					const mesh = child as Mesh;
					if (mesh && mesh.material) {
						if (Array.isArray(mesh.material)) {
							for (const m of mesh.material) {
								m.transparent = true;
								m.opacity = 0.2;
							}
						} else {
							mesh.material.transparent = true;
							mesh.material.opacity = 0.2;
						}
					}
				});
			}
			this.renderingNeedsUpdate = true
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
		target.addEventListener('load-model', () => this.renderingNeedsUpdate = true);
	}

	private render(): void {
		requestAnimationFrame((_timestamp: DOMHighResTimeStamp) => {
			this.render();
		});

		this.stats.update();

		if (this.renderingNeedsUpdate) {
			console.log("Updating render");
			this.renderingNeedsUpdate = false;

			this.controls.update();
			this.camera.updateMatrixWorld();
			
			if (this.googleTiles.hasCamera(this.camera)) {
				this.googleTiles.update();
			}
			if (this.swisstopoBuildingsTiles.hasCamera(this.camera)) {
				this.swisstopoBuildingsTiles.update();
			}
			if (this.swisstopoTlmTiles.hasCamera(this.camera)) {
				this.swisstopoTlmTiles.update();
			}
			if (this.swisstopoVegetationTiles.hasCamera(this.camera)) {
				this.swisstopoVegetationTiles.update();
			}
			if (this.swisstopoNamesTiles.hasCamera(this.camera)) {
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
		const obbMinCornerCoords = WGS84_ELLIPSOID.getPositionToCartographic(REUSABLE_VECTOR3.set(obbCenter.x, obbCenter.y, obbCenter.z).sub(obbX).sub(obbY).sub(obbZ), {});
		const obbMaxCornerCoords = WGS84_ELLIPSOID.getPositionToCartographic(REUSABLE_VECTOR3.set(obbCenter.x, obbCenter.y, obbCenter.z).add(obbX).add(obbY).add(obbZ), {});
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
