import { Component, input, output, signal, computed, effect } from '@angular/core';
import { initFlowbite } from 'flowbite';
import { WMTSCapabilitiesResult } from '3d-tiles-renderer/plugins';
import {
	DEFAULT_SWISSTOPO_BASE_LAYER,
	SWISSTOPO_BASE_LAYERS,
	SWISSTOPO_ADDITIONAL_LAYERS,
	DEFAULT_ADDITIONAL_LAYER_OPACITY,
} from '../config/tiles.config';

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
	selectedBaseLayer = signal(DEFAULT_SWISSTOPO_BASE_LAYER);
	selectedBaseTimeDimension = signal('current');
	selectedAdditionalLayer = signal<string | null>(null);
	selectedAdditionalLayerTimeDimension = signal('current');
	selectedAdditionalLayerOpacity = signal(DEFAULT_ADDITIONAL_LAYER_OPACITY);

	availableBaseLayers = computed(() => {
		const caps = this.swisstopoWMTSCapabilities();
		if (!caps?.layers) {
			return [];
		}
		return caps.layers.filter(layer => SWISSTOPO_BASE_LAYERS.includes(layer.identifier));
	});

	availableAdditionalLayers = computed(() => {
		const caps = this.swisstopoWMTSCapabilities();
		if (!caps?.layers) {
			return [];
		}
		return caps.layers.filter(layer => SWISSTOPO_ADDITIONAL_LAYERS.includes(layer.identifier));
	});

	availableTimeDimensionsForBaseLayer = computed(() => {
		const selectedLayer = this.selectedBaseLayer();
		if (!selectedLayer || !this.swisstopoWMTSCapabilities()?.layers) {
			return [];
		}

		const layer = this.availableBaseLayers()?.find(l => l.identifier === selectedLayer);
		if (!layer?.dimensions || layer.dimensions.length === 0) {
			return [];
		}

		const timeDimension = layer.dimensions.find(dim => dim.identifier === 'Time');
		if (!timeDimension?.values) {
			return [];
		}

		return timeDimension.values;
	});

	availableTimeDimensionsForAdditionalLayer = computed(() => {
		const selectedLayer = this.selectedAdditionalLayer();
		if (!selectedLayer) {
			return [];
		}
		return this.getTimeDimensionsForLayer(selectedLayer);
	});

	constructor() {
		// Update selected time dimension when layer or available time dimensions change
		effect(() => {
			this.swisstopoWMTSCapabilities();
			this.selectedBaseLayer();

			const currentTimeDimension = this.selectedBaseTimeDimension();
			const defaultTimeDimension = this.getDefaultTimeDimensionForLayer(this.selectedBaseLayer());
			const availableTimeDimensions = this.availableTimeDimensionsForBaseLayer();
			if (currentTimeDimension && !availableTimeDimensions.includes(currentTimeDimension)) {
				this.selectedBaseTimeDimension.set(defaultTimeDimension);
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
			this.selectedBaseLayer();
			this.selectedBaseTimeDimension();
			this.selectedAdditionalLayer();
			this.selectedAdditionalLayerTimeDimension();
			this.selectedAdditionalLayerOpacity();

			const additionalOverlay = this.selectedAdditionalLayer();
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
				swisstopoBaseOverlay: {
					layer: this.selectedBaseLayer(),
					timeDimension: this.selectedBaseTimeDimension(),
				},
				swisstopoAdditionalOverlay: additionalOverlay
					? {
							layer: additionalOverlay,
							timeDimension: this.selectedAdditionalLayerTimeDimension(),
							opacity: this.selectedAdditionalLayerOpacity(),
						}
					: undefined,
			});
		});
	}

	ngAfterViewInit() {
		initFlowbite();
	}

	private getTimeDimensionsForLayer(layerIdentifier: string): string[] {
		const caps = this.swisstopoWMTSCapabilities();
		if (!caps?.layers) {
			return [];
		}
		const layer = caps.layers.find(l => l.identifier === layerIdentifier);
		if (!layer?.dimensions || layer.dimensions.length === 0) {
			return [];
		}
		const timeDimension = layer.dimensions.find(dim => dim.identifier === 'Time');
		return timeDimension?.values ?? [];
	}

	private getDefaultTimeDimensionForLayer(layerIdentifier: string): string {
		const availableTimeDimensions = this.getTimeDimensionsForLayer(layerIdentifier);
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
	onBaseLayerChange(event: Event): void {
		const value = (event.target as HTMLSelectElement).value;
		this.selectedBaseLayer.set(value);
		this.selectedBaseTimeDimension.set(this.getDefaultTimeDimensionForLayer(value));
	}
	onBaseTimeDimensionChange(event: Event): void {
		const value = (event.target as HTMLSelectElement).value;
		this.selectedBaseTimeDimension.set(value);
	}
	onAdditionalOverlayChange(event: Event): void {
		const value = (event.target as HTMLSelectElement).value;
		if (value) {
			this.selectedAdditionalLayer.set(value);
			this.selectedAdditionalLayerTimeDimension.set(this.getDefaultTimeDimensionForLayer(value));
		} else {
			this.selectedAdditionalLayer.set(null);
		}
	}
	onAdditionalOverlayTimeDimensionChange(event: Event): void {
		const value = (event.target as HTMLSelectElement).value;
		this.selectedAdditionalLayerTimeDimension.set(value);
	}
	onAdditionalOverlayOpacityChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.selectedAdditionalLayerOpacity.set(+value);
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
	swisstopoBaseOverlay?: {
		layer: string;
		timeDimension: string;
	};
	swisstopoAdditionalOverlay?: {
		layer: string;
		timeDimension: string;
		opacity: number;
	};
}
