import { Component, EventEmitter, Output, inject, input } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, EMPTY, map, Observable, switchMap } from 'rxjs';
import { AsyncPipe } from '@angular/common';
import { LatLng } from '../utils/map-utils';
import { GoogleMapsService } from '../services/google-maps.service';

const INPUT_AUTOCOMPLETE_DEBOUNCE_TIME = 500; // [ms]

@Component({
    selector: 'address-search',
    imports: [ReactiveFormsModule, AsyncPipe],
    templateUrl: './address-search.component.html',
    styleUrl: './address-search.component.scss'
})
export class AddressSearchComponent {
	private googleMapsService = inject(GoogleMapsService);

	@Output() searchedCoords = new EventEmitter<{ coords: google.maps.LatLng; elevation: number }>();

	originCoords = input<LatLng>({ lat: 0, lng: 0 });

	addressSearchForm = new FormGroup({
		address: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
	});
	predictions$: Observable<google.maps.places.AutocompleteSuggestion[] | null>;

	constructor() {
		this.predictions$ = this.addressSearchForm.valueChanges.pipe(
			debounceTime(INPUT_AUTOCOMPLETE_DEBOUNCE_TIME),
			switchMap(values => {
				if (values.address) {
					return this.googleMapsService.findSuggestionsForInput(values.address, this.originCoords());
				} else {
					return EMPTY;
				}
			}),
			map(suggestions => (suggestions ? suggestions.suggestions : null))
		);
	}

	selectSuggestion(suggestion: google.maps.places.AutocompleteSuggestion): void {
		if (suggestion.placePrediction && suggestion.placePrediction.mainText) {
			let selectedAddress = suggestion.placePrediction.mainText.text;
			if (suggestion.placePrediction.secondaryText) {
				selectedAddress = selectedAddress + ', ' + suggestion.placePrediction.secondaryText.text;
			}
			this.addressSearchForm.controls.address.setValue(selectedAddress);
			this.search();
		}
	}

	search(): void {
		if (this.addressSearchForm.value.address) {
			this.googleMapsService
				.findCoordsForAddress(this.addressSearchForm.value.address)
				.then(response => {
					if (response.results.length > 0) {
						const coords = response.results[0].geometry.location;
						return Promise.all([coords, this.googleMapsService.getElevationFor(coords)]);
					} else {
						return Promise.reject();
					}
				})
				.then(([coords, elevation]) => {
					this.searchedCoords.emit({ coords, elevation });
					this.addressSearchForm.controls.address.reset();
				})
				.catch(_error => {});
		}
	}

	onKeydown(event: KeyboardEvent): void {
		if (event.currentTarget) {
			switch (event.key) {
				case 'Enter':
					this.search();
					(event.currentTarget as HTMLElement).blur();
					break;
				case 'Escape':
					(event.currentTarget as HTMLElement).blur();
			}
		}
	}
}
