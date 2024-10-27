import { Component, EventEmitter, Output } from '@angular/core';
import { FormGroup, FormControl, ReactiveFormsModule } from '@angular/forms';
import { initFlowbite } from 'flowbite'

@Component({
  selector: 'layers-toggle',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './layers-toggle.component.html',
  styleUrl: './layers-toggle.component.scss'
})
export class LayersToggleComponent {
	@Output() selectedLayers = new EventEmitter<SelectedLayers>();

	layersTogglesForm = new FormGroup({
		googleTiles: new FormControl(true, {nonNullable: true}),
		swisstopoBuildingsTiles: new FormControl(false, {nonNullable: true}),
		swisstopoTlmTiles: new FormControl(false, {nonNullable: true}),
		swisstopoVegetationTiles: new FormControl(false, {nonNullable: true}),
		swisstopoNamesTiles: new FormControl(false, {nonNullable: true}),
	});

	constructor() {
		this.layersTogglesForm.valueChanges.subscribe((values) => {
			this.selectedLayers.emit({
				googleTiles: values.googleTiles?.valueOf(),
				swisstopoBuildingsTiles: values.swisstopoBuildingsTiles?.valueOf(),
				swisstopoTlmTiles: values.swisstopoTlmTiles?.valueOf(),
				swisstopoVegetationTiles: values.swisstopoVegetationTiles?.valueOf(),
				swisstopoNamesTiles: values.swisstopoNamesTiles?.valueOf(),
			});
		});
	}

    ngOnInit(): void {
        this.layersTogglesForm.reset({}, { emitEvent: true });
    }

	ngAfterViewInit() {
		initFlowbite();
	}
}

export interface SelectedLayers {
	googleTiles?: boolean;
	swisstopoBuildingsTiles?: boolean;
	swisstopoTlmTiles?: boolean;
	swisstopoVegetationTiles?: boolean;
	swisstopoNamesTiles?: boolean;
}