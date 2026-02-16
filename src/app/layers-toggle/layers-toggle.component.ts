import { Component, EventEmitter, Output, Input, computed, effect, input } from '@angular/core';
import { FormGroup, FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { initFlowbite } from 'flowbite';
import { WMTSCapabilitiesResult } from '3d-tiles-renderer/plugins';

@Component({
	selector: 'layers-settings',
	imports: [ReactiveFormsModule],
	templateUrl: './layers-toggle.component.html',
	styleUrl: './layers-toggle.component.css',
})
export class LayersSettingsComponent {
	@Output() layersSettings = new EventEmitter<LayersSettings>();
	swisstopoWMTSCapabilities = input<WMTSCapabilitiesResult | null>(null);

	private readonly SWISSTOPO_OVERLAY_AVAILABLE_LAYERS = [
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

	layersSettingsForm = new FormGroup({
		googleTiles: new FormControl(true, { nonNullable: true }),
		googleTilesOpacity: new FormControl(1, { nonNullable: true }),
		swisstopoBuildingsTiles: new FormControl(true, { nonNullable: true }),
		swisstopoVegetationTiles: new FormControl(false, { nonNullable: true }),
		adminOverlay: new FormControl(false, { nonNullable: true }),
		swisstopoOverlayLayer: new FormControl('ch.swisstopo.swissimage-product', { nonNullable: true }),
		swisstopoOverlayTimeDimension: new FormControl('current', { nonNullable: true }),
	});

	availableWMTSOverlayLayers = computed(() => {
		if (!this.swisstopoWMTSCapabilities()?.layers) {
			return [];
		}
		return this.swisstopoWMTSCapabilities()?.layers.filter(layer =>
			this.SWISSTOPO_OVERLAY_AVAILABLE_LAYERS.includes(layer.identifier)
		);
	});

	selectedWMTSOverlayLayer = toSignal(this.layersSettingsForm.get('swisstopoOverlayLayer')!.valueChanges, {
		initialValue: this.layersSettingsForm.get('swisstopoOverlayLayer')!.value,
	});

	availableTimeDimensionsForSelectedWMTSOverlayLayer = computed(() => {
		const selectedLayer = this.selectedWMTSOverlayLayer();
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
			this.selectedWMTSOverlayLayer();

			const currentTimeDimension = this.layersSettingsForm.get('swisstopoOverlayTimeDimension')?.value;
			const defaultTimeDimension = this.getDefaultTimeDimensionForLayer();
			const availableTimeDimensions = this.availableTimeDimensionsForSelectedWMTSOverlayLayer();
			if (currentTimeDimension && !availableTimeDimensions.includes(currentTimeDimension)) {
				this.layersSettingsForm
					.get('swisstopoOverlayTimeDimension')
					?.setValue(defaultTimeDimension, { emitEvent: true });
			}
		});
		/*this.layersSettingsForm.get('swisstopoOverlayLayer')!.valueChanges.subscribe(() => {
			const defaultTimeDimension = this.getDefaultTimeDimensionForLayer();
			this.layersSettingsForm
				.get('swisstopoOverlayTimeDimension')
				?.setValue(defaultTimeDimension, { emitEvent: true });
		});*/

		// Emit layers settings changes
		this.layersSettingsForm.valueChanges.subscribe(values => {
			this.layersSettings.emit({
				googleTiles: {
					enabled: values.googleTiles?.valueOf(),
					opacity: values.googleTilesOpacity?.valueOf(),
				},
				swisstopoBuildingsTiles: {
					enabled: values.swisstopoBuildingsTiles?.valueOf(),
				},
				swisstopoVegetationTiles: {
					enabled: values.swisstopoVegetationTiles?.valueOf(),
				},
				adminOverlay: {
					enabled: values.adminOverlay?.valueOf(),
				},
				swisstopoOverlay: {
					layer: values.swisstopoOverlayLayer?.valueOf(),
					timeDimension: values.swisstopoOverlayTimeDimension?.valueOf(),
				},
			});
		});
	}

	ngOnInit(): void {
		this.layersSettingsForm.reset({}, { emitEvent: true });
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

		// Otherwise, use the most recent year (last item in the array)
		return availableTimeDimensions[0];
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
