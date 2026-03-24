import { Component, inject, input, output, signal, computed, effect } from '@angular/core';
import { LatLng } from '../utils/map-utils';
import { GoogleMapsService } from '../services/google-maps.service';

const INPUT_AUTOCOMPLETE_DEBOUNCE_TIME = 500; // [ms]
const MIN_INPUT_LENGTH_FOR_AUTOCOMPLETE = 3;

@Component({
	selector: 'address-search',
	imports: [],
	templateUrl: './address-search.component.html',
	styleUrl: './address-search.component.css',
})
export class AddressSearchComponent {
	private googleMapsService = inject(GoogleMapsService);

	searchedCoords = output<{ coords: google.maps.LatLng; elevation: number }>();

	originCoords = input<LatLng>({ lat: 0, lng: 0 });

	addressInput = signal('');
	suggestions = signal<google.maps.places.AutocompleteSuggestion[] | null>(null);
	isSearching = signal(false);
	isInputValid = computed(() => this.addressInput().trim().length >= MIN_INPUT_LENGTH_FOR_AUTOCOMPLETE);

	constructor() {
		// Watch address input changes for autocomplete
		effect((onCleanup) => {
			const input = this.addressInput();
			const originCoords = this.originCoords();

			let cancelled = false;
			const debounceTimer = setTimeout(async () => {
				try {
					const suggestionsResult = await this.googleMapsService.findSuggestionsForInput(
						input,
						originCoords
					);
					this.suggestions.set(suggestionsResult ? suggestionsResult.suggestions : null);
				} catch {
					this.suggestions.set(null);
				}
			}, INPUT_AUTOCOMPLETE_DEBOUNCE_TIME);

			onCleanup(() => {
				cancelled = true;
				clearTimeout(debounceTimer);
				this.suggestions.set(null);
			});
		});
	}

	selectSuggestion(suggestion: google.maps.places.AutocompleteSuggestion): void {
		if (suggestion.placePrediction && suggestion.placePrediction.mainText) {
			let selectedAddress = suggestion.placePrediction.mainText.text;
			if (suggestion.placePrediction.secondaryText) {
				selectedAddress = selectedAddress + ', ' + suggestion.placePrediction.secondaryText.text;
			}
			this.addressInput.set(selectedAddress);
			this.suggestions.set(null);
			this.search();
		}
	}

	search(): void {
		const address = this.addressInput().trim();
		if (address.length >= MIN_INPUT_LENGTH_FOR_AUTOCOMPLETE) {
			this.isSearching.set(true);
			this.googleMapsService
				.findCoordsForAddress(address)
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
					this.addressInput.set('');
					this.suggestions.set(null);
					this.isSearching.set(false);
				})
				.catch(_error => {
					this.isSearching.set(false);
				});
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
					this.addressInput.set('');
					this.suggestions.set(null);
					(event.currentTarget as HTMLElement).blur();
			}
		}
	}

	onInputChange(event: Event): void {
		const input = (event.target as HTMLInputElement).value;
		this.addressInput.set(input);
	}
}
