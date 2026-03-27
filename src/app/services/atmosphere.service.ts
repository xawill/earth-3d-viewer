import { Injectable } from '@angular/core';
import { EffectPass, NormalPass, SMAAEffect, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import {
	AerialPerspectiveEffect,
	AtmosphereParameters,
	getMoonDirectionECEF,
	getSunDirectionECEF,
	PrecomputedTexturesGenerator,
} from '@takram/three-atmosphere';
import { DitheringEffect, LensFlareEffect } from '@takram/three-geospatial-effects';
import { SceneManagerService } from './scene-manager.service';

@Injectable({ providedIn: 'root' })
export class AtmosphereService {
	aerialPerspective!: AerialPerspectiveEffect;

	async init(sceneManager: SceneManagerService): Promise<void> {
		const renderer = sceneManager.renderer;
		const camera = sceneManager.camera;
		const scene = sceneManager.scene;
		const composer = sceneManager.composer;
		const earth = sceneManager.earth;

		// Generate precomputed textures.
		const texturesGenerator = new PrecomputedTexturesGenerator(renderer);
		await texturesGenerator.update().catch(error => {
			console.error(error);
		});

		const atmosphereParameters = AtmosphereParameters.DEFAULT;
		atmosphereParameters.sunAngularRadius = 0.01;
		this.aerialPerspective = new AerialPerspectiveEffect(
			camera,
			{
				correctAltitude: true,
				correctGeometricError: true,
				albedoScale: 2 / Math.PI,
				transmittance: true,
				inscatter: true,
				sunLight: true,
				skyLight: true,
				sky: true,
				sun: true,
				moon: true,
				moonAngularRadius: 0.01,
				lunarRadianceScale: 10, // TODO: Possible to have the moon bring light to scene at night? See https://github.com/takram-design-engineering/three-geospatial/issues/80
			},
			atmosphereParameters
		);

		// TODO: Fix stars which are not visible in the atmosphere effect. Must use StarsMaterial? Or is it related to https://github.com/takram-design-engineering/three-geospatial/issues/28?

		Object.assign(this.aerialPerspective, texturesGenerator.textures);

		const normalPass = new NormalPass(scene, camera);
		this.aerialPerspective.normalBuffer = normalPass.texture;
		composer.addPass(normalPass);
		composer.addPass(new EffectPass(camera, this.aerialPerspective));
		composer.addPass(new EffectPass(camera, new LensFlareEffect()));
		composer.addPass(new EffectPass(camera, new ToneMappingEffect({ mode: ToneMappingMode.AGX })));
		composer.addPass(new EffectPass(camera, new SMAAEffect()));
		composer.addPass(new EffectPass(camera, new DitheringEffect()));

		this.aerialPerspective.worldToECEFMatrix.copy(earth.matrixWorld).invert();
	}

	updateSunMoon(referenceDate: Date): void {
		if (this.aerialPerspective) {
			getSunDirectionECEF(referenceDate, this.aerialPerspective.sunDirection);
			getMoonDirectionECEF(referenceDate, this.aerialPerspective.moonDirection);
		}
	}
}
