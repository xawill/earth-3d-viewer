import { Ellipsoid, TilesRenderer } from '3d-tiles-renderer';
import { Camera, Scene, EventDispatcher, Vector3 } from 'three';

import * as NasaTilesRenderer from '3d-tiles-renderer';
declare module '3d-tiles-renderer' {
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

		constructor(
			scene: Scene = null,
			camera: Camera = null,
			domElement: HTMLCanvasElement = null,
			tilesRenderer: TilesRenderer = null
		);

		update(deltaTime: number = 0);

		getPivotPoint(target: Vector3): Vector3;
		getCameraUpDirection(target: Vector3): Vector3;

		get enabled(): boolean;
		set enabled(enabled: boolean): void;

		// EventDispatcher mixins
		addEventListener(type: string, listener: (event: Event) => void): void;
		hasEventListener(type: string, listener: (event: Event) => void): boolean;
		removeEventListener(type: string, listener: (event: Event) => void): void;
		dispatchEvent(event: { type: string; [attachment: string]: any }): void;
	}

	export class GlobeControls extends EnvironmentControls {
		reorientOnDrag = true;
		scaleZoomOrientationAtEdges = false;

		constructor(
			scene: Scene = null,
			camera: Camera = null,
			domElement: HTMLCanvasElement = null,
			tilesRenderer: TilesRenderer = null
		);

		get ellipsoid(): Ellipsoid;

		setTilesRenderer(tilesRenderer: TilesRenderer): void;
		getDistanceToCenter(): number;

		update(deltaTime: number = 0): void;
	}

	export interface Ellipsoid {
		calculateEffectiveRadius(latitude: number): number;
	}
}
