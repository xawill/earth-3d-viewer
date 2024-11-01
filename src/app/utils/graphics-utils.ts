import { Vector3 } from 'three';

// See how the function looks like: https://www.wolframalpha.com/input?i=-x%5E2%2B2x
export function pow2Animation(x: number): number {
	return -(x**2)+2*x;
}

export function tilesPositionToThreejs(position: Vector3): Vector3 {
	const positionX = position.x;
	const positionY = position.y;
	const positionZ = position.z;
	return position.set(positionY, positionZ, positionX)
}

export function threejsPositionToTiles(position: Vector3): Vector3 {
	const positionX = position.x;
	const positionY = position.y;
	const positionZ = position.z;
	return position.set(positionZ, positionX, positionY)
}