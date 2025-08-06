import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { WebGLRenderer } from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { AerialPerspectiveEffect } from '@takram/three-atmosphere';

export class DebugGui extends GUI {
	constructor(
		renderer: WebGLRenderer,
		swisstopoTerrainTiles: TilesRenderer,
		aerialPerspective: AerialPerspectiveEffect,
		referenceDate: Date,
		onValueChange: () => void
	) {
		super({ width: 300 });

		this.add({ hours: referenceDate.getHours() }, 'hours', 0, 24).onChange(value => {
			referenceDate.setHours(value);
			onValueChange();
		});

		this.add(aerialPerspective, 'albedoScale', 0, 2).onChange(onValueChange);
		this.add(aerialPerspective, 'correctAltitude').onChange(onValueChange);

		this.add(renderer, 'toneMappingExposure', 0, 100).onChange(onValueChange);

		/*this.add(swisstopoTerrainTiles.group.position, 'x', 0, 50).onChange(onValueChange);
		this.add(swisstopoTerrainTiles.group.position, 'y', 0, 20).onChange(onValueChange);
		this.add(swisstopoTerrainTiles.group.position, 'z', 0, 50).onChange(onValueChange);*/
	}
}
