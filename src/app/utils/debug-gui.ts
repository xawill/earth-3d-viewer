import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { PerspectiveCamera, WebGLRenderer } from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { AerialPerspectiveEffect } from '@takram/three-atmosphere';

export class DebugGui extends GUI {
	constructor(
		renderer: WebGLRenderer,
		camera: PerspectiveCamera,
		googleTiles: TilesRenderer,
		swisstopoTerrainTiles: TilesRenderer,
		swisstopoBuildingsTiles: TilesRenderer,
		swisstopoTlmTiles: TilesRenderer,
		swisstopoVegetationTiles: TilesRenderer,
		aerialPerspective: AerialPerspectiveEffect,
		onValueChange: () => void
	) {
		super({ width: 300 });

		this.add(camera, 'fov', 0, 90).onChange(onValueChange);

		this.add(aerialPerspective, 'albedoScale', 0, 2).onChange(onValueChange);
		this.add(aerialPerspective, 'correctAltitude').onChange(onValueChange);

		this.add(renderer, 'toneMappingExposure', 0, 100).onChange(onValueChange);

		this.add(googleTiles, 'errorTarget', 1, 100)
			.name('google 3d tiles error target')
			.onChange(value => {
				(googleTiles.getPluginByName('UPDATE_ON_CHANGE_PLUGIN') as any).needsUpdate = true;
				onValueChange();
			});
		this.add(swisstopoTerrainTiles, 'errorTarget', 1, 50)
			.name('swisstopo terrain error target')
			.onChange(value => {
				(swisstopoTerrainTiles.getPluginByName('UPDATE_ON_CHANGE_PLUGIN') as any).needsUpdate = true;
				onValueChange();
			});
		this.add(swisstopoBuildingsTiles, 'errorTarget', 1, 100)
			.name('swisstopo buildings error target')
			.onChange(value => {
				(swisstopoBuildingsTiles.getPluginByName('UPDATE_ON_CHANGE_PLUGIN') as any).needsUpdate = true;
				onValueChange();
			});
		this.add(swisstopoTlmTiles, 'errorTarget', 1, 10000)
			.name('swisstopo tlm error target')
			.onChange(value => {
				(swisstopoTlmTiles.getPluginByName('UPDATE_ON_CHANGE_PLUGIN') as any).needsUpdate = true;
				onValueChange();
			});
		this.add(swisstopoVegetationTiles, 'errorTarget', 1, 50)
			.name('swisstopo vegetation error target')
			.onChange(value => {
				(swisstopoVegetationTiles.getPluginByName('UPDATE_ON_CHANGE_PLUGIN') as any).needsUpdate = true;
				onValueChange();
			});

		const stats = {
			get googleTilesCachedMB() {
				return ((googleTiles.lruCache as any).cachedBytes / 1000000).toFixed(3); // display in MB
			},
			get swisstopoTerrainTilesCachedMB() {
				return ((swisstopoTerrainTiles.lruCache as any).cachedBytes / 1000000).toFixed(3); // display in MB
			},
			get swisstopoBuildingsTilesCachedMB() {
				return ((swisstopoBuildingsTiles.lruCache as any).cachedBytes / 1000000).toFixed(3); // display in MB
			},
		};
		this.add(stats, 'googleTilesCachedMB').listen().disable();
		this.add(stats, 'swisstopoTerrainTilesCachedMB').listen().disable();
		this.add(stats, 'swisstopoBuildingsTilesCachedMB').listen().disable();

		/*this.add(swisstopoTerrainTiles.group.position, 'x', 0, 50).onChange(onValueChange);
		this.add(swisstopoTerrainTiles.group.position, 'y', 0, 20).onChange(onValueChange);
		this.add(swisstopoTerrainTiles.group.position, 'z', 0, 50).onChange(onValueChange);*/
	}
}
