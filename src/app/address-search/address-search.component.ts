import { Component, EventEmitter, Output, input } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, map, Observable, switchMap } from 'rxjs';
import { AsyncPipe } from '@angular/common';
import { Loader } from '@googlemaps/js-api-loader';
import { environment } from '../../environments/environment';
import { LatLng } from '../utils/map-utils';

const INPUT_AUTOCOMPLETE_DEBOUNCE_TIME = 500; // [ms]

@Component({
	selector: 'address-search',
	standalone: true,
	imports: [ReactiveFormsModule, AsyncPipe],
	templateUrl: './address-search.component.html',
	styleUrl: './address-search.component.scss',
})
export class AddressSearchComponent {
	private googlePlacesService: Promise<google.maps.PlacesLibrary>;
	private googleGeocoder: Promise<google.maps.Geocoder>;

	@Output() searchedCoords = new EventEmitter<google.maps.LatLng>();

	originCoord = input<LatLng>({ lat: 0, lng: 0 });

	addressSearchForm = new FormGroup({
		address: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
	});
	predictions$: Observable<google.maps.places.AutocompleteSuggestion[] | null>;

	constructor() {
		const loader = new Loader({
			apiKey: environment.GOOGLE_MAPS_JAVASCRIPT_API_KEY,
			version: 'weekly',
			libraries: ['places', 'geocoding'],
		});
		this.googlePlacesService = loader.importLibrary('places');
		this.googleGeocoder = loader.importLibrary('geocoding').then(lib => new lib.Geocoder());

		this.predictions$ = this.addressSearchForm.valueChanges.pipe(
			debounceTime(INPUT_AUTOCOMPLETE_DEBOUNCE_TIME),
			switchMap(values => {
				return this.googlePlacesService
					.then(lib => {
						if (values.address) {
							// TODO: Use proper session token for accurate billing.
							return lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
								input: values.address,
								origin: { lng: this.originCoord().lng, lat: this.originCoord().lat },
							});
						} else {
							return null;
						}
					})
					.catch(_error => {});
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
			this.googleGeocoder
				.then(geocoder => geocoder.geocode({ address: this.addressSearchForm.value.address }))
				.then(response => {
					if (response.results.length > 0) {
						this.searchedCoords.emit(response.results[0].geometry.location);
					}
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
