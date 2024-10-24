import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

const GOOGLE_GEOCODING_API_URL = "https://maps.googleapis.com/maps/api/geocode/json";

interface GoogleGeocodingResponse {
	results: {
		geometry: {
			location: {
				lat: number;
				lng: number;
			}
		}
	}[];
	status: "OK" | "ZERO_RESULTS" | "OVER_DAILY_LIMIT" | "OVER_QUERY_LIMIT" | "REQUEST_DENIED" | "INVALID_REQUEST" | "UNKNOWN_ERROR";
}

@Injectable({
  providedIn: 'root'
})
export class GoogleGeocodingService {

  constructor(private http: HttpClient) { }

  convertAddressToCoords(address: string): Observable<{lon:number, lat: number} | null> {
	return this.http.get<GoogleGeocodingResponse>(GOOGLE_GEOCODING_API_URL, {params: {address: encodeURIComponent(address), key: environment.GOOGLE_MAPS_API_KEY}}).pipe(map((response) => {
		if (response.results.length > 0) {
			return {lon: response.results[0].geometry.location.lng, lat: response.results[0].geometry.location.lat};
		} else {
			return null;
		}
	}));
  }
}
