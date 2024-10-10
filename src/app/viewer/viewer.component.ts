import { Component, ElementRef, ViewChild } from '@angular/core';
import { GoogleCloudAuthPlugin, GooglePhotorealisticTilesRenderer, Tile, TilesRenderer } from '3d-tiles-renderer';
import { AmbientLight, AxesHelper, Box3, Box3Helper, BoxGeometry, BoxHelper, DirectionalLight, DoubleSide, Group, MathUtils, Matrix4, Mesh, MeshBasicMaterial, Object3D, PCFSoftShadowMap, PerspectiveCamera, Quaternion, Scene, Sphere, SphereGeometry, Vector3, WebGLRenderer } from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EnvironmentControls } from '3d-tiles-renderer/src/three/controls/EnvironmentControls.js';
import { GlobeControls } from '3d-tiles-renderer/src/three/controls/GlobeControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const SWISSTOPO_3D_TILES_TILESET_URL = "https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json";
//const SWISSTOPO_3D_TILES_TILESET_URL = "https://3d.geo.admin.ch/ch.swisstopo.swisstlm3d.3d/v1/tileset.json";

const GOOGLE_MAPS_REALISTIC_3D_TILES_API_KEY = "AIzaSyApSAMZSpLxtGq2eYmxWYabuJ3MfC5wkVA";

const EARTH_RADIUS_AT_EQUATOR = 6378137; // [m]

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
	private controls!: any;
	private dirLight!: DirectionalLight;
	private earth = new Group();
	//private stats!: Stats;
	//private statsContainer!: HTMLElement;

	private tiles1!: TilesRenderer;
	private tiles2!: TilesRenderer;

	@ViewChild('canvas') canvas!: ElementRef;
		
	constructor() {
		
	}

	ngAfterViewInit() {
		this.scene = new Scene();

		// Primary camera view
		this.renderer = new WebGLRenderer({ antialias: true, canvas: this.canvas.nativeElement });
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setClearColor(0x151c1f);
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = PCFSoftShadowMap;
		
		this.camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 160000000);
		this.camera.position.set(627146.108, 4323465.036, EARTH_RADIUS_AT_EQUATOR);
		//this.camera.position.set(130000, EARTH_RADIUS_AT_EQUATOR, -30000);
		//this.camera.position.set(0, EARTH_RADIUS_AT_EQUATOR, 0);
		//this.camera.position.set(0, 1, 0);
		//this.camera.position.set( 1e3, 1e3, 1e3 ).multiplyScalar( 0.5 );
		//this.camera.lookAt(0, 0, 0);
		
		// Controls
		/*this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		//this.controls.rotateSpeed = 0.01;
		//this.controls.panSpeed = 0.01;
		//this.controls.zoomSpeed = 0.01;
		this.controls.screenSpacePanning = false;
		this.controls.minDistance = 1;
		this.controls.maxDistance = EARTH_RADIUS_AT_EQUATOR*2;*/

		this.controls = new GlobeControls(this.scene, this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;

		/*this.controls = new EnvironmentControls(this.scene, this.camera, this.renderer.domElement);
		//this.controls.adjustHeight = false;
		//this.controls.minDistance = 1;
		this.controls.cameraRadius = EARTH_RADIUS_AT_EQUATOR;
		this.controls.maxAltitude = Infinity;
		//this.controls.rotateSpeed = 0.001;
		//this.controls.zoomSpeed = 0.01;*/

		/*this.controls.addEventListener('change', () => {
			requestAnimationFrame((_timestamp: DOMHighResTimeStamp) => {
				this.render();
			});
		});*/
	
		// Lights
		this.dirLight = new DirectionalLight(0xffffff, 1.25);
		this.dirLight.position.set( 1, 2, 3 ).multiplyScalar( 40 );
		this.dirLight.castShadow = true;
		this.dirLight.shadow.bias = - 0.01;
		this.dirLight.shadow.mapSize.setScalar( 2048 );

		const axesHelper = new AxesHelper( EARTH_RADIUS_AT_EQUATOR*1.2 );
		this.scene.add( axesHelper );
	
		const shadowCam = this.dirLight.shadow.camera;
		shadowCam.left = - 200;
		shadowCam.bottom = - 200;
		shadowCam.right = 200;
		shadowCam.top = 200;
		shadowCam.updateProjectionMatrix();
	
		this.scene.add(this.dirLight);
	
		const ambLight = new AmbientLight(0xffffff, 1);
		this.scene.add( ambLight );

		this.earth.rotateOnWorldAxis(new Vector3(1, 0, 0), -Math.PI/2);
		this.earth.rotateOnWorldAxis(new Vector3(0, 1, 0), -Math.PI/2);
		this.scene.add(this.earth);

		//this.earth.add(new Mesh(new BoxGeometry(100000, 100000, 100000), new MeshBasicMaterial({color: 0x00ff00})));
		//this.earth.add(new Mesh(new SphereGeometry(EARTH_RADIUS_AT_EQUATOR, 50, 50), new MeshBasicMaterial({color: 0xff0000, side: DoubleSide, transparent: true, opacity: 0.15, wireframe: true})));
	
		this.initTiles();
		this.initGooglePhotorealistic3dTiles();
	
		this.onWindowResize();
		window.addEventListener( 'resize', this.onWindowResize, false );
	
		// GUI
		/*const gui = new GUI();
		gui.width = 300;
		gui.add( params, 'orthographic' );
		gui.add( params, 'material', { DEFAULT, GRADIENT, TOPOGRAPHIC_LINES, LIGHTING } )
			.onChange( () => {
	
				tiles.forEachLoadedModel( updateMaterial );
	
			} );
		gui.add( params, 'rebuild' );
		gui.open();
	
		// Stats
		this.stats = new Stats();
		this.stats.showPanel( 0 );
		document.body.appendChild(this.stats.dom);
	
		this.statsContainer = document.createElement( 'div' );
		this.statsContainer.style.position = 'absolute';
		this.statsContainer.style.top = '0';
		this.statsContainer.style.left = '0';
		this.statsContainer.style.color = 'white';
		this.statsContainer.style.width = '100%';
		this.statsContainer.style.textAlign = 'center';
		this.statsContainer.style.padding = '5px';
		this.statsContainer.style.pointerEvents = 'none';
		this.statsContainer.style.lineHeight = '1.5em';
		document.body.appendChild(this.statsContainer);*/

		this.render();
	}

	private initGooglePhotorealistic3dTiles(): void {
		this.tiles1 = new GooglePhotorealisticTilesRenderer();
		this.tiles1.registerPlugin( new GoogleCloudAuthPlugin( { apiToken: GOOGLE_MAPS_REALISTIC_3D_TILES_API_KEY } ) );
		//this.tiles.registerPlugin( new TileCompressionPlugin() );
		//this.tiles.registerPlugin( new TilesFadePlugin() );
		//(this.tiles as GooglePhotorealisticTilesRenderer).setLatLonToYUp( 90 * MathUtils.DEG2RAD, 0 * MathUtils.DEG2RAD );

		this.tiles1.displayActiveTiles = true;
		this.tiles1.autoDisableRendererCulling = false;
		this.tiles1.optimizeRaycast = false;

		const dracoLoader = new DRACOLoader();
		dracoLoader.setDecoderPath( 'libs/draco/gltf/' );

		const loader = new GLTFLoader( this.tiles1.manager );
		loader.setDRACOLoader( dracoLoader );

		this.tiles1.manager.addHandler( /\.gltf$/, loader );

		this.earth.add(this.tiles1.group );

		this.tiles1.setCamera( this.camera );
		this.tiles1.setResolutionFromRenderer( this.camera, this.renderer );

		this.controls.setTilesRenderer( this.tiles1 );
	}



	private rotationBetweenDirections(dir1: Vector3, dir2: Vector3) {

		const rotation = new Quaternion();
		const a = new Vector3().crossVectors( dir1, dir2 );
		rotation.x = a.x;
		rotation.y = a.y;
		rotation.z = a.z;
		rotation.w = 1 + dir1.clone().dot( dir2 );
		rotation.normalize();

		return rotation;

	}

	private initTiles(): void {
		/*if (this.tiles) {
			if (this.tiles.group.parent) {
				this.tiles.group.parent.remove(this.tiles.group);
			}
			this.tiles.dispose();
		}*/
	
		this.tiles2 = new TilesRenderer(SWISSTOPO_3D_TILES_TILESET_URL);
		//this.tiles.maxDepth = 1;
		//this.tiles2.displayActiveTiles = true;
		//this.tiles2.autoDisableRendererCulling = false;
		//this.tiles2.optimizeRaycast = false;

		const dracoLoader = new DRACOLoader();
		dracoLoader.setDecoderPath( 'libs/draco/gltf/' );

		const loader = new GLTFLoader( this.tiles2.manager );
		loader.setDRACOLoader( dracoLoader );

		this.tiles2.manager.addHandler( /\.gltf$/, loader );

		//this.tiles2.errorTarget = 2;
		//this.tiles.addEventListener( 'load-model', this.onLoadModel);
		//this.tiles.addEventListener( 'dispose-model', this.onDisposeModel);
		//this.offsetParent.add(this.tiles.group);

		this.tiles2.setCamera( this.camera );
		this.tiles2.setResolutionFromRenderer( this.camera, this.renderer );
		this.tiles2.addEventListener( 'load-tile-set', () => {

			/*const sphere = new Sphere();
			this.tiles2.getBoundingSphere( sphere );

			const matrix = new Matrix4();
			const box = new Box3();
			this.tiles2.getBoundingBox(box)
			const bbox = new Mesh(new BoxGeometry(box.max.x-box.min.x, box.max.y-box.min.y, box.max.z-box.min.z), new MeshBasicMaterial({color: 0x00ff00}));
			console.log(box);
			box.getCenter(bbox.position);
			console.log(bbox.position);
			this.earth.add(bbox);*/

			//box.getCenter(this.camera.position);

			/*const position = sphere.center.clone();
			const distanceToEllipsoidCenter = position.length();

			const surfaceDirection = position.normalize();
			const up = new Vector3( 0, 1, 0 );
			const rotationToNorthPole = this.rotationBetweenDirections( surfaceDirection, up );

			this.tiles.group.quaternion.x = rotationToNorthPole.x;
			this.tiles.group.quaternion.y = rotationToNorthPole.y;
			this.tiles.group.quaternion.z = rotationToNorthPole.z;
			this.tiles.group.quaternion.w = rotationToNorthPole.w;

			//this.tiles.group.rotateOnWorldAxis(Object3D.DEFAULT_UP, Math.PI);

			this.tiles.group.updateMatrix();
			this.tiles.group.updateMatrixWorld();
			this.tiles.group.updateWorldMatrix(false, true);

			this.tiles.group.rotateOnWorldAxis(Object3D.DEFAULT_UP, Math.PI);
			//this.tiles.group.rotateOnAxis(Object3D.DEFAULT_UP, Math.PI);

			this.tiles.group.updateMatrix();
			this.tiles.group.updateMatrixWorld();
			this.tiles.group.updateWorldMatrix(false, true);*/

			//this.tiles.group.position.x = 130000;
			//this.tiles.group.position.y = - distanceToEllipsoidCenter - 1500;
			//this.tiles.group.position.z = 30000;*/

			//this.earth.rotateOnWorldAxis(Object3D.DEFAULT_UP, Math.PI/2);
			//this.earth.rotateOnWorldAxis(new Vector3(1, 0, 0), -Math.PI/2);

			// Empirical values to superimpose SB3D with Google3dTiles. // TODO: Compute actual values.
			this.tiles2.group.position.x = 34;
			this.tiles2.group.position.y = 5;
			this.tiles2.group.position.z = 36;
		} );

		this.earth.add( this.tiles2.group );

		this.scene.add(new BoxHelper(this.earth, 0x0000ff));
	}

	private render(): void {
		requestAnimationFrame((_timestamp: DOMHighResTimeStamp) => {
			this.render();
		});
		this.controls.update();
		this.camera.updateMatrixWorld();
		this.tiles1.update();
		this.tiles2.update();
		this.renderer.render(this.scene, this.camera);
	}

	private onLoadModel(s: Object) {
		const scene = s as Scene;
		if (scene.traverse !== undefined) {
			scene.traverse(c => {
				const mesh = c as Mesh;
				if ( mesh.material ) {
		
					(mesh as any).originalMaterial = mesh.material;
					mesh.material = new MeshBasicMaterial({color: 0x00ff00});
		
				}
		
			} );
		}
	}

	private onDisposeModel(s: Object) {
		const scene = s as Scene;
		scene.traverse(c => {
			const mesh = c as Mesh;
			if (mesh.isMesh) {
				(mesh.material as any).dispose();
			}
		} );
	}

	private onWindowResize(): void {
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.renderer.setPixelRatio( window.devicePixelRatio );
		this.renderer.setSize( window.innerWidth, window.innerHeight );
		this.camera.updateProjectionMatrix();

		//this.updateOrthoCamera();
	}
}
