import { Component, computed, effect, ElementRef, HostListener, inject, signal, ViewChild } from '@angular/core';
import { WMTSCapabilitiesResult } from '3d-tiles-renderer/plugins';
import { Raycaster, Vector2 } from 'three';
import { AddressSearchComponent } from '../address-search/address-search.component';
import { LayersSettingsComponent, LayersSettings } from '../layers-toggle/layers-toggle.component';
import { TimeOfDaySettingsComponent, TimeOfDaySettings } from '../time-of-day/time-of-day.component';
import { LatLng } from '../utils/map-utils';
import { SceneManagerService } from '../services/scene-manager.service';
import { TilesManagerService } from '../services/tiles-manager.service';
import { ModelTextureService } from '../services/model-texture.service';
import { AtmosphereService } from '../services/atmosphere.service';
import { CameraAnimationService } from '../services/camera-animation.service';
import { buildBuildingDisplayRows, buildDwellingSummary, HighlightedBuildingInfo } from './building-info.presenter';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';

@Component({
	selector: 'app-viewer',
	imports: [AddressSearchComponent, LayersSettingsComponent, TimeOfDaySettingsComponent],
	templateUrl: './viewer.component.html',
	styleUrl: './viewer.component.css',
})
export class ViewerComponent {
	@ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;

	private readonly CLICK_THRESHOLD_AREA = 25; // 5x5 px

	referenceDate = new Date(); // Now

	highlightedBuildingInfo = signal<HighlightedBuildingInfo | null>(null);
	highlightedBuildingDisplayRows = computed(() => {
		const buildingInfo = this.highlightedBuildingInfo();
		if (!buildingInfo) return [];
		return buildBuildingDisplayRows(buildingInfo);
	});
	dwellingSummaries = computed(() => {
		const dwellings = this.highlightedBuildingInfo()?.rbdData?.dwellings;
		if (!dwellings?.length) return [];
		return dwellings
			.map(d => ({ ewid: d.ewid, summary: buildDwellingSummary(d) }))
			.sort((a, b) => (a.ewid && b.ewid ? a.ewid.localeCompare(b.ewid) : 0));
	});

	private raycaster = new Raycaster();
	private pointer = new Vector2();

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

		// Track pointer across the entire document so clicks on the building-info panel are also caught.
		document.addEventListener('pointerdown', (event: PointerEvent) => {
			this.pointer.set(event.clientX, event.clientY);
		});
		this.canvas.nativeElement.addEventListener('pointerup', async (event: PointerEvent) => {
			// this.pointer holds position of pointerdown
			const dx = event.clientX - this.pointer.x;
			const dy = event.clientY - this.pointer.y;
			if (dx * dx + dy * dy > this.CLICK_THRESHOLD_AREA) return; // Was a drag

			// It's a click on the canvas —> try to select a building
			this.pointer.set(
				(event.clientX / window.innerWidth) * 2 - 1,
				-(event.clientY / window.innerHeight) * 2 + 1
			);
			this.raycaster.setFromCamera(this.pointer, this.sceneManager.camera);

			const buildingInfo = await this.tilesManager.getHighlightedBuildingInfo(this.raycaster);
			if (buildingInfo) {
				this.highlightedBuildingInfo.set(buildingInfo);
				this.buildingTexture.setHighlightedBuilding(buildingInfo.batchId, buildingInfo.tileOffset);
				this.sceneManager.renderingNeedsUpdate = true;
			} else {
				this.closeBuildingInfo();
			}
		});

		this.sceneManager.startRenderLoop(() => {
			this.tilesManager.updateAllTiles();
			this.atmosphere.updateSunMoon(this.referenceDate);
		});
	}

	@HostListener('document:keydown')
	closeBuildingInfo(): void {
		this.highlightedBuildingInfo.set(null);
		this.buildingTexture.setHighlightedBuilding(-1, -1);
		this.sceneManager.renderingNeedsUpdate = true;
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
