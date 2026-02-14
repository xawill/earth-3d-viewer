import { Component, EventEmitter, Output } from '@angular/core';
import { FormGroup, FormControl, ReactiveFormsModule } from '@angular/forms';
import { initFlowbite } from 'flowbite';

@Component({
	selector: 'layers-settings',
	imports: [ReactiveFormsModule],
	templateUrl: './layers-toggle.component.html',
	styleUrl: './layers-toggle.component.css',
})
export class LayersSettingsComponent {
	@Output() layersSettings = new EventEmitter<LayersSettings>();

	layersSettingsForm = new FormGroup({
		googleTiles: new FormControl(true, { nonNullable: true }),
		googleTilesOpacity: new FormControl(1, { nonNullable: true }),
		swisstopoBuildingsTiles: new FormControl(true, { nonNullable: true }),
		swisstopoVegetationTiles: new FormControl(false, { nonNullable: true }),
		adminOverlay: new FormControl(false, { nonNullable: true }),
	});

	constructor() {
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
	swisstopoVegetationTiles?: {
		enabled?: boolean;
	};
	adminOverlay?: {
		enabled?: boolean;
	};
}
