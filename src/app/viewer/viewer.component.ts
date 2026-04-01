import { Component, ElementRef, inject, ViewChild } from '@angular/core';
import { WMTSCapabilitiesResult } from '3d-tiles-renderer/plugins';
import { AddressSearchComponent } from '../address-search/address-search.component';
import { LayersSettingsComponent, LayersSettings } from '../layers-toggle/layers-toggle.component';
import { TimeOfDaySettingsComponent, TimeOfDaySettings } from '../time-of-day/time-of-day.component';
import { LatLng } from '../utils/map-utils';
import { SceneManagerService } from '../services/scene-manager.service';
import { TilesManagerService } from '../services/tiles-manager.service';
import { ModelTextureService } from '../services/model-texture.service';
import { AtmosphereService } from '../services/atmosphere.service';
import { CameraAnimationService } from '../services/camera-animation.service';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';

@Component({
	selector: 'app-viewer',
	imports: [AddressSearchComponent, LayersSettingsComponent, TimeOfDaySettingsComponent],
	templateUrl: './viewer.component.html',
	styleUrl: './viewer.component.css',
})
export class ViewerComponent {
	@ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;

	referenceDate = new Date(); // Now

	private sceneManager = inject(SceneManagerService);
	private tilesManager = inject(TilesManagerService);
	private buildingTexture = inject(ModelTextureService);
	private atmosphere = inject(AtmosphereService);
	private cameraAnimation = inject(CameraAnimationService);

	swisstopoWMTSCapabilities(): WMTSCapabilitiesResult | null {
		return this.tilesManager.swisstopoWMTSCapabilities();
	}

	async ngAfterViewInit() {
		const debugGui = new GUI({ width: 300 });
		debugGui.hide();
		const onDebugValueChange = () => (this.sceneManager.renderingNeedsUpdate = true);

		this.sceneManager.init(this.canvas.nativeElement);
		this.sceneManager.registerDebugControls(debugGui, onDebugValueChange);

		this.buildingTexture.init();

		this.sceneManager.earth.updateWorldMatrix(true, true);

		await this.atmosphere.init(this.sceneManager);
		this.atmosphere.registerDebugControls(debugGui, onDebugValueChange);

		await this.tilesManager.init(this.sceneManager, this.buildingTexture);
		this.tilesManager.registerDebugControls(debugGui, onDebugValueChange);

		this.cameraAnimation.init(this.sceneManager, this.tilesManager.getEllipsoid());

		this.sceneManager.startRenderLoop(() => {
			this.tilesManager.updateAllTiles();
			this.atmosphere.updateSunMoon(this.referenceDate);
		});
	}

	zoomTo(destination: { coords: google.maps.LatLng; elevation: number }): void {
		this.cameraAnimation.zoomTo(destination, () => this.tilesManager.resetGoogleDebugColorMode());
	}

	updateLayers($event: LayersSettings): void {
		this.tilesManager.updateLayers($event, this.referenceDate);
	}

	updateTimeOfDay($event: TimeOfDaySettings): void {
		if ($event.totalMinutes !== undefined) {
			const hour = Math.floor($event.totalMinutes / 60);
			const minute = $event.totalMinutes % 60;
			this.referenceDate.setHours(hour, minute, 0, 0);
			this.sceneManager.renderingNeedsUpdate = true;
		}
	}

	currentPositionLatLng(): LatLng {
		return this.cameraAnimation.currentPositionLatLng();
	}
}
