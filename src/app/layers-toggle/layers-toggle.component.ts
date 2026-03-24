import { Component, input, output, signal, computed, effect } from '@angular/core';
import { initFlowbite } from 'flowbite';
import { WMTSCapabilitiesResult } from '3d-tiles-renderer/plugins';

const SWISSTOPO_OVERLAY_AVAILABLE_LAYERS = [
	'ch.swisstopo.swissimage-product',
	'ch.swisstopo.pixelkarte-farbe-pk25.noscale',
	'ch.bazl.luftfahrtkarten-icao',
	'ch.bfs.volkszaehlung-bevoelkerungsstatistik_einwohner',
	'ch.bafu.tranquillity-karte',
	//'ch.bafu.gefaehrdungskarte-oberflaechenabfluss',
	//'ch.bafu.laerm-strassenlaerm_nacht',
	//'ch.pronatura.naturschutzgebiete',
	//'ch.are.erreichbarkeit-oev',
	//'ch.swisstopo.swisstlm3d-wanderwege',
	//'ch.bazl.einschraenkungen-drohnen',
	//'ch.are.reisezeit-agglomerationen-oev',
	//'ch.bafu.schutzgebiete-luftfahrt',
	//'ch.bfe.ladebedarfswelt-fahrzeuge',
	//'ch.bfe.fernwaerme-nachfrage_wohn_dienstleistungsgebaeude',
	//'ch.bfe.solarenergie-eignung-daecher',
	//'ch.bakom.anschlussart-glasfaser',
	//'ch.bakom.standorte-mobilfunkanlagen',
	//'ch.vbs.panzerverschiebungsrouten',
	//'ch.blw.bewaesserungsbeduerftigkeit',
	//'ch.bfs.betriebszaehlungen-beschaeftigte_vollzeitaequivalente',
];
const DEFAULT_SWISSTOPO_OVERLAY_LAYER = 'ch.swisstopo.swissimage-product';

@Component({
	selector: 'layers-settings',
	imports: [],
	templateUrl: './layers-toggle.component.html',
	styleUrl: './layers-toggle.component.css',
})
export class LayersSettingsComponent {
	layersSettings = output<LayersSettings>();

	swisstopoWMTSCapabilities = input<WMTSCapabilitiesResult | null>(null);

	googleTilesEnabled = signal(true);
	googleTilesOpacity = signal(1);
	swisstopoBuildingsTilesEnabled = signal(true);
	swisstopoVegetationTilesEnabled = signal(false);
	adminOverlayEnabled = signal(false);
	selectedOverlayLayer = signal(DEFAULT_SWISSTOPO_OVERLAY_LAYER);
	selectedTimeDimension = signal('current');

	availableWMTSOverlayLayers = computed(() => {
		const caps = this.swisstopoWMTSCapabilities();
		if (!caps?.layers) {
			return [];
		}
		return caps.layers.filter(layer => SWISSTOPO_OVERLAY_AVAILABLE_LAYERS.includes(layer.identifier));
	});

	availableTimeDimensionsForSelectedWMTSOverlayLayer = computed(() => {
		const selectedLayer = this.selectedOverlayLayer();
		if (!selectedLayer || !this.swisstopoWMTSCapabilities()?.layers) {
			return [];
		}

		const layer = this.availableWMTSOverlayLayers()?.find(l => l.identifier === selectedLayer);
		if (!layer?.dimensions || layer.dimensions.length === 0) {
			return [];
		}

		const timeDimension = layer.dimensions.find(dim => dim.identifier === 'Time');
		if (!timeDimension?.values) {
			return [];
		}

		return timeDimension.values;
	});

	constructor() {
		// Update selected time dimension when layer or available time dimensions change
		effect(() => {
			this.swisstopoWMTSCapabilities();
			this.selectedOverlayLayer();

			const currentTimeDimension = this.selectedTimeDimension();
			const defaultTimeDimension = this.getDefaultTimeDimensionForLayer();
			const availableTimeDimensions = this.availableTimeDimensionsForSelectedWMTSOverlayLayer();
			if (currentTimeDimension && !availableTimeDimensions.includes(currentTimeDimension)) {
				this.selectedTimeDimension.set(defaultTimeDimension);
			}
		});

		// Emit aggregated layers settings when any signal changes
		effect(() => {
			// Access all signals to track when any of them change
			this.googleTilesEnabled();
			this.googleTilesOpacity();
			this.swisstopoBuildingsTilesEnabled();
			this.swisstopoVegetationTilesEnabled();
			this.adminOverlayEnabled();
			this.selectedOverlayLayer();
			this.selectedTimeDimension();

			this.layersSettings.emit({
				googleTiles: {
					enabled: this.googleTilesEnabled(),
					opacity: this.googleTilesOpacity(),
				},
				swisstopoBuildingsTiles: {
					enabled: this.swisstopoBuildingsTilesEnabled(),
				},
				swisstopoVegetationTiles: {
					enabled: this.swisstopoVegetationTilesEnabled(),
				},
				adminOverlay: {
					enabled: this.adminOverlayEnabled(),
				},
				swisstopoOverlay: {
					layer: this.selectedOverlayLayer(),
					timeDimension: this.selectedTimeDimension(),
				},
			});
		});
	}

	ngAfterViewInit() {
		initFlowbite();
	}

	private getDefaultTimeDimensionForLayer(): string {
		const availableTimeDimensions = this.availableTimeDimensionsForSelectedWMTSOverlayLayer();
		if (availableTimeDimensions.length === 0) {
			return 'current';
		}

		// If 'current' is available, use it
		if (availableTimeDimensions.includes('current')) {
			return 'current';
		}

		// Otherwise, use the most recent year (first item in the array)
		return availableTimeDimensions[0];
	}

	// Event handlers for template
	onGoogleTilesToggle(event: Event): void {
		const checked = (event.target as HTMLInputElement).checked;
		this.googleTilesEnabled.set(checked);
	}
	onGoogleTilesOpacityChange(event: Event) {
		const value = (event.target as HTMLSelectElement).value;
		this.googleTilesOpacity.set(+value);
	}
	onBuildingsTilesToggle(event: Event): void {
		const checked = (event.target as HTMLInputElement).checked;
		this.swisstopoBuildingsTilesEnabled.set(checked);
	}
	onVegetationTilesToggle(event: Event): void {
		const checked = (event.target as HTMLInputElement).checked;
		this.swisstopoVegetationTilesEnabled.set(checked);
	}
	onAdminOverlayToggle(event: Event): void {
		const checked = (event.target as HTMLInputElement).checked;
		this.adminOverlayEnabled.set(checked);
	}
	onOverlayLayerChange(event: Event): void {
		const value = (event.target as HTMLSelectElement).value;
		this.selectedOverlayLayer.set(value);
	}
	onTimeDimensionChange(event: Event): void {
		const value = (event.target as HTMLSelectElement).value;
		this.selectedTimeDimension.set(value);
	}
}

export interface LayersSettings {
	googleTiles?: {
		enabled?: boolean;
		opacity?: number;
	};
	swisstopoBuildingsTiles?: {
		enabled?: boolean;
	};
	swisstopoVegetationTiles?: {
		enabled?: boolean;
	};
	adminOverlay?: {
		enabled?: boolean;
	};
	swisstopoOverlay?: {
		layer?: string;
		timeDimension?: string;
	};
}
