import { Injectable } from '@angular/core';
import { GlobeControls, WGS84_RADIUS } from '3d-tiles-renderer';
import {
	Group,
	HalfFloatType,
	MathUtils,
	NoToneMapping,
	PerspectiveCamera,
	Scene,
	Vector3,
	WebGLRenderer,
} from 'three';
import { EffectComposer, EffectMaterial, RenderPass } from 'postprocessing';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';

@Injectable({ providedIn: 'root' })
export class SceneManagerService {
	renderer!: WebGLRenderer;
	composer!: EffectComposer;
	scene = new Scene();
	camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, WGS84_RADIUS * 2);
	earth = new Group();
	controls!: GlobeControls;
	stats = new Stats();

	renderingNeedsUpdate = true;
	isMouseDragging = false; // Meaning that mouse is being dragged with either left or right button.
	areControlsDragging = false; // Meaning that user is moving globe with normal left mouse button.
	isControlsRotationReset = true; // Meaning that north is up and lookAt Earth center.

	private readonly REUSABLE_VECTOR3 = new Vector3();

	private onControlsStartCallback?: () => void;

	init(canvas: HTMLCanvasElement): void {
		this.renderer = new WebGLRenderer({
			powerPreference: 'high-performance',
			antialias: true,
			stencil: false,
			depth: false,
			logarithmicDepthBuffer: true,
			canvas,
		});
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		//this.renderer.localClippingEnabled = true;
		this.renderer.toneMapping = NoToneMapping;
		this.renderer.toneMappingExposure = 6;
		// TODO: Properly handle shadows with atmosphere (cast/receive shadows don't seem to work anymore).

		this.composer = new EffectComposer(this.renderer, {
			frameBufferType: HalfFloatType, // Use floating-point render buffer, as radiance/luminance is stored here.
			multisampling: 0,
		});
		this.composer.addPass(new RenderPass(this.scene, this.camera));

		this.controls = new GlobeControls(this.scene, this.camera, this.renderer.domElement);
		this.controls.enableDamping = false;
		this.controls.adjustHeight = false;
		this.controls.maxAltitude = MathUtils.degToRad(90);
		this.controls.minDistance = 0;

		// TODO: Filter raycasting so that if tiles are hidden they are not hit. See https://github.com/NASA-AMMOS/3DTilesRendererJS/pull/1261#discussion_r2274897359
		this.controls.addEventListener('start', () => {
			this.onControlsStartCallback?.();
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

		this.earth.rotateOnWorldAxis(this.REUSABLE_VECTOR3.set(1, 0, 0), -Math.PI / 2);
		this.earth.rotateOnWorldAxis(this.REUSABLE_VECTOR3.set(0, 1, 0), -Math.PI / 2);
		this.scene.add(this.earth);

		this.stats.showPanel(0);
		document.body.appendChild(this.stats.dom);

		this.onWindowResize();
		window.addEventListener('resize', () => this.onWindowResize(), false);
	}

	setOnControlsStartCallback(callback: () => void): void {
		this.onControlsStartCallback = callback;
	}

	registerDebugControls(debugGui: GUI, onValueChange: () => void): void {
		debugGui.add(this.camera, 'fov', 0, 90).onChange(onValueChange);
		debugGui.add(this.renderer, 'toneMappingExposure', 0, 100).onChange(onValueChange);
	}

	startRenderLoop(onUpdate: () => void): void {
		const renderLoop = () => {
			requestAnimationFrame((_timestamp: DOMHighResTimeStamp) => renderLoop());
			this.stats.update();

			if (this.renderingNeedsUpdate) {
				// TODO: Have a way to prevent updating tilesets during big position changes like after entering a new location in the search bar (at least at the beginning of the animation). This probably triggers a lot of useless tiles loading.
				//console.log('RENDERING');
				this.renderingNeedsUpdate = false;

				this.controls.update();
				this.camera.updateMatrixWorld();

				onUpdate();

				this.composer.passes.forEach(pass => {
					// Update effect materials with current camera settings
					if (pass.fullscreenMaterial instanceof EffectMaterial) {
						pass.fullscreenMaterial.adoptCameraSettings(this.camera);
					}
				});

				this.composer.render();
			}
		};
		renderLoop();
	}

	private onWindowResize(): void {
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
		this.renderingNeedsUpdate = true;
	}
}
