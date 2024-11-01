import { Component, EventEmitter, Output } from '@angular/core';
import { FormGroup, FormControl, ReactiveFormsModule } from '@angular/forms';
import { initFlowbite } from 'flowbite';

@Component({
	selector: 'layers-settings',
	standalone: true,
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
	});

	constructor() {
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
}
