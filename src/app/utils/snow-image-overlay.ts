import { CanvasTexture, Color, MathUtils } from 'three';
import { TiledImageOverlay } from '3d-tiles-renderer/plugins';
import { ProjectionScheme } from '3d-tiles-renderer/src/three/plugins/images/utils/ProjectionScheme.js';
import {
	DEFAULT_ADDITIONAL_LAYER_OPACITY,
	METEOSWISS_SNOW_API_BASE_URL,
	METEOSWISS_SNOW_OVERVIEW_URL,
	SNOW_OVERLAY_LV03_XMIN,
	SNOW_OVERLAY_LV03_XMAX,
	SNOW_OVERLAY_LV03_YMIN,
	SNOW_OVERLAY_LV03_YMAX,
	SNOW_COLOR_MAP,
} from '../config/tiles.config';
import { lv03ToWgs84 } from './map-utils';

interface SnowOverviewResponse {
	gesamt: { start: number; end: number; image: string } | null;
}

// Pre-compute WGS84 bounding box from LV03 corners
const SW = lv03ToWgs84(SNOW_OVERLAY_LV03_XMIN, SNOW_OVERLAY_LV03_YMIN);
const NE = lv03ToWgs84(SNOW_OVERLAY_LV03_XMAX, SNOW_OVERLAY_LV03_YMAX);
const BOUNDS_MIN_LON_RAD = SW.lon * MathUtils.DEG2RAD;
const BOUNDS_MAX_LON_RAD = NE.lon * MathUtils.DEG2RAD;
const BOUNDS_MIN_LAT_RAD = SW.lat * MathUtils.DEG2RAD;
const BOUNDS_MAX_LAT_RAD = NE.lat * MathUtils.DEG2RAD;

const PROJECTION = new ProjectionScheme('EPSG:4326');
const NORMALIZED_BOUNDS = PROJECTION.toNormalizedRange([
	BOUNDS_MIN_LON_RAD,
	BOUNDS_MIN_LAT_RAD,
	BOUNDS_MAX_LON_RAD,
	BOUNDS_MAX_LAT_RAD,
]);

// Cache key for a normalized range
function rangeKey(range: number[]): string {
	return `${range[0].toFixed(8)}_${range[1].toFixed(8)}_${range[2].toFixed(8)}_${range[3].toFixed(8)}`;
}

/**
 * Custom overlay for the ImageOverlayPlugin that renders MeteoSwiss snow depth data on top of swisstopo terrain tiles. Implements the ImageOverlay interface from 3d-tiles-renderer.
 * TODO: Use actual SLF modelled data which look more precise: https://whiterisk.ch/fr/conditions/snow-maps/snow_depth
 */
export class SnowImageOverlay extends TiledImageOverlay {
	override readonly projection = PROJECTION;
	override readonly aspectRatio = 2; // EPSG:4326: longitude [-180,180] is 2× the latitude range [-90,90]

	private processedCanvas: HTMLCanvasElement | null = null;
	private textureCache = new Map<string, { texture: CanvasTexture }>();

	private rawImageData: ImageData | null = null; // Raw source image data — kept to reapply upscaling when passes change.
	private srcImageData: ImageData | null = null; // Source image data after Scale2x upscaling — used for per-pixel sampling in getTexture.
	private appliedRoundingPasses = -1; // roundingPasses used to produce srcImageData

	// Manual offsets to help align the overlay on top of Switzerland
	boundsOffsetX = 0; // LV03 easting [m]
	boundsOffsetY = 0; // LV03 northing [m]

	roundingPasses = 4; // Number of Scale2x passes for corner rounding. 0 = sharp pixels.

	constructor(options: { opacity?: number; color?: number } = {}) {
		super();
		this.opacity = options.opacity ?? DEFAULT_ADDITIONAL_LAYER_OPACITY;
		this.color = new Color(options.color ?? 0xffffff);
	}

	/** Call after changing boundsOffsetX/Y to flush cached textures so they are re-cropped. */
	clearTextureCache(): void {
		for (const { texture } of this.textureCache.values()) {
			texture.dispose();
		}
		this.textureCache.clear();
	}

	override async _init(): Promise<void> {
		const imageUrl = await this.fetchCurrentImageUrl();
		if (!imageUrl) {
			console.warn('SnowImageOverlay: no snow depth image available (seasonal)');
			return;
		}
		this.processedCanvas = await this.loadAndProcessImage(imageUrl);
		if (this.processedCanvas) {
			const ctx = this.processedCanvas.getContext('2d', { willReadFrequently: true })!;
			this.rawImageData = ctx.getImageData(0, 0, this.processedCanvas.width, this.processedCanvas.height);
			this.applySmoothing();
		}
	}

	/** (Re-)apply Scale2x upscaling to the raw source image. Called at init and when roundingPasses changes. */
	private applySmoothing(): void {
		if (!this.rawImageData) return;
		let current = new ImageData(
			new Uint8ClampedArray(this.rawImageData.data),
			this.rawImageData.width,
			this.rawImageData.height
		);
		const passes = Math.min(this.roundingPasses, 4); // cap at 4 passes (16× upscale)
		for (let i = 0; i < passes; i++) {
			current = SnowImageOverlay.scale2x(current);
		}
		this.srcImageData = current;
		this.appliedRoundingPasses = this.roundingPasses;
	}

	override hasContent(range: number[], _tile?: unknown): boolean {
		if (!this.processedCanvas) return false;
		const bounds = this.effectiveBounds;
		// range is in normalized [0,1] coordinates
		return !(range[2] < bounds[0] || range[0] > bounds[2] || range[3] < bounds[1] || range[1] > bounds[3]);
	}

	override async getTexture(range: number[], _tile?: unknown): Promise<CanvasTexture | null> {
		if (!this.processedCanvas || !this.srcImageData) return null;

		// Re-smooth source if the radius changed since last bake
		if (this.appliedRoundingPasses !== this.roundingPasses) {
			this.applySmoothing();
		}

		const key = rangeKey(range);
		const cached = this.textureCache.get(key);
		if (cached) return cached.texture;

		const imgW = this.srcImageData!.width;
		const imgH = this.srcImageData!.height;
		const bounds = this.effectiveBounds;
		const srcData = this.srcImageData!.data;

		// For each output pixel, compute the exact source pixel by mapping output → normalized UV → source pixel.
		// This is a manual nearest-neighbor lookup that always picks the same source pixel for a given geographic location, regardless of tile zoom level.
		const tileSize = 256;
		const canvas = document.createElement('canvas');
		canvas.width = tileSize;
		canvas.height = tileSize;
		const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
		const outData = ctx.createImageData(tileSize, tileSize);
		const out = outData.data;

		const boundsW = bounds[2] - bounds[0];
		const boundsH = bounds[3] - bounds[1];

		for (let py = 0; py < tileSize; py++) {
			// Normalized V for this output row (top of tile = range maxLat = range[3])
			const v = range[3] - ((py + 0.5) / tileSize) * (range[3] - range[1]);
			// Source image row (top=0 is north/maxLat)
			const srcY = Math.floor((1 - (v - bounds[1]) / boundsH) * imgH);
			if (srcY < 0 || srcY >= imgH) continue;

			for (let px = 0; px < tileSize; px++) {
				// Normalized U for this output column
				const u = range[0] + ((px + 0.5) / tileSize) * (range[2] - range[0]);
				// Source image column
				const srcX = Math.floor(((u - bounds[0]) / boundsW) * imgW);
				if (srcX < 0 || srcX >= imgW) continue;

				const srcIdx = (srcY * imgW + srcX) * 4;
				const dstIdx = (py * tileSize + px) * 4;
				out[dstIdx] = srcData[srcIdx];
				out[dstIdx + 1] = srcData[srcIdx + 1];
				out[dstIdx + 2] = srcData[srcIdx + 2];
				out[dstIdx + 3] = srcData[srcIdx + 3];
			}
		}

		ctx.putImageData(outData, 0, 0);

		const texture = new CanvasTexture(canvas);
		texture.needsUpdate = true;

		this.textureCache.set(key, { texture });
		return texture;
	}

	dispose(): void {
		for (const { texture } of this.textureCache.values()) {
			texture.dispose();
		}
		this.textureCache.clear();
		this.processedCanvas = null;
		this.rawImageData = null;
		this.srcImageData = null;
	}

	private async fetchCurrentImageUrl(): Promise<string | null> {
		try {
			const response = await this.fetch(METEOSWISS_SNOW_OVERVIEW_URL);
			const data: SnowOverviewResponse = await response.json();
			if (!data.gesamt?.image) return null;
			return `${METEOSWISS_SNOW_API_BASE_URL}${data.gesamt.image}`;
		} catch (error) {
			console.error('SnowImageOverlay: failed to fetch overview JSON', error);
			return null;
		}
	}

	private async loadAndProcessImage(imageUrl: string): Promise<HTMLCanvasElement | null> {
		try {
			const response = await this.fetch(imageUrl);
			const blob = await response.blob();
			const imageBitmap = await createImageBitmap(blob);

			const canvas = document.createElement('canvas');
			canvas.width = imageBitmap.width;
			canvas.height = imageBitmap.height;
			const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
			ctx.drawImage(imageBitmap, 0, 0);

			const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
			const pixels = imageData.data;

			for (let i = 0; i < pixels.length; i += 4) {
				const r = pixels[i];
				const g = pixels[i + 1];
				const b = pixels[i + 2];

				// Red mask (outside Switzerland) → transparent
				if (r === 255 && g === 0 && b === 0) {
					pixels[i] = 0;
					pixels[i + 1] = 0;
					pixels[i + 2] = 0;
					pixels[i + 3] = 0;
					continue;
				}

				// Black (no snow) → transparent
				if (r === 0 && g === 0 && b === 0) {
					pixels[i + 3] = 0;
					continue;
				}

				// Teal snow colors: G === B, R === 0
				if (r === 0 && g === b && g > 0) {
					const levelIndex = Math.round(g / 28) - 1;
					const color = SNOW_COLOR_MAP[Math.min(levelIndex, SNOW_COLOR_MAP.length - 1)];
					pixels[i] = color[0];
					pixels[i + 1] = color[1];
					pixels[i + 2] = color[2];
					pixels[i + 3] = color[3];
				}
			}

			ctx.putImageData(imageData, 0, 0);
			return canvas;
		} catch (error) {
			console.error('SnowImageOverlay: failed to load/process image', error);
			return null;
		}
	}

	// Returns the normalized bounds recomputed from LV03 corners shifted by the current offsets.
	private get effectiveBounds(): number[] {
		if (this.boundsOffsetX === 0 && this.boundsOffsetY === 0) return NORMALIZED_BOUNDS;
		const sw = lv03ToWgs84(
			SNOW_OVERLAY_LV03_XMIN + this.boundsOffsetX,
			SNOW_OVERLAY_LV03_YMIN + this.boundsOffsetY
		);
		const ne = lv03ToWgs84(
			SNOW_OVERLAY_LV03_XMAX + this.boundsOffsetX,
			SNOW_OVERLAY_LV03_YMAX + this.boundsOffsetY
		);
		return PROJECTION.toNormalizedRange([
			sw.lon * MathUtils.DEG2RAD,
			sw.lat * MathUtils.DEG2RAD,
			ne.lon * MathUtils.DEG2RAD,
			ne.lat * MathUtils.DEG2RAD,
		]);
	}

	/**
	 * Scale2x (EPX) pixel-art upscaling: doubles the resolution while rounding
	 * corners of same-colour regions. No blending — every output pixel is an exact
	 * copy of one of its source neighbours. This guarantees no holes or overlaps:
	 * adjacent regions follow the same symmetric rule so their boundaries match.
	 *
	 *   Layout:         Output 2×2:
	 *       A              1  2
	 *     C P B             3  4
	 *       D
	 *
	 *   1 = (C==A && C!=D && A!=B) ? A : P
	 *   2 = (A==B && A!=C && B!=D) ? B : P
	 *   3 = (C==D && C!=A && D!=B) ? C : P
	 *   4 = (D==B && D!=C && B!=A) ? D : P
	 */
	private static scale2x(src: ImageData): ImageData {
		const sw = src.width;
		const sh = src.height;
		const s = src.data;
		const dw = sw * 2;
		const dh = sh * 2;
		const dst = new ImageData(dw, dh);
		const d = dst.data;

		/** Are four RGBA bytes at offsets i and j identical? */
		const eq = (i: number, j: number) =>
			s[i] === s[j] && s[i + 1] === s[j + 1] && s[i + 2] === s[j + 2] && s[i + 3] === s[j + 3];

		const copyPixel = (dstOff: number, srcOff: number) => {
			d[dstOff] = s[srcOff];
			d[dstOff + 1] = s[srcOff + 1];
			d[dstOff + 2] = s[srcOff + 2];
			d[dstOff + 3] = s[srcOff + 3];
		};

		for (let y = 0; y < sh; y++) {
			for (let x = 0; x < sw; x++) {
				const P = (y * sw + x) * 4;
				const A = (Math.max(y - 1, 0) * sw + x) * 4;
				const D = (Math.min(y + 1, sh - 1) * sw + x) * 4;
				const C = (y * sw + Math.max(x - 1, 0)) * 4;
				const B = (y * sw + Math.min(x + 1, sw - 1)) * 4;

				const CA = eq(C, A),
					CD = eq(C, D),
					AB = eq(A, B),
					DB = eq(D, B);

				const o1 = (y * 2 * dw + x * 2) * 4;
				const o2 = o1 + 4;
				const o3 = ((y * 2 + 1) * dw + x * 2) * 4;
				const o4 = o3 + 4;

				copyPixel(o1, CA && !CD && !AB ? A : P);
				copyPixel(o2, AB && !CA && !DB ? B : P);
				copyPixel(o3, CD && !CA && !DB ? C : P);
				copyPixel(o4, DB && !CD && !AB ? D : P);
			}
		}

		return dst;
	}
}
