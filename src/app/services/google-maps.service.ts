import { Injectable } from '@angular/core';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { environment } from '../../environments/environment';
import { LatLng } from '../utils/map-utils';

@Injectable({
	providedIn: 'root',
})
export class GoogleMapsService {
	private googlePlacesService: Promise<google.maps.PlacesLibrary>;
	private googleGeocoder: Promise<google.maps.Geocoder>;
	private googleElevationService: Promise<google.maps.ElevationService>;

	constructor() {
		setOptions({
			key: environment.GOOGLE_MAPS_JAVASCRIPT_API_KEY,
			v: 'weekly',
			libraries: ['places', 'geocoding'],
		});
		this.googlePlacesService = importLibrary('places');
		this.googleGeocoder = importLibrary('geocoding').then(lib => new lib.Geocoder());
		this.googleElevationService = importLibrary('elevation').then(lib => new lib.ElevationService());
	}

	async findCoordsForAddress(address: string): Promise<google.maps.GeocoderResponse> {
		return (await this.googleGeocoder).geocode({ address });
	}

	async findSuggestionsForInput(
		input: string,
		origin: LatLng
	): Promise<{ suggestions: google.maps.places.AutocompleteSuggestion[] } | null> {
		return this.googlePlacesService.then(lib => {
			// TODO: Use proper session token for accurate billing.
			return lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
				input,
				origin: { lng: origin.lng, lat: origin.lat },
			}).catch(_error => null);
		});
	}

	async getElevationFor(coords: google.maps.LatLng): Promise<number> {
		return (await this.googleElevationService)
			.getElevationForLocations({ locations: [coords] })
			.then(response => response.results[0].elevation);
	}
}
