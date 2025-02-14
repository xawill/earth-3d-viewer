import { Component, EventEmitter, Output } from '@angular/core';
import { FormGroup, FormControl, ReactiveFormsModule } from '@angular/forms';
import { initFlowbite } from 'flowbite';

@Component({
	selector: 'layers-settings',
	imports: [ReactiveFormsModule],
	templateUrl: './layers-toggle.component.html',
	styleUrl: './layers-toggle.component.scss',
})
export class LayersSettingsComponent {
	@Output() layersSettings = new EventEmitter<LayersSettings>();

	layersSettingsForm = new FormGroup({
		googleTiles: new FormControl(true, { nonNullable: true }),
		googleTilesOpacity: new FormControl(1, { nonNullable: true }),
		swisstopoBuildingsTiles: new FormControl(false, { nonNullable: true }),
		swisstopoTlmTiles: new FormControl(false, { nonNullable: true }),
		swisstopoVegetationTiles: new FormControl(false, { nonNullable: true }),
		swisstopoNamesTiles: new FormControl(false, { nonNullable: true }),
		swisstopoOrthoimages: new FormControl(false, { nonNullable: true }),
	});

	constructor() {
		// Prevent 3D Tiles from being enabled when SWISSIMAGE is enabled
		this.layersSettingsForm.get('swisstopoOrthoimages')?.valueChanges.subscribe(enabled => {
			if (enabled) {
				this.layersSettingsForm.get('googleTiles')?.setValue(false);
				this.layersSettingsForm.get('swisstopoBuildingsTiles')?.setValue(false);
				this.layersSettingsForm.get('swisstopoTlmTiles')?.setValue(false);
				this.layersSettingsForm.get('swisstopoVegetationTiles')?.setValue(false);
				this.layersSettingsForm.get('swisstopoNamesTiles')?.setValue(false);
			}
		});

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
				swisstopoTlmTiles: {
					enabled: values.swisstopoTlmTiles?.valueOf(),
				},
				swisstopoVegetationTiles: {
					enabled: values.swisstopoVegetationTiles?.valueOf(),
				},
				swisstopoNamesTiles: {
					enabled: values.swisstopoNamesTiles?.valueOf(),
				},
				swisstopoOrthoimages: {
					enabled: values.swisstopoOrthoimages?.valueOf(),
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
}

export interface LayersSettings {
	googleTiles?: {
		enabled?: boolean;
		opacity?: number;
	};
	swisstopoBuildingsTiles?: {
		enabled?: boolean;
	};
	swisstopoTlmTiles?: {
		enabled?: boolean;
	};
	swisstopoVegetationTiles?: {
		enabled?: boolean;
	};
	swisstopoNamesTiles?: {
		enabled?: boolean;
	};
	swisstopoOrthoimages?: {
		enabled?: boolean;
	};
}
