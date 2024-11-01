import { Component, EventEmitter, inject, Output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { GoogleGeocodingService } from '../services/google-geocoding.service';

@Component({
	selector: 'address-search',
	standalone: true,
	imports: [ReactiveFormsModule],
	templateUrl: './address-search.component.html',
	styleUrl: './address-search.component.scss',
})
export class AddressSearchComponent {
	@Output() searchedCoords = new EventEmitter<{ lon: number; lat: number }>();

	private googleGeocodingService = inject(GoogleGeocodingService);

	addressSearchForm = new FormGroup({
		address: new FormControl('', Validators.required),
	});

	onSearch() {
		if (this.addressSearchForm.value.address) {
			this.googleGeocodingService
				.convertAddressToCoords(this.addressSearchForm.value.address)
				.subscribe(coords => {
					if (coords) {
						this.searchedCoords.emit(coords);
					}
				});
		}
	}

	onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && event.currentTarget) {
			(event.currentTarget as HTMLElement).blur();
		}
	}
}
