import * as NasaTilesRenderer from '3d-tiles-renderer';
declare module '3d-tiles-renderer' {
	import { Ellipsoid, TilesRenderer } from '3d-tiles-renderer';
	import { Camera, Scene, EventDispatcher } from 'three';

	export class EnvironmentControls extends EventDispatcher {
		cameraRadius = 5;
		rotationSpeed = 1;
		minAltitude = 0;
		maxAltitude = 0.45 * Math.PI;
		minDistance = 10;
		maxDistance = Infinity;
		minZoom = 0;
		maxZoom = Infinity;
		zoomSpeed = 1;
		adjustHeight = true;
		enableDamping = false;
		dampingFactor = 0.15;
		
		constructor(scene: Scene = null, camera: Camera = null, domElement: HTMLCanvasElement = null, tilesRenderer: TilesRenderer = null);

		update(deltaTime: number = 0);

		// EventDispatcher mixins
		addEventListener( type: string, listener: ( event: Event ) => void ): void;
		hasEventListener( type: string, listener: ( event: Event ) => void ): boolean;
		removeEventListener( type: string, listener: ( event: Event ) => void ): void;
		dispatchEvent( event: { type: string; [attachment: string]: any } ): void;
	}

	export class GlobeControls extends EnvironmentControls {
		reorientOnDrag = true;
		scaleZoomOrientationAtEdges = false;
		
		constructor(scene: Scene = null, camera: Camera = null, domElement: HTMLCanvasElement = null, tilesRenderer: TilesRenderer = null);

		get ellipsoid(): Ellipsoid;

		setTilesRenderer(tilesRenderer: TilesRenderer): void;
		getDistanceToCenter(): number;

		update(deltaTime: number = 0): void;
	}
}