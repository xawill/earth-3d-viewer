import { Component, ElementRef, ViewChild } from '@angular/core';
import { GoogleCloudAuthPlugin, GooglePhotorealisticTilesRenderer, Tile, TilesRenderer, WGS84_ELLIPSOID } from '3d-tiles-renderer';
import { AmbientLight, AxesHelper, Box3, Box3Helper, BoxGeometry, BoxHelper, DirectionalLight, DoubleSide, Group, LinearToneMapping, MathUtils, Matrix4, Mesh, MeshBasicMaterial, Object3D, PCFSoftShadowMap, PerspectiveCamera, Quaternion, Scene, Sphere, SphereGeometry, Vector3, WebGLRenderer } from 'three';
import Stats from 'stats.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GlobeControls } from '3d-tiles-renderer/src/three/controls/GlobeControls.js';
import { TileCompressionPlugin } from '../../plugins/TileCompressionPlugin';

const SWISSTOPO_BUILDINGS_3D_TILES_TILESET_URL = "https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json";
const SWISSTOPO_TLM_3D_TILES_TILESET_URL = "https://3d.geo.admin.ch/ch.swisstopo.swisstlm3d.3d/v1/tileset.json";
const SWISSTOPO_VEGETATION_3D_TILES_TILESET_URL = "https://3d.geo.admin.ch/ch.swisstopo.vegetation.3d/v1/tileset.json";
const SWISSTOPO_NAMES_3D_TILES_TILESET_URL = "https://3d.geo.admin.ch/3d-tiles/ch.swisstopo.swissnames3d.3d/20180716/tileset.json"; // TODO: .vctr format not supported (yet). // TODO: Find most recent tileset (if it even exists?)

const GOOGLE_MAPS_REALISTIC_3D_TILES_API_KEY = "AIzaSyApSAMZSpLxtGq2eYmxWYabuJ3MfC5wkVA";

const EARTH_RADIUS_AT_EQUATOR = 6378137; // [m]

const DEFAULT_START_COORDS = [46.516591, 6.629047];

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

	private googleTiles = new GooglePhotorealisticTilesRenderer();
	private swisstopoBuildingsTiles = new TilesRenderer(SWISSTOPO_BUILDINGS_3D_TILES_TILESET_URL);
	private swisstopoTlmTiles = new TilesRenderer(SWISSTOPO_TLM_3D_TILES_TILESET_URL);
	private swisstopoVegetationTiles = new TilesRenderer(SWISSTOPO_VEGETATION_3D_TILES_TILESET_URL);

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
		this.dirLight.position.set( 1, 2, 3 ).multiplyScalar( 40 );
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

	private initGoogleTileset(target: GooglePhotorealisticTilesRenderer): void {
		target.displayActiveTiles = true;
		target.registerPlugin( new GoogleCloudAuthPlugin( { apiToken: GOOGLE_MAPS_REALISTIC_3D_TILES_API_KEY } ) );
		//target.registerPlugin(new TileCompressionPlugin()); // TODO: Needed?

		const gltfLoader = new GLTFLoader(target.manager);
		gltfLoader.setDRACOLoader(this.dracoLoader);
		target.manager.addHandler( /\.gltf$/, gltfLoader);

		target.setCamera(this.camera);
		target.setResolutionFromRenderer(this.camera, this.renderer);

		this.earth.add(target.group);

		this.controls.setTilesRenderer(target);

		target.addEventListener('load-tile-set', () => this.renderingNeedsUpdate = true);
		target.addEventListener('load-model', () => this.renderingNeedsUpdate = true);
	}

	private initSwisstopoTileset(target: TilesRenderer): void {
		target.displayActiveTiles = true;

		const gltfLoader = new GLTFLoader(target.manager);
		gltfLoader.setDRACOLoader(this.dracoLoader);
		target.manager.addHandler( /\.gltf$/, gltfLoader);

		target.setCamera(this.camera);
		target.setResolutionFromRenderer(this.camera, this.renderer);

		this.earth.add(target.group);
		
		target.addEventListener('load-tile-set', () => {
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
			
			if (this.googleTiles) {
				this.googleTiles.update();
			}
			if (this.swisstopoBuildingsTiles) {
				this.swisstopoBuildingsTiles.update();
			}
			if (this.swisstopoTlmTiles) {
				this.swisstopoTlmTiles.update();
			}
			if (this.swisstopoVegetationTiles) {
				this.swisstopoVegetationTiles.update();
			}
			
			this.renderer.render(this.scene, this.camera);
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
