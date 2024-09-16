declare module '3d-tiles-renderer/src/three/controls/EnvironmentControls.js' {
	import { TilesRenderer } from '3d-tiles-renderer';
	import { Camera, Scene } from 'three';

	export class EnvironmentControls extends EventDispatcher {
		adjustHeight: boolean;
		minDistance: number;
		maxAltitude: number;
		
		constructor(scene: Scene = null, camera: Camera = null, domElement: HTMLCanvasElement = null, tilesRenderer: TilesRenderer = null);

		update(deltaTime: number = 0);
	}
}

declare module '3d-tiles-renderer/src/three/controls/GlobeControls.js' {
	import { TilesRenderer } from '3d-tiles-renderer';
	import { Camera, Scene } from 'three';

	export class GlobeControls extends EventDispatcher {
		enableDamping: boolean;
		
		constructor(scene: Scene = null, camera: Camera = null, domElement: HTMLCanvasElement = null, tilesRenderer: TilesRenderer = null);

		update(deltaTime: number = 0);
	}
}