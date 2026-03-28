import { Injectable } from '@angular/core';
import { Ellipsoid } from '3d-tiles-renderer';
import { MathUtils, Matrix4, Object3D, Ray, Raycaster, Vector2, Vector3 } from 'three';
import gsap from 'gsap';
import { SceneManagerService } from './scene-manager.service';
import { pow2Animation } from '../utils/graphics-utils';
import { EPS_DECIMALS, round } from '../utils/math-utils';
import {
	getUpDirection,
	haversineDistance,
	LatLng,
	LatLon,
	threejsPositionToTiles,
	tilesPositionToThreejs,
} from '../utils/map-utils';
import {
	DEFAULT_START_COORDS,
	HEIGHT_ABOVE_TARGET_COORDS_ELEVATION,
	HEIGHT_FULL_GLOBE_VISIBLE,
	TOLERANCE_DISTANCE_COORDS_NO_WAIT_TO_DESCENT,
} from '../config/tiles.config';

const REUSABLE_VECTOR2 = new Vector2();
const REUSABLE_VECTOR3_1 = new Vector3();
const REUSABLE_VECTOR3_2 = new Vector3();
const REUSABLE_MATRIX4 = new Matrix4();
const REUSABLE_RAY = new Ray();

@Injectable({ providedIn: 'root' })
export class CameraAnimationService {
	currentPosition: LatLon & { height: number } = { lon: 0, lat: 0, height: 0 }; // [rad, rad, m]

	private sceneManager!: SceneManagerService;
	private ellipsoid!: Ellipsoid;

	private raycaster = new Raycaster();
	private zoomToCoordsAnimationTl = gsap.timeline();
	private destinationPosition = new Vector3();
	private resetOrbitCameraPosition = new Vector3();
	private pivotPoint = new Vector3();
	private targetCameraUp = new Vector3();

	constructor() {
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

	init(sceneManager: SceneManagerService, ellipsoid: Ellipsoid): void {
		this.sceneManager = sceneManager;
		this.ellipsoid = ellipsoid;

		sceneManager.setOnControlsStartCallback(() => {
			if (this.zoomToCoordsAnimationTl.isActive()) {
				this.zoomToCoordsAnimationTl.kill();
			}
		});

		// Set init camera position
		this.currentPosition.lon = DEFAULT_START_COORDS.lng * MathUtils.DEG2RAD;
		this.currentPosition.lat = DEFAULT_START_COORDS.lat * MathUtils.DEG2RAD;
		this.currentPosition.height = HEIGHT_FULL_GLOBE_VISIBLE;
		this.moveCameraTo(this.currentPosition);
	}

	currentPositionLatLng(): LatLng {
		return {
			lat: this.currentPosition.lat * MathUtils.RAD2DEG,
			lng: this.currentPosition.lon * MathUtils.RAD2DEG,
		};
	}

	async zoomTo(
		destination: { coords: google.maps.LatLng; elevation: number },
		onComplete?: () => void
	): Promise<void> {
		const camera = this.sceneManager.camera;
		const controls = this.sceneManager.controls;

		// Update currentPosition in case some user controls interaction moved the position since last address selection
		this.ellipsoid.getPositionToCartographic(
			threejsPositionToTiles(REUSABLE_VECTOR3_1.copy(camera.position)),
			this.currentPosition
		);

		const height = destination.elevation + HEIGHT_ABOVE_TARGET_COORDS_ELEVATION;

		tilesPositionToThreejs(
			this.ellipsoid.getCartographicToPosition(
				destination.coords.lat() * MathUtils.DEG2RAD,
				destination.coords.lng() * MathUtils.DEG2RAD,
				height,
				this.destinationPosition
			)
		);
		const originDestAngularDistance = round(camera.position.angleTo(this.destinationPosition), EPS_DECIMALS);
		const distancePercentage = pow2Animation(Math.abs(originDestAngularDistance) / Math.PI);

		const maxClimbAltitude = HEIGHT_FULL_GLOBE_VISIBLE;
		const climbHeight = Math.max(
			Math.max(distancePercentage * maxClimbAltitude, height) - this.currentPosition.height,
			0
		); // NB: This is climb height and not climb target altitude!
		const descentHeight = round(this.currentPosition.height + climbHeight - height, EPS_DECIMALS);

		// Don't move if we are already almost at destination
		const originDestToleranceRadius = 250; // [m]
		const originDestLinearDistance =
			2 *
			this.ellipsoid.calculateEffectiveRadius(destination.coords.lat()) *
			Math.tan(originDestAngularDistance / 2); // [m]
		const heightDiffTolerance = 2000; // [m]
		if (originDestLinearDistance < originDestToleranceRadius && descentHeight < heightDiffTolerance) {
			return;
		}

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
		const rotationDistance = haversineDistance(this.currentPosition, {
			lat: destination.coords.lat() * MathUtils.DEG2RAD,
			lon: destination.coords.lng() * MathUtils.DEG2RAD,
		});
		const descentAnimationDelayTime =
			rotationDistance < TOLERANCE_DISTANCE_COORDS_NO_WAIT_TO_DESCENT ? 0 : totalAnimationDuration / 2;

		this.raycaster.setFromCamera(REUSABLE_VECTOR2.set(0, 0), camera);
		REUSABLE_RAY.copy(this.raycaster.ray).applyMatrix4(
			REUSABLE_MATRIX4.copy(this.sceneManager.earth.matrixWorld).invert()
		);
		const intersection = this.ellipsoid.intersectRay(REUSABLE_RAY, this.pivotPoint);
		if (intersection === null) {
			// No ray intersection with globe
			controls.getPivotPoint(this.pivotPoint);
		} else {
			// Transform result from ellipsoid local space back to world space
			this.pivotPoint.applyMatrix4(this.sceneManager.earth.matrixWorld);
		}
		const pivotRadius = REUSABLE_VECTOR3_1.subVectors(camera.position, this.pivotPoint).length();
		this.resetOrbitCameraPosition
			.copy(this.pivotPoint)
			.addScaledVector(REUSABLE_VECTOR3_2.copy(this.pivotPoint).normalize(), pivotRadius);

		getUpDirection(this.ellipsoid, this.pivotPoint, this.targetCameraUp);

		const pivotResetTl = () => {
			return gsap
				.timeline({ defaults: { duration: 1, ease: 'none' } })
				.eventCallback('onStart', () => {
					// Update camera up vector to reflect current rotation around pivot point
					controls.getCameraUpDirection(camera.up);
				})
				.to(
					camera.position,
					{
						x: this.resetOrbitCameraPosition.x,
						y: this.resetOrbitCameraPosition.y,
						z: this.resetOrbitCameraPosition.z,
					},
					0
				)
				.to(camera.up, { x: this.targetCameraUp.x, y: this.targetCameraUp.y, z: this.targetCameraUp.z }, 0)
				.eventCallback('onUpdate', () => {
					camera.lookAt(this.pivotPoint);
					this.sceneManager.renderingNeedsUpdate = true;
				})
				.eventCallback('onComplete', () => {
					// Reset camera up vector since it shall stay Object3D.DEFAULT_UP for GlobeControls
					camera.up.copy(Object3D.DEFAULT_UP);
					// Update currentPosition
					this.ellipsoid.getPositionToCartographic(
						threejsPositionToTiles(REUSABLE_VECTOR3_1.copy(camera.position)),
						this.currentPosition
					);
				});
		};
		const cameraTravelTl = () => {
			return gsap
				.timeline()
				.to(
					this.currentPosition,
					{
						precise: {
							lon: destination.coords.lng() * MathUtils.DEG2RAD,
							lat: destination.coords.lat() * MathUtils.DEG2RAD,
						},
						duration: totalAnimationDuration,
						ease:
							climbAnimationDuration === 0 &&
							rotationDistance < TOLERANCE_DISTANCE_COORDS_NO_WAIT_TO_DESCENT
								? 'power4.out'
								: 'power4.inOut',
					},
					0
				)
				.to(
					this.currentPosition,
					{
						height: this.currentPosition.height + climbHeight,
						duration: climbAnimationDuration,
						ease: 'power3.in',
					},
					'<'
				)
				.to(
					this.currentPosition,
					{ height: height, duration: descentAnimationDuration, ease: 'power3.out' },
					climbAnimationDuration === 0 ? descentAnimationDelayTime : '>' // Don't go down too quickly and give time to the user to see the globe rotating in case we are already super zoomed out.
				)
				.eventCallback('onUpdate', () => {
					this.moveCameraTo(this.currentPosition);
				})
				.eventCallback('onComplete', () => {
					onComplete?.();
					this.sceneManager.isControlsRotationReset = true;
				});
		};
		this.zoomToCoordsAnimationTl = gsap.timeline();
		if (!this.sceneManager.isControlsRotationReset) {
			this.zoomToCoordsAnimationTl.add(pivotResetTl());
		}
		this.zoomToCoordsAnimationTl.add(cameraTravelTl());
	}

	private moveCameraTo(coords: { lon: number; lat: number; height: number }): void {
		tilesPositionToThreejs(
			this.ellipsoid.getCartographicToPosition(
				coords.lat,
				coords.lon,
				coords.height,
				this.sceneManager.camera.position
			)
		);
		this.sceneManager.camera.lookAt(0, 0, 0);
		this.sceneManager.renderingNeedsUpdate = true;
	}
}
