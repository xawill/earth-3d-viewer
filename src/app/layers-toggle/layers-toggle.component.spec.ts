import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LayersSettingsComponent } from './layers-toggle.component';

describe('LayersToggleComponent', () => {
	let component: LayersSettingsComponent;
	let fixture: ComponentFixture<LayersSettingsComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [LayersSettingsComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(LayersSettingsComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
