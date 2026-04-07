import { Ellipsoid, WGS84_RADIUS } from '3d-tiles-renderer';
import { Vector3 } from 'three';

// TODO: Should be private readonly
const REUSABLE_VECTOR3_1 = new Vector3();
const REUSABLE_VECTOR3_2 = new Vector3();

export interface LatLng {
	lat: number; // [deg]
	lng: number; // [deg]
}

export interface LatLon {
	lat: number; // [rad]
	lon: number; // [rad]
}

export function tilesPositionToThreejs(position: Vector3): Vector3 {
	const positionX = position.x;
	const positionY = position.y;
	const positionZ = position.z;
	return position.set(positionY, positionZ, positionX);
}

export function threejsPositionToTiles(position: Vector3): Vector3 {
	const positionX = position.x;
	const positionY = position.y;
	const positionZ = position.z;
	return position.set(positionZ, positionX, positionY);
}

/**
 * Get the up direction of the object at position on the globe.
 * NB: Properly handles equator region, unlike 3D-Tiles-Renderer's GlobeControls.getCameraUpDirection() version.
 * @param ellipsoid - The ellipsoid representing the globe's shape
 * @param position - The current position vector in world coordinates
 * @param target - The vector to store the result in
 * @returns The up direction vector perpendicular to both the globe normal and east direction
 */
export function getUpDirection(ellipsoid: Ellipsoid, position: Vector3, target: Vector3): Vector3 {
	const globeNormal = ellipsoid.getPositionToNormal(position, REUSABLE_VECTOR3_1);
	const east = REUSABLE_VECTOR3_2.set(position.z, 0, -position.x).normalize();
	return target.crossVectors(globeNormal, east);
}

/**
 * Calculate the great-circle distance between two points on the Earth's surface.
 * @param origin - The origin point in latitude and longitude
 * @param destination - The destination point in latitude and longitude
 * @returns The distance in meters
 */
export function haversineDistance(origin: LatLon, destination: LatLon): number {
	const deltaLat = destination.lat - origin.lat;
	const deltaLng = destination.lon - origin.lon;

	const a =
		Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
		Math.cos(origin.lat) * Math.cos(destination.lat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return WGS84_RADIUS * c;
}

/**
 * Convert Swiss LV03 (CH1903) coordinates to WGS84 lat/lon in degrees. Uses the approximate formulas from swisstopo (https://www.swisstopo.admin.ch/en/transformations-3d-position).
 */
export function lv03ToWgs84(easting: number, northing: number): { lat: number; lon: number } {
	const yPrime = (easting - 600000) / 1000000;
	const xPrime = (northing - 200000) / 1000000;

	const latSec =
		16.9023892 +
		3.238272 * xPrime -
		0.270978 * yPrime * yPrime -
		0.002528 * xPrime * xPrime -
		0.0447 * yPrime * yPrime * xPrime -
		0.014 * xPrime * xPrime * xPrime;

	const lonSec =
		2.6779094 +
		4.728982 * yPrime +
		0.0791484 * yPrime * xPrime +
		0.1306 * yPrime * xPrime * xPrime -
		0.0436 * yPrime * yPrime * yPrime;

	return {
		lat: (latSec * 100) / 36,
		lon: (lonSec * 100) / 36,
	};
}
