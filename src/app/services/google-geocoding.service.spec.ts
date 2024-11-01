import { TestBed } from '@angular/core/testing';

import { GoogleGeocodingService } from './google-geocoding.service';

describe('GoogleGeocodingService', () => {
	let service: GoogleGeocodingService;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		service = TestBed.inject(GoogleGeocodingService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
});
