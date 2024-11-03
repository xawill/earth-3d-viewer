import { Injectable } from '@angular/core';
import { Loader } from '@googlemaps/js-api-loader';
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
		const loader = new Loader({
			apiKey: environment.GOOGLE_MAPS_JAVASCRIPT_API_KEY,
			version: 'weekly',
			libraries: ['places', 'geocoding'],
		});
		this.googlePlacesService = loader.importLibrary('places');
		this.googleGeocoder = loader.importLibrary('geocoding').then(lib => new lib.Geocoder());
		this.googleElevationService = loader.importLibrary('elevation').then(lib => new lib.ElevationService());
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
